---
name: freshrice-issue-triage
description: Work the FreshRice issues desk — triage open tickets, draft replies in FreshRice's voice, assign, resolve. Use when asked to "handle support", "clear the issues queue", "reply to ticket #N".
---
# FreshRice issue triage

Requires the `freshrice` MCP server with a **write** key.

1. `freshrice_issues_list` (default = active). Sort: SLA breached first, then URGENT/HIGH, then oldest.
2. For each ticket: `freshrice_issue_get`. Read the whole thread — the customer may have added WhatsApp messages.
3. Decide: needs info from customer → reply + status `WAITING_CUSTOMER`; fixable now (replacement, refund note, rider call) → reply with the concrete action and ETA, status `IN_PROGRESS`; done → `freshrice_issue_update` with `status: RESOLVED` and a one-line `resolution`.
4. Replies go to the customer on WhatsApp verbatim. Voice: warm, short, specific — say what will happen and when ("Replacement 20 kg bag with rider Ravi tomorrow between 7–9 am"). No corporate filler, no "we apologise for the inconvenience". Use the customer's first name if known. Never promise refunds over ₹500 without an internal note asking OPS to approve.
5. Internal facts (which rider, lot number, refund amount) go in an internal note (`internal: true`), not the customer reply.
6. Finish with a table: ticket · action taken · new status · who owns it next.

Before sending any reply, show the drafts to the operator and wait for a yes — customer messages are real sends.
