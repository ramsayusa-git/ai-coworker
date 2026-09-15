"""The ONLY provider plugin in the worker. Speaks provider-api v1 over a unix socket to whichever sidecar
the agent's pipeline names. Vendor SDKs never enter this process.

Implements livekit-agents 1.x STT/TTS interfaces (stream-based)."""
from __future__ import annotations
import asyncio, os, time, logging
import grpc
from livekit import rtc
from livekit.agents import stt, tts, utils, APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from . import provider_pb2 as pb, provider_pb2_grpc as rpc

log = logging.getLogger("aetos.remote")
RUN_DIR = os.environ.get("AETOS_RUN", "/run/aetos")

def _channel(name: str) -> grpc.aio.Channel:
    target = f"unix:{RUN_DIR}/{name}.sock"
    return grpc.aio.insecure_channel(target, options=[("grpc.keepalive_time_ms", 20000)])

class _Lazy:
    """grpc.aio channels are bound to the loop they are created on; the worker constructs plugins before the
    job loop exists, so the channel is created on first use, per loop."""
    def __init__(self, name, stub_cls): self._name, self._cls, self._by_loop = name, stub_cls, {}
    def __call__(self):
        loop = asyncio.get_running_loop()
        if loop not in self._by_loop: self._by_loop[loop] = self._cls(_channel(self._name))
        return self._by_loop[loop]

# ---------------- STT ----------------
class RemoteSTT(stt.STT):
    def __init__(self, provider: str, *, language: str = "en", sample_rate: int = 16000, model: str = ""):
        super().__init__(capabilities=stt.STTCapabilities(streaming=True, interim_results=True))
        self._name, self.language, self.sample_rate, self._model = provider, language, sample_rate, model
        self._stub = _Lazy(provider, rpc.SttStub)
    @property
    def provider(self) -> str: return self._name
    @property
    def model(self) -> str: return self._model or "default"
    @property
    def label(self) -> str: return f"aetos.remote.{self._name}"
    async def _recognize_impl(self, buffer, *, language=NOT_GIVEN, conn_options=DEFAULT_API_CONNECT_OPTIONS):
        # batch path: push the whole buffer through the stream and return the FINAL
        st = self.stream(language=language, conn_options=conn_options)
        for fr in (buffer if isinstance(buffer, list) else [buffer]): st.push_frame(fr)
        st.end_input(); final = None
        async for ev in st:
            if ev.type == stt.SpeechEventType.FINAL_TRANSCRIPT: final = ev
        await st.aclose(); return final or stt.SpeechEvent(type=stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives=[stt.SpeechData(language=self.language, text="")])
    def stream(self, *, language=NOT_GIVEN, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> "RemoteSTTStream":
        return RemoteSTTStream(self, conn_options=conn_options, language=language if language is not NOT_GIVEN else self.language)

class RemoteSTTStream(stt.SpeechStream):
    def __init__(self, parent: RemoteSTT, *, conn_options, language: str):
        super().__init__(stt=parent, conn_options=conn_options, sample_rate=parent.sample_rate)
        self._p = parent; self._language = language
    async def _run(self) -> None:
        p = self._p
        async def requests():
            yield pb.SttRequest(config=pb.SttConfig(language=self._language, model=p._model, sample_rate=p.sample_rate, interim=True))
            async for data in self._input_ch:
                if isinstance(data, rtc.AudioFrame):
                    yield pb.SttRequest(frame=pb.AudioFrame(pcm16=bytes(data.data), sample_rate=data.sample_rate, channels=data.num_channels, ts_ms=int(time.time()*1000)))
                elif isinstance(data, self._FlushSentinel):
                    yield pb.SttRequest(flush=True)
        t_last_audio = time.time()
        async for ev in p._stub().Stream(requests()):
            if ev.kind == pb.SttEvent.INTERIM:
                self._event_ch.send_nowait(stt.SpeechEvent(type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                    alternatives=[stt.SpeechData(language=ev.language or self._language, text=ev.text, confidence=ev.confidence)]))
            elif ev.kind == pb.SttEvent.FINAL:
                self._event_ch.send_nowait(stt.SpeechEvent(type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    alternatives=[stt.SpeechData(language=ev.language or self._language, text=ev.text, confidence=ev.confidence)]))
            elif ev.kind == pb.SttEvent.END_OF_TURN:
                self._event_ch.send_nowait(stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH))
            elif ev.kind == pb.SttEvent.ERROR:
                log.warning("%s: %s", p.label, ev.error)

# ---------------- TTS ----------------
class RemoteTTS(tts.TTS):
    def __init__(self, provider: str, *, voice: str = "", model: str = "", sample_rate: int = 24000, speed: float = 1.0):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=True), sample_rate=sample_rate, num_channels=1)
        self._name, self.voice, self._model, self.speed = provider, voice, model, speed
        self._stub = _Lazy(provider, rpc.TtsStub)
    @property
    def provider(self) -> str: return self._name
    @property
    def model(self) -> str: return self._model or "default"
    @property
    def label(self) -> str: return f"aetos.remote.{self._name}"
    def synthesize(self, text: str, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> "RemoteChunked":
        return RemoteChunked(self, text, conn_options=conn_options)
    def stream(self, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> "RemoteTTSStream":
        return RemoteTTSStream(self, conn_options=conn_options)
    def _cfg(self): return pb.TtsConfig(voice=self.voice, model=self._model, sample_rate=self.sample_rate, speed=self.speed)

class RemoteChunked(tts.ChunkedStream):
    def __init__(self, parent: RemoteTTS, text: str, *, conn_options):
        super().__init__(tts=parent, input_text=text, conn_options=conn_options); self._p = parent
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        p = self._p
        output_emitter.initialize(request_id=utils.shortuuid(), sample_rate=p.sample_rate, num_channels=1, mime_type="audio/pcm")
        async def reqs():
            yield pb.TtsRequest(config=p._cfg()); yield pb.TtsRequest(text=self._input_text); yield pb.TtsRequest(flush=True)
        async for fr in p._stub().Synthesize(reqs()):
            output_emitter.push(fr.pcm16)
        output_emitter.flush()

class RemoteTTSStream(tts.SynthesizeStream):
    def __init__(self, parent: RemoteTTS, *, conn_options):
        super().__init__(tts=parent, conn_options=conn_options); self._p = parent
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        p = self._p
        output_emitter.initialize(request_id=utils.shortuuid(), sample_rate=p.sample_rate, num_channels=1, mime_type="audio/pcm", stream=True)
        async def reqs():
            yield pb.TtsRequest(config=p._cfg())
            async for item in self._input_ch:
                if isinstance(item, self._FlushSentinel): yield pb.TtsRequest(flush=True)
                else: yield pb.TtsRequest(text=item)
        seg = utils.shortuuid(); output_emitter.start_segment(segment_id=seg)
        async for fr in p._stub().Synthesize(reqs()):
            output_emitter.push(fr.pcm16)
        output_emitter.end_segment(); output_emitter.flush()

# ---------------- health probe (used by aetosd + console) ----------------
async def probe(provider: str) -> dict:
    ch = _channel(provider); stub = rpc.ProviderStub(ch); t0 = time.perf_counter()
    try:
        h = await stub.Health(pb.Empty(), timeout=2); v = await stub.Version(pb.Empty(), timeout=2)
        return {"name": provider, "state": pb.HealthStatus.State.Name(h.state).lower(), "detail": h.detail, "rtt_ms": round((time.perf_counter()-t0)*1000, 1),
                "version": v.version, "sdk": v.sdk, "model": v.model, "contracts": list(v.contracts)}
    except Exception as e:
        return {"name": provider, "state": "down", "detail": str(e)[:120], "rtt_ms": None}
    finally: await ch.close()
