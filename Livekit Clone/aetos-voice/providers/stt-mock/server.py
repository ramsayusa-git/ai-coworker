"""stt-mock — energy-based 'transcriber': emits INTERIM while audio is loud, FINAL + END_OF_TURN after silence.
No vendor. Lets you exercise turn-taking, barge-in and latency spans without paying anyone."""
import time, numpy as np
from aetos_provider import SttProvider, serve, pb

class MockStt(SttProvider):
    name="stt-mock"; version="1.0.0"; sdk="numpy"; model="energy-v1"
    def caps(self): return pb.Caps(streaming=True, languages=["*"], sample_rates=[16000,24000])
    async def transcribe(self, cfg, frames):
        sr = cfg.sample_rate or 16000; loud_ms = 0; quiet_ms = 0; words = 0; speaking = False
        async for fr in frames:
            x = np.frombuffer(fr.pcm16, dtype="<i2").astype(np.float32)
            ms = int(1000*len(x)/sr); rms = float(np.sqrt(np.mean(x*x))) if len(x) else 0.0
            if rms > 800:
                loud_ms += ms; quiet_ms = 0
                if not speaking: speaking = True
                if loud_ms // 250 > words:
                    words = loud_ms // 250
                    yield pb.SttEvent(kind=pb.SttEvent.INTERIM, text=" ".join(["speech"]*words), confidence=0.5, ts_ms=int(time.time()*1000))
            elif speaking:
                quiet_ms += ms
                if quiet_ms >= 300:
                    yield pb.SttEvent(kind=pb.SttEvent.FINAL, text=" ".join(["speech"]*max(words,1)), confidence=0.9, ts_ms=int(time.time()*1000))
                    yield pb.SttEvent(kind=pb.SttEvent.END_OF_TURN, ts_ms=int(time.time()*1000))
                    speaking=False; loud_ms=quiet_ms=words=0
        if speaking:
            yield pb.SttEvent(kind=pb.SttEvent.FINAL, text=" ".join(["speech"]*max(words,1)), confidence=0.9)
            yield pb.SttEvent(kind=pb.SttEvent.END_OF_TURN)
if __name__ == "__main__": serve(MockStt())
