"""Tiny HTTP face for the supervisor — what Core proxies /api/v1/components to. stdlib only."""
import json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import inventory as inv

STORE = [  # registry index; real deployments fetch this from the licence server, filtered by entitlement + free GPU
    {"name":"stt-whisper","kind":"provider/stt","desc":"faster-whisper large-v3-turbo · 99 languages","needs":"2 GB VRAM or CPU int8","license":"free"},
    {"name":"tts-piper","kind":"provider/tts","desc":"CPU TTS, ~30 ms first byte","needs":"CPU","license":"free"},
    {"name":"stt-parakeet","kind":"provider/stt","desc":"NVIDIA Parakeet-TDT, fastest English STT","needs":"2 GB VRAM","license":"free"},
    {"name":"tts-kokoro","kind":"provider/tts","desc":"Kokoro-82M, natural English","needs":"1 GB VRAM","license":"free"},
    {"name":"vllm-qwen3-8b","kind":"provider/llm","desc":"vLLM serving Qwen3-8B FP8 behind llm-gateway","needs":"10 GB VRAM","license":"free"},
    {"name":"tts-elevenlabs","kind":"provider/tts","desc":"ElevenLabs Flash v2.5 (cloud)","needs":"API key","license":"free"},
    {"name":"stt-deepgram","kind":"provider/stt","desc":"Deepgram Nova-3 (cloud)","needs":"API key","license":"free"},
    {"name":"channel-whatsapp","kind":"channel","desc":"WhatsApp Business sessions","needs":"—","license":"pro"},
    {"name":"sink-bigquery","kind":"sink","desc":"Stream events v1 to BigQuery","needs":"—","license":"pro"},
]
class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj, default=str).encode(); self.send_response(code); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
    def do_GET(self):
        comps = inv.discover()
        if self.path == "/components": return self._json(200, [inv.status(m) for m in comps.values()])
        if self.path == "/store":
            installed = set(comps); return self._json(200, [dict(s, installed=s["name"] in installed) for s in STORE])
        if self.path in ("/healthz","/"): return self._json(200, {"ok": True, "components": len(comps)})
        self._json(404, {"error": "not found"})
    def do_POST(self):
        parts = self.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "components":
            comps = inv.discover(); m = comps.get(parts[1])
            if not m: return self._json(404, {"error": "unknown component"})
            fn = {"start": inv.start, "stop": inv.stop, "upgrade": inv.upgrade, "rollback": inv.rollback,
                  "restart": lambda m: (inv.stop(m), inv.start(m))[1]}.get(parts[2])
            if not fn: return self._json(400, {"error": "start|stop|restart|upgrade|rollback"})
            try: return self._json(200, fn(m))
            except Exception as e: return self._json(500, {"ok": False, "error": str(e)})
        self._json(404, {"error": "not found"})
def serve(port=8110):
    print(f"aetosd listening on 127.0.0.1:{port}  root={inv.ROOT} state={inv.STATE} run={inv.RUN}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
