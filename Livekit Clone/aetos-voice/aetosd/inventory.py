"""Component inventory: every folder with a component.yaml is a component. Two runtimes:
  local  — one venv per component (dependency isolation without Docker), PID + log under ~/.aetos
  docker — one container per component (compose.yaml), same manifests
Both use the same health probe (gRPC Provider/Health or HTTP /healthz) and the same upgrade flow."""
from __future__ import annotations
import os, sys, json, time, signal, subprocess, pathlib, shutil, urllib.request, yaml

ROOT   = pathlib.Path(os.environ.get("AETOS_ROOT", pathlib.Path(__file__).resolve().parents[1]))
STATE  = pathlib.Path(os.environ.get("AETOS_STATE", os.path.expanduser("~/.aetos")))
RUN    = pathlib.Path(os.environ.get("AETOS_RUN", "/run/aetos"))
LOGS   = STATE / "logs"; PIDS = STATE / "pids"; VENVS = STATE / "venvs"; HIST = STATE / "history"
for d in (LOGS, PIDS, VENVS, HIST): d.mkdir(parents=True, exist_ok=True)
try: RUN.mkdir(parents=True, exist_ok=True)
except PermissionError:
    RUN = STATE / "run"; RUN.mkdir(parents=True, exist_ok=True); os.environ["AETOS_RUN"] = str(RUN)

def discover() -> dict[str, dict]:
    out = {}
    for y in sorted(ROOT.glob("**/component.yaml")):
        if any(p in y.parts for p in (".git", "node_modules", "venvs")): continue
        m = yaml.safe_load(y.read_text()) or {}; m["_dir"] = str(y.parent); out[m["name"]] = m
    return out

def _pidfile(n): return PIDS / f"{n}.pid"
def pid_of(n) -> int | None:
    try:
        pid = int(_pidfile(n).read_text()); os.kill(pid, 0); return pid
    except Exception: return None

def _env(m):
    e = os.environ.copy()
    e.update({"AETOS_MANIFEST": str(srcdir(m)/"component.yaml"), "AETOS_RUN": str(RUN),
              "AETOS_SOCKET": str(vsock(m)), "AETOS_MODELS": str(STATE / "models" / m["name"]),
              "AETOS_STATE": str(STATE), "PYTHONUNBUFFERED": "1"})
    return e

def vsock(m) -> pathlib.Path:
    """Each running version binds its OWN socket file; the canonical <name>.sock is a symlink to it.
    That makes the swap atomic and lets the old process unlink its own file on drain without touching the new one."""
    return RUN / f"{m['name']}@{m['version']}.sock"
def csock(m) -> pathlib.Path: return RUN / f"{m['name']}.sock"
def _point(m):
    tmp = RUN / f".{m['name']}.link"; 
    if tmp.is_symlink() or tmp.exists(): tmp.unlink()
    os.symlink(vsock(m).name, tmp); os.replace(tmp, csock(m))
def _hist_write(m, prev):
    (HIST / f"{m['name']}.json").write_text(json.dumps({"version": m["version"], "prev": prev, "ts": time.time()}))
def _hist(m):
    try: return json.loads((HIST / f"{m['name']}.json").read_text())
    except Exception: return None

def venv_for(m) -> pathlib.Path:
    """One venv AND one source snapshot per name@version. A version is immutable once installed —
    that is what makes rollback real in local mode (docker mode gets this from the image digest)."""
    v = VENVS / f"{m['name']}@{m['version']}"; src = v / "src"
    if not (v / "bin" / "python").exists():
        subprocess.run([sys.executable, "-m", "venv", str(v)], check=True)
        d = pathlib.Path(m["_dir"])
        shutil.copytree(d, src, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc", "node_modules", ".venv"), dirs_exist_ok=True)
        # sibling relative deps (e.g. "-e ../_sdk") must resolve inside the snapshot
        for sib in ("_sdk",):
            if (d.parent / sib).exists(): shutil.copytree(d.parent / sib, src.parent / sib, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
        pip = [str(v/"bin"/"pip"), "install", "-q", "--disable-pip-version-check"]
        if (src/"requirements.txt").exists(): subprocess.run(pip + ["-r", "requirements.txt"], check=True, cwd=src)
        elif (src/"pyproject.toml").exists(): subprocess.run(pip + ["-e", "."], check=True, cwd=src)
    return v
def srcdir(m) -> pathlib.Path:
    s = VENVS / f"{m['name']}@{m['version']}" / "src"
    return s if s.exists() else pathlib.Path(m["_dir"])

def start(m) -> dict:
    n = m["name"]
    if pid_of(n): return {"ok": True, "already": True}
    if m.get("runtime", "python") != "python": return {"ok": False, "error": f"runtime {m['runtime']} needs docker mode"}
    v = venv_for(m); cmd = m["entrypoint"].split()
    if cmd[0] in ("python", "python3"): cmd[0] = str(v/"bin"/"python")
    elif (v/"bin"/cmd[0]).exists(): cmd[0] = str(v/"bin"/cmd[0])
    log = open(LOGS / f"{n}.log", "ab")
    p = subprocess.Popen(cmd, cwd=srcdir(m), env=_env(m), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    _pidfile(n).write_text(str(p.pid))
    if m.get("kind","").startswith("provider/") and m["kind"] != "provider/llm": _point(m)
    h = _hist(m)
    if not h or h.get("version") != m["version"]: _hist_write(m, h)
    return {"ok": True, "pid": p.pid}

def stop(m, grace=15) -> dict:
    n = m["name"]; pid = pid_of(n)
    if not pid: return {"ok": True, "already": True}
    os.killpg(os.getpgid(pid), signal.SIGTERM)
    for _ in range(grace*10):
        if not pid_of(n): break
        time.sleep(0.1)
    else: os.killpg(os.getpgid(pid), signal.SIGKILL)
    _pidfile(n).unlink(missing_ok=True); return {"ok": True}

def health(m) -> dict:
    n = m["name"]; kind = m.get("kind", "")
    if kind.startswith("provider/") and kind != "provider/llm":
        return _grpc_health(str(csock(m)))
    port = m.get("port")
    if port:
        for path in ("/healthz", "/health/liveliness", "/health"):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=1.5) as r:
                    if r.status < 500: return {"state": "ready", "detail": f"http {r.status}"}
            except Exception as e: err = str(e)
        return {"state": "down" if not pid_of(n) else "loading", "detail": err[:80]}
    return {"state": "ready" if pid_of(n) else "down", "detail": "process"}

def _grpc_health(sock) -> dict:
    try:
        import grpc; from . import provider_pb2 as pb, provider_pb2_grpc as rpc
        t0 = time.perf_counter()
        with grpc.insecure_channel(f"unix:{sock}") as ch:
            s = rpc.ProviderStub(ch); h = s.Health(pb.Empty(), timeout=1.5); v = s.Version(pb.Empty(), timeout=1.5)
            return {"state": pb.HealthStatus.State.Name(h.state).lower(), "detail": h.detail, "rtt_ms": round((time.perf_counter()-t0)*1000, 1),
                    "engine": v.version, "sdk": v.sdk, "model": v.model, "contracts": list(v.contracts)}
    except Exception as e:
        return {"state": "down", "detail": str(e).split("\n")[0][:80]}

def status(m) -> dict:
    h = health(m)
    return {"name": m["name"], "kind": m.get("kind"), "version": m.get("version"), "contracts": m.get("contracts", {}),
            "runtime": m.get("runtime", "python"), "pid": pid_of(m["name"]), "socket": str(RUN / f"{m['name']}.sock") if m.get("kind","").startswith("provider/") else None,
            "port": m.get("port"), "gpu": m.get("gpu", False), "resources": m.get("resources", {}), "model": (m.get("models") or [{}])[0].get("name", ""),
            "health": h, "log": str(LOGS / f"{m['name']}.log"), "update_available": _update_available(m)}

def _update_available(m):
    """A newer folder version than what's running (history). Real deployments compare against the registry index."""
    hist = HIST / f"{m['name']}.json"
    try:
        prev = json.loads(hist.read_text()); return None if prev.get("version") == m["version"] else m["version"]
    except Exception: return None

# ---- upgrade / rollback (local mode) ----
def upgrade(m) -> dict:
    """Health-gated swap. New version gets its own venv and its own socket file, starts beside the old one,
    must report READY, then the canonical symlink is atomically repointed. Old process drains and exits."""
    n = m["name"]; prev = _hist(m)
    if prev and prev.get("version") == m["version"] and pid_of(n): return {"ok": True, "already": m["version"]}
    venv_for(m)                                   # 1. own deps; old venv untouched = instant rollback
    is_grpc = m.get("kind","").startswith("provider/") and m["kind"] != "provider/llm"
    v = VENVS / f"{n}@{m['version']}"; cmd = m["entrypoint"].split()
    if cmd[0] in ("python","python3"): cmd[0] = str(v/"bin"/"python")
    elif (v/"bin"/cmd[0]).exists(): cmd[0] = str(v/"bin"/cmd[0])
    log = open(LOGS / f"{n}.log", "ab")
    p = subprocess.Popen(cmd, cwd=srcdir(m), env=_env(m), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)   # 2. beside old
    deadline = time.time() + float(m.get("warmup_timeout_s", 120))                                                        # 3. health gate
    while time.time() < deadline:
        h = _grpc_health(str(vsock(m))) if is_grpc else ({"state": "ready"} if p.poll() is None else {"state": "down"})
        if h.get("state") == "ready": break
        if p.poll() is not None: break
        time.sleep(0.5)
    else: h = {"state": "timeout"}
    if h.get("state") != "ready":
        try: os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except ProcessLookupError: pass
        return {"ok": False, "error": f"new version never became ready ({h.get('state')}) — old version untouched"}
    old_pid = pid_of(n)
    if is_grpc: _point(m)                                                                                                  # 4. atomic repoint
    _pidfile(n).write_text(str(p.pid))
    if old_pid:
        try: os.killpg(os.getpgid(old_pid), signal.SIGTERM)                                                                 # 5. drain (AETOS_DRAIN_S)
        except ProcessLookupError: pass
    _hist_write(m, prev)                                                                                                    # 6. keep previous for rollback
    return {"ok": True, "from": (prev or {}).get("version"), "to": m["version"], "pid": p.pid, "warm_s": round(float(m.get("warmup_timeout_s",120)) - (deadline-time.time()), 1)}

def rollback(m) -> dict:
    n = m["name"]; hist = HIST / f"{n}.json"
    if not hist.exists() or not json.loads(hist.read_text()).get("prev"): return {"ok": False, "error": "nothing to roll back to"}
    prev = json.loads(hist.read_text())["prev"]; m2 = dict(m, version=prev["version"])
    # the previous venv still exists (never deleted on upgrade), so this is start-beside + swap, no install
    r = upgrade(m2); r["rolled_back_to"] = prev["version"]; return r
