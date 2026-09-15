"""tts-piper — CPU text-to-speech, ~30 ms first byte, no GPU, no key. The voice model is a separate artefact under /models
so a voice update never touches the engine version."""
import os, asyncio, time, pathlib, urllib.request, wave, io
from aetos_provider import TtsProvider, serve, pb, load_manifest

class PiperTts(TtsProvider):
    name="tts-piper"; version="1.2.0"; sdk="piper-tts"; model=""
    def __init__(self):
        super().__init__(); self.voice=None; self.sr=22050
    def caps(self): return pb.Caps(streaming=True, voices=[self.model], languages=["en"], sample_rates=[self.sr])
    async def warmup(self):
        from piper import PiperVoice
        m = load_manifest(); spec = (m.get("models") or [{}])[0]
        mdir = pathlib.Path(os.environ.get("AETOS_MODELS", spec.get("volume", "/models"))); mdir.mkdir(parents=True, exist_ok=True)
        onnx = mdir / f"{spec.get('name','voice')}.onnx"; cfg = mdir / f"{spec.get('name','voice')}.onnx.json"
        if not onnx.exists():
            urllib.request.urlretrieve(spec["source"], onnx); urllib.request.urlretrieve(spec["source"]+".json", cfg)
        self.voice = await asyncio.to_thread(PiperVoice.load, str(onnx)); self.model = spec.get("name","voice")
        self.sr = self.voice.config.sample_rate
        # one warm synth so the first real call is not the slow one
        await asyncio.to_thread(lambda: list(self.voice.synthesize_stream_raw("ready")))
    async def synthesize(self, cfg, text):
        buf = ""
        async for chunk in text:
            buf += chunk
            # sentence-level chunking: synthesise as soon as a sentence closes
            while True:
                i = max(buf.rfind(". "), buf.rfind("? "), buf.rfind("! "), buf.rfind(", "))
                if i < 0: break
                sent, buf = buf[:i+1], buf[i+2:]
                async for fr in self._synth(sent): yield fr
        if buf.strip():
            async for fr in self._synth(buf): yield fr
    async def _synth(self, sent):
        q = asyncio.Queue(); loop = asyncio.get_running_loop()
        def run():
            for pcm in self.voice.synthesize_stream_raw(sent): loop.call_soon_threadsafe(q.put_nowait, pcm)
            loop.call_soon_threadsafe(q.put_nowait, None)
        asyncio.get_running_loop().run_in_executor(None, run)
        step = int(self.sr*0.02)*2
        while (pcm := await q.get()) is not None:
            for i in range(0, len(pcm), step):
                yield pb.AudioFrame(pcm16=pcm[i:i+step], sample_rate=self.sr, channels=1, ts_ms=int(time.time()*1000))
if __name__ == "__main__": serve(PiperTts())
