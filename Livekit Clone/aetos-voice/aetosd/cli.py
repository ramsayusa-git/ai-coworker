import sys, json, argparse
from . import inventory as inv
from .server import serve

def main():
    ap = argparse.ArgumentParser("aetosd", description="Aetos component supervisor")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ls"); sub.add_parser("serve").add_argument("--port", type=int, default=8110)
    for c in ("start","stop","restart","status","upgrade","rollback","logs"):
        sub.add_parser(c).add_argument("name")
    sub.add_parser("up").add_argument("names", nargs="*")
    a = ap.parse_args(); comps = inv.discover()
    if a.cmd == "serve": return serve(a.port)
    if a.cmd == "ls":
        for s in (inv.status(m) for m in comps.values()):
            print(f"{s['name']:<16} {s['kind'] or '':<14} {s['version']:<9} {s['health']['state']:<8} pid={s['pid'] or '-'}  {s['health'].get('detail','')[:50]}")
        return
    if a.cmd == "up":
        for n in (a.names or [k for k,m in comps.items() if m.get('kind','').startswith(('provider/','core','supervisor')) and m['name']!='aetosd']):
            print(n, inv.start(comps[n]))
        return
    m = comps.get(a.name) or sys.exit(f"unknown component {a.name}")
    if a.cmd == "logs": print(open(inv.LOGS/f"{a.name}.log").read()[-4000:]); return
    if a.cmd == "restart": inv.stop(m); print(inv.start(m)); return
    print(json.dumps({"start":inv.start,"stop":inv.stop,"status":inv.status,"upgrade":inv.upgrade,"rollback":inv.rollback}[a.cmd](m), indent=1, default=str))
