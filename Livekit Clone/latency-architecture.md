# Latency-first architecture
**Goal:** the lowest achievable turn latency for a voice agent, and a rule for every API, SDK, MCP server and webhook so none of them ever add to it.
Date: 14 Sep 2026

---

## First, the honest number

"Zero latency" does not exist. Sound takes 20 ms to leave the phone, the carrier adds 30–100 ms each way, and a language model cannot answer before the caller has finished the sentence. What exists is a **budget**, and the whole discipline is knowing where the milliseconds go and attacking the biggest ones first.

The number that matters is **turn latency**: caller stops speaking → caller hears the first syllable of the reply. Humans notice above ~500 ms and get uncomfortable above ~1 s. Your current p50 is ~700 ms. Best-in-class cascaded pipelines run **400–500 ms**. Speech-to-speech models reach **300–400 ms** at the cost of control and money. Below that needs the caller and the model in the same building.

---

## Where a 700 ms turn actually goes

| Stage | Typical today | What it is | Best achievable |
|---|---|---|---|
| **1. End-of-turn detection** | **300–600 ms** | waiting for silence to decide the caller is done | **150–250 ms** with a semantic turn detector |
| **2. STT finalisation** | 100–300 ms | provider commits the final transcript after speech ends | **30–80 ms** — interim results already streamed; only the last word is pending |
| **3. LLM time-to-first-token** | **250–600 ms** | model + network RTT to the provider's region | **120–250 ms** — small model, near region, cached prompt |
| **4. TTS time-to-first-byte** | 80–200 ms | first audio chunk back from the voice provider | **40–90 ms** — Cartesia Sonic / ElevenLabs Flash, near region, warm socket |
| **5. Transport** | 60–150 ms | jitter buffer + SIP/WebRTC leg + carrier | **40–80 ms** — nearest trunk POP, no transcoding |
| 6. Internal hops (in-process ↔ sidecars) | 0 vs **3–8 ms** | the thing everyone argues about | **< 1 %** of the budget |
| **Total** | ~700–1 000 ms | | **~400–550 ms** |

Read row 6 again. The in-process-vs-sidecar debate is worth 3–8 ms. Rows 1 and 3 are worth **400 ms**. Spend the engineering where the milliseconds are.

---

## The ten levers, ranked by milliseconds saved

### 1. Semantic end-of-turn detection — saves 200–400 ms
The single largest lever. A fixed silence threshold has to wait long enough to not cut people off mid-thought, so it waits ~500 ms every single turn. A turn-detector model reads the transcript and decides "that was a complete sentence" — you can drop `min_endpointing_delay` to ~200 ms and rely on the model to hold when the caller is clearly mid-sentence. You already ship `livekit-local-inference` (turn detector) and it is in-process. **Tune it. This is where your 700 becomes 500.**

### 2. Put the box, the trunk POP and the providers in the same region — saves 100–300 ms
A server in Sydney calling a US-hosted TTS pays ~150 ms RTT before the first byte, on *every* turn, for STT, LLM and TTS. Region matters more than vendor.

| Component | Near-region option for AU | Near-region option for IN |
|---|---|---|
| LLM | Azure OpenAI `australiaeast`, Vertex `australia-southeast1`, Bedrock `ap-southeast-2` | Azure OpenAI `centralindia`, Vertex `asia-south1`, Bedrock `ap-south-1` |
| STT | Azure Speech (AU), Speechmatics (SG/AU), Deepgram self-hosted | Azure Speech (IN), **Sarvam** (Indian-hosted, Indic languages), Deepgram self-hosted |
| TTS | Azure Neural (AU), Cartesia/ElevenLabs edge (check POP), local Kokoro/Piper | Azure Neural (IN), Sarvam, local Kokoro/Piper |
| SIP trunk | Twilio/Telnyx Sydney POP | Twilio/Telnyx Mumbai POP |

Measure RTT from the box to every provider endpoint at install time and show it in the console next to each provider. A 180 ms RTT should be a red badge.

### 3. Speculative execution — saves 100–200 ms
Start the LLM request on the **interim** transcript while end-of-turn is still being decided. If the final transcript matches, you have a 200 ms head start; if not, cancel and re-issue. Same trick for TTS: begin synthesising the first sentence the moment it is complete, before the LLM finishes the paragraph. Every stage overlaps the next.

### 4. Small model, short prompt, cached prefix — saves 100–300 ms of TTFT
- Haiku 4.5 / GPT-4o-mini / Gemini 2.5 Flash on the turn path. Never a reasoning model.
- System prompt under ~1 500 tokens. Every extra 1 000 tokens of prompt is measurable TTFT.
- **Prompt caching** (Anthropic, OpenAI, Gemini) so the static prefix is not re-processed per turn.
- Move knowledge-base retrieval **before** the LLM call and run it in parallel with end-of-turn detection, not after.

### 5. Warm, persistent connections — saves 50–150 ms on the first turn, jitter on every turn
One WebSocket to STT and one to TTS **per session, opened at session start**, kept open for the whole call. HTTP/2 keep-alive to the LLM gateway. Never a TLS handshake inside a turn. Sidecars make this easy: the sidecar owns a warm pool to its vendor and hands out streams.

### 6. Stream everything, chunk at sentence boundaries — saves 100–300 ms of *perceived* latency
LLM tokens → sentence splitter → TTS → 20 ms audio frames → caller, all pipelined. The caller hears sentence one while sentence three is still being generated. Never wait for the full reply.

### 7. Pre-synthesised audio for fixed phrases — saves 100 % of TTS on those turns
Greeting, "one moment", "let me check that", confirmations, hold prompts: synthesise once per agent-voice at publish time, store as PCM, play from disk. **0 ms TTS**, 0 cost, identical every time.

### 8. Local inference where the GPU pays for itself — saves the entire network RTT
On a box with a modest GPU (even a 3060-class card):
- STT: Whisper-large-v3-turbo / NVIDIA Parakeet, ~100 ms on GPU
- TTS: Kokoro / Piper, ~30–60 ms TTFB
- LLM: vLLM serving an 8 B model, ~60–120 ms TTFT
That is a sub-400 ms turn with no internet on the path at all — and it is the only route to a plant floor with flaky connectivity. Ship these as provider sidecars like any other vendor.

### 9. Speech-to-speech models — the nuclear option, 300–400 ms total
GPT-4o Realtime, Gemini Live, xAI Grok Realtime (you already have the plugin): audio in, audio out, no STT/TTS stages. Fastest possible cascade. Costs: 3–10× per minute, less control over voice and wording, weaker tool-calling, and vendor lock. Offer it as a per-agent pipeline choice, not the default.

### 10. Transport hygiene — saves 20–60 ms and most of the jitter
Nearest trunk POP; Opus end-to-end where the carrier allows, G.711 otherwise, **never transcode twice**; jitter buffer at the minimum stable for the link (20–40 ms); the LiveKit server on the same box or same rack as the worker.

---

## Masking what you cannot remove

Perceived latency is what the caller judges. Two tricks make 600 ms feel like 300:

- **Backchannels.** A short "mm-hm" or breath sound at end-of-turn, played from the pre-synthesised cache, while the LLM is thinking. Humans do this; silence is what feels slow.
- **Filler on tool calls.** When the model decides to call a tool, immediately speak a pre-synthesised "let me look that up" and run the tool in parallel. A 2 s CRM lookup becomes invisible.

---

## The rule for everything that is not the voice path

**APIs, SDKs, MCP servers and webhooks are allowed on the turn path only if they finish inside a hard budget. Otherwise they run off it.**

| Thing | On the turn path? | Rule |
|---|---|---|
| **Console API** (`/api/v1`) | never | it serves the browser; it does not exist to the call |
| **MCP tools called mid-turn** | yes | **local** (unix socket / same box), hard timeout 500 ms, filler phrase spoken while waiting, parallel calls when independent |
| **Webhook tools** to the internet | avoid | if unavoidable: timeout 800 ms, speak filler first, cache the answer for the session |
| **Prefetch** | before the turn | the moment a call arrives you know the caller's number — pull their CRM record, last order, open ticket, *before they say a word*. Most "tool calls" become memory lookups |
| **Event webhooks / sinks / CRM sync / reports** | never | Redis Streams, consumer groups, fire-and-forget. Nothing here can block a call by construction |
| **Knowledge-base search** | yes | local Qdrant, < 50 ms, run in parallel with end-of-turn detection, results injected into the prompt before the LLM call |
| **Provider sidecars** | yes | unix socket or host network only; **Docker bridge networking is banned on the audio path** |
| **Logging / telemetry from the worker** | never inline | async, buffered, flushed off-thread — your changelog already had to fix Redis writes on the response loop; make it impossible, not just fixed |

---

## The hot-path process

```
aetos-agent  (one process, one CPU-pinned core if you can spare it)
  ├── audio in  ──► VAD (silero)          in-process, ~1 ms
  │                └► turn detector       in-process, ~10 ms, semantic
  ├── STT stream  ─► sidecar, unix socket, warm vendor WebSocket
  │      interim ──► speculative LLM start
  ├── KB search  ─► local Qdrant, parallel with EOT
  ├── LLM stream ─► llm-gateway (LiteLLM), HTTP/2 keep-alive, cached prefix
  │      sentence ─► TTS stream ─► sidecar, warm vendor WebSocket
  │                  fixed phrase? ─► PCM from disk, 0 ms
  └── audio out ──► 20 ms frames ──► LiveKit (same box) ──► SIP/WebRTC
```

Everything that can start early starts early. Nothing waits for the stage before it to finish.

---

## Measure it or you are guessing

You already flush OpenTelemetry spans to Redis. Make the spans match the stages above, one span per stage per turn, and put this on the call-detail page:

```
turn 3   EOT 210 │ STT 62 │ KB 41 ∥ │ LLM-TTFT 188 │ TTS-TTFB 71 │ transport 48 │ = 579 ms
```

SLOs to hold yourself to, per agent, on the Analytics page:

| Metric | Target p50 | Target p95 | Alert |
|---|---|---|---|
| Turn latency | 500 ms | 800 ms | p95 > 1 000 ms for 5 min |
| LLM TTFT | 200 ms | 400 ms | p95 > 600 ms |
| TTS TTFB | 80 ms | 150 ms | p95 > 250 ms |
| Provider RTT (probe) | — | — | > 120 ms → red badge on the provider card |

Show the RTT probe next to every provider in Settings so the person choosing a vendor sees the region cost before they pick it.

---

## What this means for the sidecar decision

Sidecars cost 3–8 ms and buy you independent upgrades, failure isolation and warm connection pools that are *easier* to keep alive than in a shared worker. Against a 500 ms budget that is a 1 % tax for the things you said you needed. Keep the sidecars. Spend the effort on end-of-turn detection, region placement and speculative execution — that is where 200–400 ms lives.

If after measuring you still want the last 5 ms, move the audio frames onto a shared-memory ring buffer and keep only control messages on the socket. It is a well-known pattern and it is a day of work — but do it last, with numbers, not first, on instinct.
