"""tts-mock — synthesises a shaped tone per word so the whole pipeline runs with no vendor, no GPU, no key.
Proves provider-api v1 end to end; also the reference for how small a sidecar is."""
import asyncio, math, time, numpy as np
from aetos_provider import TtsProvider, serve, pb

class MockTts(TtsProvider):
    name="tts-mock"; version="1.0.0"; sdk="numpy"; model="tone-v1"
    def caps(self): return pb.Caps(streaming=True, voices=["tone"], languages=["*"], sample_rates=[16000,24000])
    async def synthesize(self, cfg, text):
        sr = cfg.sample_rate or 16000
        async for chunk in text:
            for word in chunk.split():
                dur = min(0.08 + 0.03*len(word), 0.35)
                f = 180 + (hash(word) % 220)
                n = int(sr*dur); t = np.arange(n)/sr
                env = np.minimum(1, np.minimum(t/0.01, (dur-t)/0.02).clip(0, None))
                pcm = (0.3*np.sin(2*math.pi*f*t)*env*32767).astype("<i2").tobytes()
                # stream in 20 ms frames like a real engine would
                step = int(sr*0.02)*2
                for i in range(0, len(pcm), step):
                    yield pb.AudioFrame(pcm16=pcm[i:i+step], sample_rate=sr, channels=1, ts_ms=int(time.time()*1000))
                    await asyncio.sleep(0)
if __name__ == "__main__": serve(MockTts())
