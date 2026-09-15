"""Agent worker entrypoint. Pipeline per agent comes from Core (/api/v1/telephony/dispatch or /agents/{id});
providers are resolved to sidecar sockets by name. VAD + turn detection stay in-process — tightest loop we have."""
from __future__ import annotations
import os, json, time, logging, httpx
from livekit import agents
from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli, RoomInputOptions
from livekit.plugins import silero, openai
from .remote_provider import RemoteSTT, RemoteTTS

log = logging.getLogger("aetos.worker")
CORE = os.environ.get("AETOS_CORE_URL", "http://127.0.0.1:8100")
GATEWAY = os.environ.get("LLM_GATEWAY_URL", "http://127.0.0.1:4100/v1")
GATEWAY_KEY = os.environ.get("LLM_GATEWAY_KEY", "none")

def _resolve(ctx: JobContext) -> dict:
    """Pick the agent for this job: metadata.agent_id, or dispatch by dialled number, or the first online voice agent."""
    with httpx.Client(base_url=CORE, timeout=5) as c:
        meta = {}
        try: meta = json.loads(ctx.job.metadata or "{}")
        except Exception: pass
        if meta.get("agent_id"): return c.get(f"/api/v1/agents/{meta['agent_id']}").json()
        if meta.get("number"):
            d = c.get("/api/v1/telephony/dispatch", params={"number": meta["number"]}).json()
            return c.get(f"/api/v1/agents/{d['agent_id']}").json()
        for a in c.get("/api/v1/agents").json():
            if a["kind"]=="voice" and a["status"]=="online": return a
    raise RuntimeError("no online voice agent")

async def entrypoint(ctx: JobContext):
    a = _resolve(ctx); p = a["pipeline"]; log.info("agent=%s pipeline=%s", a["name"], p)
    session = AgentSession(
        vad=silero.VAD.load(min_silence_duration=0.25),                       # in-process, latency-critical
        stt=RemoteSTT(p.get("stt","stt-mock"), language=p.get("language","en")),
        llm=openai.LLM(model=p.get("llm","fast"), base_url=GATEWAY, api_key=GATEWAY_KEY),   # OpenAI-compatible → llm-gateway
        tts=RemoteTTS(p.get("tts","tts-mock"), voice=p.get("voice",""), sample_rate=int(p.get("tts_sample_rate", 24000))),
        min_endpointing_delay=float(p.get("min_endpointing_delay", 0.2)),     # semantic turn detector carries the rest
    )
    # session record + per-turn spans → Core (off the hot path, fire and forget)
    with httpx.Client(base_url=CORE, timeout=3) as c:
        ses = c.post("/api/v1/sessions", json={"agent_id": a["id"], "channel": "sip" if "sip" in ctx.room.name else "web", "caller": ctx.room.name}).json()
    t_turn = {"t0": time.time()}
    @session.on("user_input_transcribed")
    def _on_user(ev):
        if ev.is_final:
            t_turn["t0"] = time.time()
            httpx.post(f"{CORE}/api/v1/sessions/{ses['id']}/turns", json={"who":"caller","text":ev.transcript,"ts":time.time()}, timeout=2)
    @session.on("conversation_item_added")
    def _on_item(ev):
        if getattr(ev.item, "role", "") == "assistant":
            total = int((time.time()-t_turn["t0"])*1000)
            httpx.post(f"{CORE}/api/v1/sessions/{ses['id']}/turns", json={"who":"agent","text":ev.item.text_content or "","ts":time.time(),"tts_ms":total}, timeout=2)
    await session.start(room=ctx.room, agent=Agent(instructions=a["prompt"]), room_input_options=RoomInputOptions(noise_cancellation=None))
    await session.generate_reply(instructions="Greet the caller briefly and ask how you can help.")
    @ctx.room.on("disconnected")
    def _bye(*_):
        httpx.post(f"{CORE}/api/v1/sessions/{ses['id']}/end", json={"outcome":"completed"}, timeout=2)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=os.environ.get("AETOS_WORKER_NAME", "aetos")))
