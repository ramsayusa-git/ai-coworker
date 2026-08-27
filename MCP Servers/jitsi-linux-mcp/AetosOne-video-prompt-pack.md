# AetosOne — AI Video Prompt Pack
### 60–90s family explainer for text-to-video tools (Sora / Veo / Runway / Pika)

**The story in one line:** A family is scattered across places and misses being together — one tap on AetosOne makes *every* family device ring and wake, and in a second they're all in the same warm video call. No dialing, no links, private and always-on.

**Why it's built as a "shot pack":** AI video tools generate short clips (≈5–10s each). You'll generate **9 clips**, then stitch them in any editor (CapCut, Premiere, DaVinci — all free-tier capable) with music, captions, and your logo on top. **Do not** rely on the AI to render the app UI, text, or the logo — those go on in the edit (see §5–6).

---

## 1. How to use this pack
1. Pick your tool. Prompts are tool-agnostic; tool-specific tips are in §7.
2. For **each shot**, paste the **Global Style Block** (§2) + the shot's **Prompt**. Generate 2–3 takes, keep the best.
3. Keep characters consistent using the **Character Bible** (§3) — reuse the exact descriptions every time, and reuse the same seed if your tool supports it.
4. Assemble in the order S1→S9. Add the **voiceover** (§4), **music** (§5), and **captions + logo** (§6).
5. Target aspect ratio: **9:16 vertical** (best for phones/WhatsApp/social) — a 16:9 alternative is noted in §2.

---

## 2. Global Style Block  *(paste at the top of every shot prompt)*
```
Cinematic, warm, emotional family film. Soft natural light, golden-hour glow,
gentle shallow depth of field, subtle film grain, 24fps, photoreal.
Cohesive color grade: warm skin tones with cool navy-blue shadows and soft
orange/amber accent highlights. Calm, heartfelt, hopeful mood. Clean, modern,
premium look. Smooth slow camera moves. No on-screen text, no logos, no UI,
no captions, no watermark. Aspect ratio 9:16 vertical.
```
*16:9 version: change the last line to "Aspect ratio 16:9 widescreen" and widen the framing notes.*

**Negative prompt (if your tool supports one):**
```
text, captions, subtitles, watermark, logo, user interface, app screen, distorted
faces, extra fingers, deformed hands, glitchy, low quality, oversaturated, cartoonish
```

---

## 3. Character Bible  *(reuse these exact descriptions for consistency)*
- **Grandmother (Nana):** warm woman in her late 60s, silver hair in a soft bun, gentle smile, wearing a soft cream cardigan, cozy home.
- **Daughter (Maya):** woman in her early 30s, shoulder-length dark hair, casual mustard-yellow sweater, bright and confident.
- **Son (Sam):** man in his mid-30s, short hair, light blue shirt, at a tidy modern office desk.
- **Grandchild (Leo):** cheerful boy around 8, curly hair, striped t-shirt, in a bright bedroom.
- **Recurring device look:** modern smartphone, dark screen that lights up with a **soft navy-and-amber glow** and a **round emblem** (do not spell out any brand — just "a circular glowing emblem").

---

## 4. Voiceover script  *(one warm narrator, ~70s — record once, lay over the whole edit)*
> (S1) "Everyone's busy. Everyone's somewhere else."
> (S2) "But staying close shouldn't be hard."
> (S3) "With one tap…"
> (S4) "…every phone in the family rings."
> (S5) "No numbers. No links. No waiting."
> (S6) "They just… answer — and you're all together."
> (S7) "Wherever they are."
> (S8) "On a private line that's only yours — always on, always ready."
> (S9) "AetosOne. Your family, one tap away."

*Tone: gentle, unhurried, a small smile in the voice. Leave a beat of silence at S6 for the "reunion" moment to breathe.*

---

## 5. Music & pacing
- **Track feel:** soft solo piano intro → warm strings swelling at S5 (the reunion) → hopeful, resolved outro. Search stock libraries for "heartwarming family piano strings uplifting."
- **Pacing:** S1–S2 slow and a little wistful; S3–S4 a lift as the tap ripples out; S5–S6 the emotional peak (hold longer, ~9s); S7–S9 warm resolve.
- **Sound design:** a single soft "chime/ring" swell on S3→S4 as devices light up; gentle whoosh as faces come together in S5.

---

## 6. Captions & logo overlay plan  *(add in the editor, not in the AI)*
On-screen text per shot (keep it short, centered-lower, clean sans-serif, white with soft shadow):
- S1: *"Miss having everyone together?"*
- S2: *"Staying close shouldn't be hard."*
- S3: **"One tap."**
- S4: **"Every phone rings."**
- S5: *"No dialing. No links."*
- S6: **"Everyone's just… there."**
- S7: *"Wherever they are."*
- S8: *"Private. Always on."*
- S9: **Round shield logo** + *"AetosOne — your family, one tap away."*
> Drop your real **round shield badge** (`aetos-badge-master.png`) as the S9 logo and as a small corner watermark from S3 onward. Use your brand navy **#12305A** and orange **#E6701C** for caption accents.

---

## 7. Shot-by-shot prompts

### SHOT 1 — The quiet distance  *(~8s)*
```
[GLOBAL STYLE BLOCK]
A warm woman in her late 60s with silver hair in a soft bun, wearing a cream
cardigan, sits alone by a large window in a cozy home, soft morning light on her
face. She gazes fondly at a framed family photograph in her hands, a faint
wistful smile. Slow push-in toward her face. Dust motes float in the light.
Quiet, tender, a little lonely.
```
Caption: *"Miss having everyone together?"*

### SHOT 2 — The idea  *(~7s)*
```
[GLOBAL STYLE BLOCK]
A confident woman in her early 30s with shoulder-length dark hair and a mustard-
yellow sweater sits at a bright kitchen table with a coffee. She picks up her
smartphone with a small, knowing smile. Close-up of her thumb hovering, about to
tap the dark screen. Warm morning kitchen, soft bokeh background.
```
Caption: *"Staying close shouldn't be hard."*

### SHOT 3 — One tap, the ripple begins  *(~7s)*
```
[GLOBAL STYLE BLOCK]
Extreme close-up: a thumb taps a smartphone screen; the screen blooms to life
with a soft navy-blue and warm amber glow and a circular glowing emblem at the
center. A gentle pulse of light radiates outward from the point of contact.
Macro detail, shallow focus, satisfying and magical.
```
Caption: **"One tap."**

### SHOT 4 — Every device wakes  *(~8s)*
```
[GLOBAL STYLE BLOCK]
A montage of devices around different homes lighting up at once: a phone on a
nightstand, a phone on a kitchen counter, a tablet mounted on a kitchen wall —
each screen waking with the same soft navy-and-amber glow and a circular emblem,
gently vibrating. Warm interiors, cozy, synchronized. Quick graceful cuts.
```
Caption: **"Every phone rings."**

### SHOT 5 — Nana answers  *(~8s)*
```
[GLOBAL STYLE BLOCK]
The same late-60s woman in the cream cardigan looks down as her phone on the
table glows and rings. Her face lights up with pure delight and surprise. She
lifts the phone; warm light from the screen illuminates her joyful face. Slow,
tender push-in. Emotional, heartwarming.
```
Caption: *"No dialing. No links."*

### SHOT 6 — Together, instantly  *(~9s, hold longer — emotional peak)*
```
[GLOBAL STYLE BLOCK]
Warm, glowing montage of a family reunited on a video call: smiling faces of a
grandmother, a young woman in a mustard sweater, a man in a light-blue shirt, and
a cheerful curly-haired boy — laughing, waving, delighted to see each other.
Soft light, joyful energy, faces close and warm. The feeling of a family
suddenly all in one room together.
```
Caption: **"Everyone's just… there."**

### SHOT 7 — Across every place  *(~8s)*
```
[GLOBAL STYLE BLOCK]
Quick warm cuts of family members in different settings, all beaming as if on the
same call: a man at a tidy modern office desk, a curly-haired boy in a bright
bedroom, a woman in a sunny kitchen. Each in their own world yet clearly
connected, sharing the same joyful moment. Cohesive warm grade across all cuts.
```
Caption: *"Wherever they are."*

### SHOT 8 — The always-on home  *(~7s)*
```
[GLOBAL STYLE BLOCK]
A cozy modern kitchen at golden hour. A wall-mounted tablet glows softly on the
counter, screen alive with a gentle navy-and-amber light and a circular emblem,
as if always ready and watching over the home. A subtle sense of safety and calm.
Slow gentle dolly past the counter.
```
Caption: *"Private. Always on."*

### SHOT 9 — Brand resolve  *(~8s)*
```
[GLOBAL STYLE BLOCK]
A clean, minimal, softly-lit background in deep navy blue. A warm amber circle of
light gently pulses at the center, radiating a calm glow, leaving empty negative
space in the middle for a logo. Premium, elegant, hopeful. Very subtle particle
light. Slow, settling motion coming to rest.
```
Overlay in edit: **round shield logo** appears in the center glow + caption *"AetosOne — your family, one tap away."*

---

## 8. Tool-specific tips
- **Sora / Veo 3:** paste the whole block as one paragraph; they follow long descriptive prompts well and Veo can add audio — but still add your VO/music/captions in the edit for control. Ask for "photoreal, cinematic" explicitly.
- **Runway (Gen-3/4):** keep motion gentle; use "slow push-in / slow dolly" phrasing (it respects camera verbs). Generate 10s then trim.
- **Pika:** shorten each prompt to its 2 strongest sentences; add "cinematic, warm, shallow depth of field." Use their motion/strength sliders low for calm shots.
- **Consistency across shots:** reuse the exact Character Bible wording, keep the Global Style Block identical, and reuse the same **seed** where supported. If faces drift, generate a single reference image first and use image-to-video.

## 9. Production checklist
- [ ] Generate S1–S9 (2–3 takes each), pick best
- [ ] Assemble in order, trim to ~70s total
- [ ] Add one continuous voiceover track (§4)
- [ ] Add music + the ring/whoosh sound design (§5)
- [ ] Add captions (§6) and the round shield logo (corner watermark from S3, full logo on S9)
- [ ] Color-match clips for a consistent warm grade
- [ ] Export 9:16 (phones/social) — optionally a 16:9 version for web

---
*Notes: AI video can't accurately show the AetosOne app screens, so this film sells the **feeling** (one tap → everyone together) and lets your captions + real logo carry the product message. If you later want a second, factual "here's the actual app" video, a screen-recording + voiceover walkthrough is the accurate companion piece — ask and I'll script it.*
