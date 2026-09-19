---
name: freshrice-lead-followups
description: Sales follow-up run for FreshRice — due and overdue leads, draft WhatsApp follow-ups per lead, log the activity and set the next date. Use when asked "who do I call today", "follow-ups", "chase the pipeline".
---
# FreshRice lead follow-ups

Requires the `freshrice` MCP server with a **write** key for logging.

1. `freshrice_followups_due` → overdue first, then today. `freshrice_leads_list` for the full pipeline if asked.
2. For each lead: draft a WhatsApp message in FreshRice's voice — one line of context (their society/hotel/canteen), the concrete offer (mill-direct Sona Masoori, aged 6–12 months, printed milling date, ₹/kg for their tier), one clear ask (sample bag / call slot). Under 60 words. No emojis except 🌾 once.
3. Show all drafts; the rep sends them from their phone (the app does not auto-send lead messages).
4. After the rep confirms which were sent: `freshrice_lead_log_activity` type `WHATSAPP` with the message summary and `nextFollowUpAt` 3 days out (7 for PROPOSAL stage). Move stage with `freshrice_lead_update` if the rep says so (e.g. NEW → CONTACTED).
5. End with: leads touched, next follow-up dates, and any lead with 3+ touches and no reply — suggest moving to LOST or a visit.
