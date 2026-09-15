# Lattice Net console — navigation spec

Captured from the live VAAI console (vaai.aetosiot.com) on 15 Sep 2026 by
reading its DOM, not by guessing. This is the target structure Lattice Net's
console mirrors.

## Sidebar / top menu

**Core**
| Label | VAAI path | Lattice Net route |
|---|---|---|
| Analytics | `/` | `/app` |
| Reports | `/reports` | `/app/reports` |
| Rooms | `/rooms` | `/app/rooms` |
| Call History | `/call-history` | `/app/sessions` |
| Chat History | `/chat-history` | `/app/chats` |
| Recording/Egress | `/egress` | `/app/recordings` |
| Tools | `/tools` | `/app/tools` |
| Knowledge Base / Memory | `/knowledge-base` | `/app/knowledge` |
| Voice Agents | `/agents` | `/app/agents` |
| Chatbot Agents | `/web-chat` | `/app/chatbots` |

**Telephony**
| Label | VAAI path | Lattice Net route |
|---|---|---|
| SIP Trunks | `/telephony/inbound` | `/app/telephony/trunks` |
| Dispatch Rules | `/telephony/rules` | `/app/telephony/rules` |
| Phone Numbers | `/telephony/numbers` | `/app/telephony/numbers` |
| Campaigns | `/telephony/campaigns` | `/app/telephony/campaigns` |

**Testing**
| Label | VAAI path | Lattice Net route |
|---|---|---|
| Agent Tester | `/agent-tester` | `/app/testing/tester` |
| Simulation | `/simulation` | `/app/testing/simulation` |
| AutoResearch | `/autoresearch` | `/app/testing/autoresearch` |
| Improvement Lab | `/improvement-lab` | `/app/testing/improvement-lab` |

**Admin**
| Label | VAAI path | Lattice Net route |
|---|---|---|
| Settings | `/settings` | `/app/settings` |

Lattice Net adds one group VAAI does not have, because it is multi-tenant from
the ground up where VAAI is single-install:

**Platform** (platform tenant only) — Components, Tenants.

## Analytics sub-tabs

Overview · Calls & Rooms · Latency · AI Insights · Agents · Media ·
Telephony · Price/Cost · Customer Usage · Server Stats

## Settings tabs

Server · Integrations/API · Dependencies · User Management · Security ·
System · Finance · Email · Storage · Notes/Guides · Licensing

Plus Branding, which Lattice Net keeps separate because white-labelling is a
licensed feature here rather than a server setting.

### Server sub-tabs
General · Time & Date · White-Label · CDN & Access · LiveKit Server ·
Check for Updates

Server tab surfaces: dashboard URL, media/SIP URL, connection status, server
and agent versions, feature flags (SIP telephony, debug mode, jitter buffer,
agent dev mode, warm workers), licence status, service restart, update channel.

### Integrations/API sub-tabs
API Keys · REST API · MCP Server · Sandbox

Provider keys VAAI carries (LLM/STT/TTS): OpenAI, Deepgram, AssemblyAI,
Speechmatics, Sarvam, SaluteSpeech, Google (Gemini), Anthropic, xAI/Grok,
Groq, SLNG.ai, Telnyx AI, OpenRouter, SCX, ElevenLabs, Cartesia, MiniMax,
Hume, ai|coustics. Avatar providers: D-ID, Tavus, Beyond Presence,
LiveAvatar, Anam, Simli, Avatario. Messaging: Twilio, Telnyx, Tronic Cloud,
Sent.dm. Cloud: Google Cloud (Vertex), AWS (Bedrock/Transcribe/Polly),
Azure (OpenAI + Speech). Storage: AWS S3, Google Cloud Storage.

Each key carries: masked value, "not set" state, region selectors where the
provider is regional, and a Test action.

### Security tab surfaces
Two-factor auth, CSRF protection, secure headers, HTTPS-only, widget abuse
protection (per-visitor daily session cap), dashboard IP allowlist,
fail2ban-style IP protection (banned IPs, whitelist, jails, thresholds for
auth failures / invalid email / scanner detection / rate limiting / SIP flood
/ repeat offenders), and a recent security event log.

## Notes on parity

Lattice Net is not a clone of VAAI's implementation — it is multi-tenant,
licence-gated and has no LiveKit dependency. Where VAAI stores a setting in
`.env` for one install, Lattice Net stores it per tenant in `tenant_settings`
and gates it on the tenant's role.
