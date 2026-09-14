# Self-hosted STT / TTS / LLM on NVIDIA GPUs
**Question:** can the platform run its own models on a GPU box, and does the sidecar architecture let you add new models later?
**Answer:** yes to both — a self-hosted engine is just another provider sidecar. Nothing in Core or the worker changes.
Date: 14 Sep 2026

---

## How it fits — one sentence

A GPU engine is a container that speaks `provider-api v1` (STT/TTS) or the OpenAI-compatible HTTP API (LLM), exactly like `tts-elevenlabs` does — the only differences are `gpu: true` in its manifest and a `/models` volume. The worker cannot tell the difference between Cartesia in Virginia and Kokoro on the card in the rack.

```
aetos-agent ──unix socket──► stt-parakeet   (GPU)   ┐
            ──unix socket──► tts-kokoro     (GPU)   ├─ one RTX 4090, 24 GB
            ──HTTP──► llm-gateway ──► vllm-qwen3-8b (GPU) ┘
                                  └─► cloud fallback (Haiku / 4o-mini) when the GPU is saturated
```

Adding a model later = pull a new sidecar image, or drop a new model into the volume of an existing engine. Core is not restarted. That is the whole point of the design.

---

## Engines worth running (mid-2026)

| Role | Engine | Why | Typical latency on a 4090 | VRAM | Licence |
|---|---|---|---|---|---|
| **STT** | **NVIDIA Parakeet-TDT** (NeMo) | fastest accurate English streaming STT that exists | 50–100 ms final | ~2 GB | CC-BY-4.0 |
| STT | **faster-whisper** (Whisper large-v3-turbo, CTranslate2) | 99 languages incl. Hindi/Telugu/Tamil; good Indic coverage | 150–250 ms final | ~2 GB (int8) | MIT |
| STT | AI4Bharat IndicConformer | best-in-class for 22 Indian languages | ~150 ms | ~1 GB | MIT |
| **TTS** | **Kokoro-82M** | tiny, fast, natural; English + a few others | **30–80 ms TTFB** | ~1 GB | Apache-2.0 |
| TTS | Orpheus (LLM-based, streaming) | expressive, emotional, streams | 100–200 ms TTFB | ~6 GB | Apache-2.0 |
| TTS | XTTS-v2 / Chatterbox | voice cloning from a few seconds of audio | 150–250 ms | ~3 GB | Coqui / MIT |
| TTS | AI4Bharat Indic-Parler-TTS | Indian languages, natural | ~200 ms | ~3 GB | Apache-2.0 |
| TTS | Piper | **CPU-only**, instant, robotic-ish — good for fixed phrases and fallback | 20–40 ms | 0 | MIT |
| **LLM** | **vLLM** serving Qwen3-8B / Llama-3.x-8B / Gemma-3-12B | OpenAI-compatible endpoint → zero change to LiteLLM | **60–120 ms TTFT** | 6–10 GB (FP8/AWQ) | Apache / Llama / Gemma terms |
| LLM | SGLang | faster than vLLM on some workloads, same API | similar | similar | Apache-2.0 |
| LLM | TensorRT-LLM | lowest TTFT NVIDIA offers; painful to build | 40–80 ms | similar | Apache-2.0 |
| LLM | Ollama | **dev only** — easy, but poor concurrency and slower TTFT | 150–300 ms | | MIT |
| all-in-one | NVIDIA Riva / NIMs | polished, streaming, supported | very good | varies | **needs NVIDIA AI Enterprise licence for production** — check before shipping to customers |

Everything above except Riva/NIMs is free to redistribute inside a product. Read the Llama and Gemma terms once; both are fine for this use but have attribution clauses.

---

## GPU sizing — what actually fits

| Card | VRAM | Fits | Concurrent calls (rough) |
|---|---|---|---|
| RTX 3060 | 12 GB | 8B LLM 4-bit (~5 GB) + Whisper-turbo int8 (~2 GB) + Kokoro (~1 GB) | 2–4 |
| **RTX 4090 / 3090** | 24 GB | 8B FP8 (~9 GB) + Parakeet + Kokoro + headroom for KV-cache | **6–10** |
| L4 (cloud, 72 W) | 24 GB | same as 4090, ~40 % slower, runs in any rack | 4–8 |
| A6000 / L40S | 48 GB | 14B FP8 or 32B AWQ + everything | 15–25 |
| A100 / H100 | 80 GB | 70B AWQ + everything | 30+ |
| 2 × 4090 | 48 GB | GPU 0: LLM · GPU 1: STT + TTS — no contention | 12–20 |

Concurrency is bounded by LLM KV-cache and by TTS throughput, not by STT. A plant with two phone lines runs on a 3060. A 20-seat contact centre wants two cards or an L40S.

---

## Manifest for a GPU sidecar

```yaml
name: tts-kokoro
version: 0.9.4
kind: provider/tts
contracts: {provider-api: [1]}
image: ghcr.io/aetos/tts-kokoro          # CUDA 12.x base, pinned
gpu: true                                 # aetosd adds --gpus via nvidia-container-toolkit
gpu_memory: 1500M                         # enforced: engines that overrun are killed, not allowed to OOM the card
models:
  - name: kokoro-v1.0
    source: hf://hexgrad/Kokoro-82M
    volume: /models                       # downloaded at install, updatable separately from the engine
warmup: true                              # health = model loaded AND one synth completed
socket: /run/aetos/tts-kokoro.sock
resources: {memory: 2G, cpu: 1}
```

Two version numbers per GPU sidecar, deliberately: **engine version** (the image) and **model version** (the artifact in `/models`). You will update models far more often than engines. Both show in the console's Components page; both roll back independently.

---

## Things that will bite you if you don't plan for them

1. **VRAM contention.** Three engines on one card with no limits → the first OOM takes all three down mid-call. Every GPU sidecar declares `gpu_memory`; vLLM gets `--gpu-memory-utilization` derived from it; the supervisor refuses to start a sidecar whose declared need exceeds free VRAM. Consider NVIDIA MPS if you run many small engines.
2. **Cold start.** Loading an 8B model takes 15–60 s. Health must mean "loaded *and* warmed", not "process up", or the first call after an upgrade will time out. Blue/green swap handles this: v2 warms beside v1 before the socket flips.
3. **Driver / CUDA matrix.** Host driver ≥ what the newest sidecar's CUDA base needs. Pin CUDA base images; document the minimum driver on the install page; let `aetosd` check `nvidia-smi` before pulling a GPU image.
4. **Quality is not cloud quality — measure it.** An 8B model is noticeably weaker at tool-calling and instruction-following than GPT-4o-mini or Haiku. Run every self-hosted pipeline through the Simulation suite before enabling it on a customer agent. Expect to keep a cloud fallback for the hard turns.
5. **Batching vs. latency.** vLLM's continuous batching is fine up to its concurrency limit; past it, TTFT climbs fast. Set `max_num_seqs` to the concurrency the card can actually hold, and route overflow to the cloud through LiteLLM rather than queueing.
6. **Streaming is mandatory.** Whisper as normally used is *not* streaming — it transcribes chunks. Use faster-whisper with VAD-gated segments, or Parakeet/Riva which stream natively. A non-streaming STT wipes out the latency gain.
7. **Power, heat, noise.** A 4090 at full load is 450 W and loud. On-prem at a plant means a proper enclosure, not a desktop under a desk. L4 / L40S exist precisely for this.
8. **Model hosting.** Do not pull from Hugging Face at install time on a customer box with restricted egress. Mirror the models you ship on your own storage and let the licence server hand out signed URLs.

---

## The hybrid that actually works

```
LiteLLM routing
  primary:  vllm-local        (if GPU free and model supports the agent's tools)
  fallback: claude-haiku-4.5  (cloud, when local is saturated or errors)
  hard:     gpt-4o-mini       (second cloud, different vendor)

STT: parakeet-local  → fallback deepgram-cloud
TTS: kokoro-local    → fallback cartesia-cloud
```

Per agent, per pipeline stage, in the console. The plant runs fully local and keeps talking with the internet down; the sales line uses local for speed and cloud for the hard questions; nobody rewrites anything to switch.

---

## Adding a new model in the future

| Scenario | What you do | Core touched? |
|---|---|---|
| New Kokoro voice pack | new entry under `models:`, `aetosd update tts-kokoro --model` | no |
| New STT vendor's open model | new sidecar image speaking `provider-api v1` | no |
| Newer LLM (say Qwen4-8B next year) | change the model name in the vLLM sidecar's config | no |
| New engine type entirely (e.g. speech-to-speech local model) | new sidecar, may need `provider-api v2` with an `S2S` service — Core supports N and N-1 so v1 sidecars keep working | no |
| Bigger GPU | change `gpu_memory` limits, raise `max_num_seqs` | no |

That last column is the requirement you set, met.

---

## Recommended first GPU pipeline

Start with the boring, proven trio and measure before getting clever:

- **STT:** Parakeet-TDT for English agents; faster-whisper large-v3-turbo for Indic/multilingual
- **TTS:** Kokoro-82M; Piper on CPU for pre-synthesised fixed phrases
- **LLM:** vLLM + Qwen3-8B FP8, cloud fallback through LiteLLM
- **Card:** one RTX 4090 for the lab; L4 or L40S for anything you ship to a customer

Target on that box: **turn latency 350–450 ms**, no internet on the voice path.
