from __future__ import annotations
import asyncio, os, signal, sys, time, logging, pathlib
from typing import AsyncIterator, Iterable
import grpc, yaml
from . import provider_pb2 as pb, provider_pb2_grpc as rpc

log = logging.getLogger("aetos.provider")

def load_manifest(path: str | os.PathLike | None = None) -> dict:
    p = pathlib.Path(path or os.environ.get("AETOS_MANIFEST", "component.yaml"))
    return yaml.safe_load(p.read_text()) if p.exists() else {}

class Provider:
    """Common Provider service. Subclasses set name/version/sdk/model and override caps()."""
    name = "provider"; version = "0.0.0"; sdk = ""; model = ""; contracts = [1]
    def __init__(self):
        self._state = pb.HealthStatus.LOADING; self._detail = "starting"
    def set_ready(self, detail="ok"): self._state, self._detail = pb.HealthStatus.READY, detail
    def set_degraded(self, detail): self._state, self._detail = pb.HealthStatus.DEGRADED, detail
    def caps(self) -> pb.Caps: return pb.Caps(streaming=True, sample_rates=[16000, 24000])
    async def warmup(self): """Load models, open vendor sockets. Health stays LOADING until this returns."""
    # gRPC handlers
    async def Health(self, request, context): return pb.HealthStatus(state=self._state, detail=self._detail)
    async def Capabilities(self, request, context): return self.caps()
    async def Version(self, request, context):
        return pb.VersionInfo(name=self.name, version=self.version, sdk=self.sdk, model=self.model, contracts=self.contracts)

class SttProvider(Provider):
    async def transcribe(self, cfg: pb.SttConfig, frames: AsyncIterator[pb.AudioFrame]) -> AsyncIterator[pb.SttEvent]:
        raise NotImplementedError
        yield  # pragma: no cover
    async def Stream(self, request_iterator, context):
        first = await request_iterator.__anext__()
        if not first.HasField("config"):
            yield pb.SttEvent(kind=pb.SttEvent.ERROR, error="first message must be config"); return
        async def frames():
            async for req in request_iterator:
                if req.HasField("frame"): yield req.frame
                elif req.HasField("flush"): return
        async for ev in self.transcribe(first.config, frames()): yield ev

class TtsProvider(Provider):
    async def synthesize(self, cfg: pb.TtsConfig, text: AsyncIterator[str]) -> AsyncIterator[pb.AudioFrame]:
        raise NotImplementedError
        yield  # pragma: no cover
    async def Synthesize(self, request_iterator, context):
        first = await request_iterator.__anext__()
        if not first.HasField("config"):
            return
        async def chunks():
            async for req in request_iterator:
                if req.HasField("text"): yield req.text
                elif req.HasField("flush"): return
        async for fr in self.synthesize(first.config, chunks()): yield fr

def _socket_path(manifest: dict) -> str:
    return os.environ.get("AETOS_SOCKET") or manifest.get("socket") or f"/run/aetos/{manifest.get('name','provider')}.sock"

async def _serve(impl: Provider, manifest: dict):
    server = grpc.aio.server(options=[("grpc.max_receive_message_length", 8 * 1024 * 1024)])
    rpc.add_ProviderServicer_to_server(impl, server)
    if isinstance(impl, SttProvider): rpc.add_SttServicer_to_server(impl, server)
    if isinstance(impl, TtsProvider): rpc.add_TtsServicer_to_server(impl, server)
    sock = _socket_path(manifest)
    tcp = os.environ.get("AETOS_TCP")  # optional, dev only — never on the audio path in prod
    if tcp: server.add_insecure_port(tcp)
    pathlib.Path(sock).parent.mkdir(parents=True, exist_ok=True)
    if os.path.exists(sock): os.unlink(sock)
    server.add_insecure_port(f"unix:{sock}")
    await server.start()
    log.info("%s %s listening on unix:%s%s", impl.name, impl.version, sock, f" and {tcp}" if tcp else "")
    t0 = time.time()
    try:
        await impl.warmup(); impl.set_ready(f"warm in {time.time()-t0:.1f}s")
        log.info("%s ready (%s)", impl.name, impl._detail)
    except Exception as e:  # keep serving so health reports the failure
        impl._state, impl._detail = pb.HealthStatus.DOWN, f"warmup failed: {e}"; log.exception("warmup failed")
    stop = asyncio.Event()
    for s in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(s, stop.set)
    await stop.wait()
    log.info("draining %s", impl.name); await server.stop(grace=float(os.environ.get("AETOS_DRAIN_S", "600")))

def serve(impl: Provider, manifest: dict | None = None):
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")
    m = manifest or load_manifest()
    for k in ("name", "version"):
        if m.get(k): setattr(impl, k, str(m[k]))
    asyncio.run(_serve(impl, m))
