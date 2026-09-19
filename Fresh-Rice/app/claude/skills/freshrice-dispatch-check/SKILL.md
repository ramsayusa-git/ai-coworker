---
name: freshrice-dispatch-check
description: Pre-dispatch sanity check for tomorrow's FreshRice deliveries — unbatched orders, routes without riders, riders not on duty, stock allocation gaps. Use around 6–7 pm when asked "are we ready for tomorrow" or "dispatch check".
---
# FreshRice dispatch check

1. `freshrice_orders_list` with `date` = tomorrow and status `CONFIRMED` → these are NOT batched yet. If any, say so (batching happens on the Dispatch page).
2. `freshrice_dispatch_routes` with tomorrow's date. For each route: rider assigned? total kg vs vehicle capacity? stops with no lat/lng?
3. `freshrice_riders_live`: every rider assigned to a route should be `active`. Riders with routes but no location in 24h are worth a call — include phone numbers.
4. `freshrice_stock_summary`: compare tomorrow's total kg per variety against on-hand; flag any variety where on-hand < tomorrow's kg × 1.2.
5. `freshrice_issues_list` status `OPEN,IN_PROGRESS` category `LATE,WRONG_BAG` — open delivery complaints that dispatch should know about.

Output: a checklist with ✅/⚠️ per item and the specific fix for each ⚠️ (which order, which route, which rider, how many kg short). Under 250 words.
