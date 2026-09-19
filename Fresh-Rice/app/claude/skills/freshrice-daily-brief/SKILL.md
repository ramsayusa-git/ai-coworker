---
name: freshrice-daily-brief
description: Morning operations brief for FreshRice — orders today/tomorrow, revenue, stock, riders on duty, open issues, due follow-ups — with the three things that need attention. Use when asked "how are we doing", "morning brief", "what needs attention today".
---
# FreshRice daily brief

Requires the `freshrice` MCP server.

1. Call `freshrice_daily_brief`.
2. If `issues.breached > 0` or `issues.dueSoon > 0`, call `freshrice_issues_list` (status `OPEN,IN_PROGRESS`) and list the breached/at-risk tickets by number, customer and age.
3. If `today.lowStock` is non-empty, call `freshrice_stock_summary` and say how many days of stock remain per low variety (use 30-day kg from the brief ÷ 30 as the daily burn).
4. If `salesFollowups.overdue > 0`, call `freshrice_followups_due` and name the overdue leads and their reps.
5. Call `freshrice_riders_live`; flag riders with a route but `online: false` (phone not sending location).

Write the brief as: one line of numbers (orders today · delivered · tomorrow · 30-day revenue · kg), then **Needs attention today** as at most three bullets, each with the exact tool to fix it (reply on ticket, reorder stock, chase lead, call rider). Amounts in ₹ (Paise ÷ 100). Keep it under 200 words.
