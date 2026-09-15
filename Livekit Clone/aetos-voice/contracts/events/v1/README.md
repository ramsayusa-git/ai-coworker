# events v1 — Redis Streams

Stream key: `aetos:events:v1`. Every entry: `type`, `ts` (ms), `v`=1, `data` (JSON).
Subscribers use consumer groups (`XGROUP CREATE aetos:events:v1 <group> $ MKSTREAM`) so a slow consumer never blocks a producer.

| type | data |
|---|---|
| session.started | session_id, agent_id, channel, from |
| turn.completed  | session_id, n, eot_ms, stt_ms, llm_ttft_ms, tts_ttfb_ms, total_ms, text |
| tool.called     | session_id, tool, ok, ms |
| session.ended   | session_id, outcome, duration_s, cost |
| summary.ready   | session_id, summary, sentiment |
| provider.health | name, state, detail |
| component.updated | name, from, to, ok |
| system.alert    | level, message |
