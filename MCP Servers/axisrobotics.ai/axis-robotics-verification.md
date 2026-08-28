# Axis Robotics — Verification Report

Checked against primary sources on 15 Aug 2026. Source: YouTube video "Axis Robotics Airdrop 2026 | Confirmed Rewards" (Hindi).

## Verdict

The **project is real and substantive**. The **video's task-farming advice is wrong** and following it will lower your points. The word "**Confirmed**" in the video title is not accurate — no token or airdrop terms have been announced.

---

## What checks out

| Claim | Status |
|---|---|
| $12M seed funding | ✅ Confirmed — led by Hack VC, with Nomad Capital, Pi Network Ventures, 10K Ventures |
| Real company / real tech | ✅ Peer-reviewable research: arXiv:2607.21588 (AXIS data engine, 15 authors) |
| Points system is live | ✅ Live, documented at docs.axisrobotics.ai |
| Points settle every 2 weeks | ✅ Epoch closes Friday 00:00 UTC, distributed Monday 12:00 UTC |
| Sign up by email / Google / X / wallet | ✅ Via Privy at hub.axisrobotics.ai; wallet auto-generated |
| Discord role tiers X/Y/Z-Axis | ✅ Real — 150 / 350 / 1000 points |
| Tasks have limited slots | ✅ Real, but see correction below |
| Alliance / BitRobot campaign | ✅ Real — Axis subnet on BitRobot, verified on Solana (not Base) |

**Official links only:** axisrobotics.ai · hub.axisrobotics.ai · docs.axisrobotics.ai · x.com/axisrobotics · discord.gg/axisrobotics

---

## What the video got wrong

### 1. "Airdrop is confirmed"
The docs say the opposite, verbatim:

> "Holding Points guarantees no eligibility, allocation, or distribution, and the Point System establishes no token balance, conversion ratio, or claim right."

Points are "planned as **one input** in a future Community Contributor Airdrop." No token, no date, no allocation formula. Treat this as speculative.

### 2. "Refresh the page to reset the timer so your time shows lower" ❌
This is the most damaging advice in the video. Points are explicitly **not** scored on wall-clock time:

> "Points are awarded for the data you provide, not for the time spent."

Scoring is: success → efficiency → motion smoothness, judged by replay simulation + rule checks + a vision-language model. Gaming a timer does nothing.

### 3. "If you fail, just retry again and again" ❌
There is a hard cap of **5 completions per task per account**, and — critically — **your score for a task is the AVERAGE of your attempts, not your best one.**

> "Repeat a task to do it better, not to do it more."

Sloppy repeats actively lower your points. Historical over-farming (past 10 valid submissions per task from one address) is excluded from scoring entirely, and those addresses carry a **penalty factor**.

### 4. "I completed tasks, never signed them, they still count" ❌
Unsigned runs earn **zero**. Signing on Base is the gate:

> "Completing a task is not the last step; signing it is."

Signing late costs nothing — it just counts toward the epoch you signed in. Sign everything from your Portfolio.

### 5. "1,200 slots, 321 people completed it"
Slots count **data entries, not users**. 240 users × 5 runs = 1,200 slots filled. The leaderboard number she read is not a user count.

### 6. Snapshot date
Video implies ongoing retroactive credit. The retroactive snapshot was **16:00 UTC, 29 July 2026** and that phase is **closed**. Everything now runs epoch-by-epoch.

---

## What actually maximises points

Five factors, none of which is a checklist item you can max alone:

1. **Volume** — valid tasks completed
2. **Difficulty** — 1–5 stars, acts as a multiplier
3. **Score** — per-submission quality (algorithmic)
4. **Diversity** — spread across *scenarios* (kitchen, office, workshop…) AND *skills* (pick, place, stack, rotate, insert…). Many scenarios with one skill = diversity near the floor.
5. **Referrals** — only direct invitees, and only credited by what they actually produce. Dead referrals are worth nothing.

**Post-training tasks** have a hard **30-second takeover budget** — blow it and the run fails outright, no score. Score rises with the share of the run the *policy* drove, so minimal precise correction beats taking over completely.

**Practical priority:** take harder tasks, spread across scenarios and skills, do each one carefully once or twice, and sign everything.

---

## Risks to be aware of

- **No token guarantee.** You are producing valuable robotics training data for a VC-backed startup in exchange for non-transferable points that may or may not convert to anything.
- **Referral bias.** The airdrop-aggregator links (CryptoRank, and likely the video's Telegram) carry embedded invite codes — the person sharing earns points from your output. Not fraud, but their enthusiasm is not disinterested.
- **Phishing surface.** High-attention airdrops attract clone sites. Only ever reach the hub via `hub.axisrobotics.ai`. Never sign a transaction you didn't initiate from your Portfolio.
- **Time cost.** Tasks are slow and skill-based; the video itself concedes the presenter couldn't complete one cleanly on camera.

---

## Sources

- [Axis Robotics — Points (official docs)](https://docs.axisrobotics.ai/contributor-guide/points.md)
- [Axis Robotics — How Tasks Work (official docs)](https://docs.axisrobotics.ai/contributor-guide/how-tasks-work.md)
- [Axis Robotics — What Is Axis Robotics (official docs)](https://docs.axisrobotics.ai/introduction/readme.md)
- [The Block — Axis Robotics raised $12M](https://www.theblock.co/post/409724/axis-robotics-raised-12m-funding-to-build-the-compounding-data-engine-accelerating-physical-ai) (note: sponsored post)
- [arXiv:2607.21588 — AXIS: A Growable Community-Driven Data Engine](https://arxiv.org/abs/2607.21588)
- [CryptoRank — Axis Robotics airdrop guide](https://cryptorank.io/drophunting/axis-ai-activity1105)
- [@axisrobotics on X — points snapshot announcement](https://x.com/axisrobotics/status/2081726624744230937)
