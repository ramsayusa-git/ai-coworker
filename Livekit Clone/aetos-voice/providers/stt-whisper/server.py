"""stt-whisper — faster-whisper made streaming: VAD-gated segments, INTERIM every ~700 ms of speech,
FINAL + END_OF_TURN after 300 ms silence. 99 languages. CPU int8 by default, CUDA when available."""
import os, asyncio, time, numpy as np
from aetos_provider import SttProvider, serve, pb

class WhisperStt(SttProvider):
    name="stt-whisper"; version="1.1.0"; sdk="faster-whisper"; model=os.environ.get("AETOS_WHISPER_MODEL","large-v3-turbo")
    def caps(self): return pb.Caps(streaming=True, languages=["*"], sample_rates=[16000])
    async def warmup(self):
        from faster_whisper import WhisperModel
        dev = "cuda" if os.environ.get("AETOS_GPU","0")=="1" else "cpu"
        self.m = await asyncio.to_thread(WhisperModel, self.model, device=dev, compute_type="float16" if dev=="cuda" else "int8",
                                         download_root=os.environ.get("AETOS_MODELS","/models"))
        await asyncio.to_thread(lambda: list(self.m.transcribe(np.zeros(16000, dtype=np.float32))[0]))
    def _run(self, audio, lang):
        segs, info = self.m.transcribe(audio, language=None if lang in ("", "auto") else lang, beam_size=1, vad_filter=False)
        return " ".join(s.text.strip() for s in segs).strip(), info.language
    async def transcribe(self, cfg, frames):
        sr = cfg.sample_rate or 16000; buf = []; speaking=False; quiet_ms=0; since_interim=0
        async for fr in frames:
            x = np.frombuffer(fr.pcm16, dtype="<i2").astype(np.float32)/32768.0
            ms = int(1000*len(x)/sr); rms = float(np.sqrt(np.mean(x*x))) if len(x) else 0
            if rms > 0.02: speaking=True; quiet_ms=0
            elif speaking: quiet_ms += ms
            if speaking:
                buf.append(x); since_interim += ms
                if cfg.interim and since_interim >= 700:
                    since_interim=0; text, lang = await asyncio.to_thread(self._run, np.concatenate(buf), cfg.language)
                    if text: yield pb.SttEvent(kind=pb.SttEvent.INTERIM, text=text, language=lang, confidence=0.6, ts_ms=int(time.time()*1000))
                if quiet_ms >= 300:
                    text, lang = await asyncio.to_thread(self._run, np.concatenate(buf), cfg.language)
                    if text: yield pb.SttEvent(kind=pb.SttEvent.FINAL, text=text, language=lang, confidence=0.9, ts_ms=int(time.time()*1000))
                    yield pb.SttEvent(kind=pb.SttEvent.END_OF_TURN, ts_ms=int(time.time()*1000))
                    buf=[]; speaking=False; quiet_ms=0; since_interim=0
        if buf:
            text, lang = await asyncio.to_thread(self._run, np.concatenate(buf), cfg.language)
            if text: yield pb.SttEvent(kind=pb.SttEvent.FINAL, text=text, language=lang, confidence=0.9)
            yield pb.SttEvent(kind=pb.SttEvent.END_OF_TURN)
if __name__ == "__main__": serve(WhisperStt())
