# XiaoZhi voice devices on LiveKit, managed by Aetos One Cloud

Built in response to `xioazhi-livekit.docx`. That document reaches a correct conclusion:
LiveKit is a real-time media platform, not an IoT MDM, so it has **no device registry, no
OTA, no remote configuration and no health monitoring**. This platform has all four. The one
thing missing between them was a way to let a device into a LiveKit room.

That bridge is now built.

---

## The division of labour

```
        XiaoZhi device (ESP32-S3)
        ├── I2S mic  ──┐
        ├── I2S amp  ──┤
        │              │
        │   LiveKit SDK ──────────► LiveKit room ◄──── voice agent (STT / LLM / TTS)
        │              │            real-time audio
        │              │
        └── MQTT client ─────────► Aetos One Cloud
                                    ├── device registry and groups
                                    ├── shared attributes (configuration)
                                    ├── OTA firmware updates
                                    ├── telemetry, alarms, dashboards
                                    └── LiveKit token endpoint  ◄── the piece that was missing
```

Audio never touches this platform. Everything that is not audio does.

---

## The token endpoint

A device already holds an access token — the one it uses for MQTT and telemetry. It trades
that for a LiveKit token:

```bash
curl -X POST http://your-platform:8080/api/v1/{deviceAccessToken}/livekit/token
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9…",
  "url": "wss://your-project.livekit.cloud",
  "room": "aetos-voice-lobby",
  "identity": "demo-xiaozhi-lobby",
  "expiresAt": 1785673282643
}
```

**Why this shape.** The alternative is a separate token service: another thing to deploy,
secure, monitor and give a copy of the device registry to. Putting it here means a device
carries **one credential**, and the room it may join is decided by the same platform that
already decides its firmware and configuration.

Three properties worth stating plainly:

- **The room comes from the device's `livekit_room_name` shared attribute**, so an operator
  can move a device between rooms from the UI without touching firmware.
- **The identity always comes from the platform**, never from the request. A device may ask
  for a different room — they do legitimately move — but it cannot claim to be another
  device, and identity is what any authorisation downstream keys off.
- **An unknown access token gets a flat 401.** The endpoint cannot be used to discover which
  tokens are valid.

Operators can mint a token for a device too, for monitoring or testing a room:

```
GET /api/livekit/token/{deviceId}     # authenticated, tenant-scoped
GET /api/livekit/status               # is LiveKit configured at all
```

## Configuration

```yaml
livekit:
  url: "${LIVEKIT_URL:}"
  api_key: "${LIVEKIT_API_KEY:}"
  api_secret: "${LIVEKIT_API_SECRET:}"
  token_ttl_seconds: "${LIVEKIT_TOKEN_TTL_SECONDS:21600}"
  default_room: "${LIVEKIT_DEFAULT_ROOM:aetos-voice}"
```

Leave the key and secret empty and the feature is simply off — the endpoints answer 503
rather than handing out tokens LiveKit would reject anyway.

Six hours is the default lifetime: long enough that a device is not constantly
re-authenticating, short enough that a leaked token stops working the same day.

---

## Provisioning the fleet

```bash
python3 livekit_seed.py --livekit-url wss://your-project.livekit.cloud
python3 livekit_seed.py --clean
```

Creates:

**A device profile** — `XiaoZhi Voice Assistant`, with two alarm rules chosen because they
catch what actually goes wrong with these devices:

| Rule | Fires when | Why |
|---|---|---|
| Weak WiFi signal | `wifi_rssi` < -75 dBm | Audio degrades long before the device disconnects, so waiting for "offline" is waiting too long |
| Low battery | `battery_level` < 20% | Clears automatically once the signal recovers, so it does not need acknowledging by hand |

**Four demo devices** across a plausible site, each carrying the shared attributes the
firmware reads:

| Attribute | Purpose |
|---|---|
| `livekit_room_name` | Which room this device joins — read by the token endpoint |
| `livekit_url` | LiveKit server, so the device only needs to know where the platform is |
| `livekit_identity` | Participant identity; defaults to the device name |
| `voice_volume`, `wake_word_sensitivity`, `vad_threshold` | Runtime tuning without a reflash |
| `agent_language` | Which agent configuration answers |

**A dashboard**, `demo LiveKit Voice Fleet`: a fleet table showing each device's room,
configuration and online state; WiFi and battery charts; sessions and round-trip latency;
and the alarm table. Seeded with half an hour of history so it is not empty on first open.

It is an ordinary dashboard — open the visual editor and change anything.

---

## What is still yours to build

Honestly, because the document asked the question directly:

| Piece | Where it lives |
|---|---|
| Firmware changes | Fork `xiaozhi-esp32`, swap the WebSocket client for LiveKit's ESP32 SDK, keep the wake word and VAD |
| The voice agent | A LiveKit agent (Python or Node) doing STT → LLM → TTS |
| WiFi provisioning | ESP-IDF SmartConfig, BLE or SoftAP. No IoT platform can do this — the device is not on the network yet |
| OTA hosting | The platform tracks OTA state and serves the package; you supply the binary |

The firmware's flow becomes: provision WiFi → connect MQTT with the access token → read
`livekit_url` and `livekit_room_name` from shared attributes → POST that same access token to
the token endpoint → join the room. One credential, and the room configurable from the UI.

---

## Verification

```bash
python3 verify_livekit.py     # 18/18
```

Checks the exchange, and then checks the token the way LiveKit will: HS256, issuer is the API
key, subject is the identity, the video grant names the right room, the signature verifies
against the API secret, and the expiry is in the future. Plus the security boundary — unknown
device token refused, operator endpoint authenticated, identity never taken from the request.
