---
name: freshrice-gst-pack
description: Month-end GST and finance pack for FreshRice — GST register totals (CGST/SGST), invoice count, cancelled/reissued invoices, vendor payables, stock valuation. Use when asked for "GST pack", "month end", "numbers for the CA".
---
# FreshRice GST / month-end pack

1. Ask (or infer) the month. from = first day, to = last day (YYYY-MM-DD).
2. `freshrice_report` name `gst` with from/to → summary.taxable / cgst / sgst / total / invoices / b2b.
3. `freshrice_invoices_list` status `CANCELLED` → list any cancelled in the month with their reissued replacement (revision > 1) so the CA can reconcile numbering gaps.
4. `freshrice_report` name `daily` for the month → revenue, GST, COGS, gross margin totals (sum the rows).
5. `freshrice_report` name `payables` → outstanding + overdue vendor amounts.
6. `freshrice_report` name `stock-valuation` → closing stock value.

Present: a short table (Taxable, CGST, SGST, Total, Invoices, of which B2B), then Cancelled/reissued invoices, then Revenue/COGS/GM, Payables, Closing stock. Note that the same reports export as CSV/XLSX/PDF from Admin → Reports if the CA wants files. Amounts in ₹ with Indian grouping.
