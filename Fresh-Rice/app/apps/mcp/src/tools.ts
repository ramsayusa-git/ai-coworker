import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
type Api = (path: string, opts?: { method?: string; body?: any }) => Promise<any>;
type Z = typeof import('zod')['z'];

const rupees = (p: number | null | undefined) => p == null ? '' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const ok = (data: any) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const wrap = (fn: (a: any) => Promise<any>) => async (a: any) => { try { return ok(await fn(a)); } catch (e: any) { return { content: [{ type: 'text' as const, text: `Error: ${e.message || e}` }], isError: true }; } };

export function registerTools(s: McpServer, api: Api, z: Z) {
  // ---- Overview ----
  s.tool('freshrice_daily_brief', 'One-shot operations overview: today\'s orders, revenue, low stock, open issues, riders on duty, due follow-ups.', {}, wrap(async () => {
    const [dash, issues, live, fups, overdue] = await Promise.all([api('/admin/dashboard').catch(() => null), api('/issues/stats').catch(() => null), api('/admin/dispatch/live').catch(() => []), api('/sales/followups/today').catch(() => []), api('/sales/followups/overdue').catch(() => [])]);
    return { today: dash && { orders: dash.todayOrders, delivered: dash.delivered, failed: dash.failed, tomorrow: dash.tomorrowOrders, revenue30d: rupees(dash.revenue30dPaise), kg30d: dash.kg30d, customers: dash.customers, activeSubscriptions: dash.activeSubs, lowStock: dash.lowStock }, issues, riders: { onDuty: live.filter((r: any) => r.onDuty || r.route).length, online: live.filter((r: any) => r.online).length, total: live.length }, salesFollowups: { today: fups.length, overdue: overdue.length, overdueNames: overdue.slice(0, 10).map((l: any) => `${l.name} (${l.phone})`) } };
  }));

  // ---- Orders ----
  s.tool('freshrice_orders_list', 'List recent orders. Filter by status (PENDING_PAYMENT|CONFIRMED|PACKED|OUT_FOR_DELIVERY|DELIVERED|CANCELLED|FAILED), delivery date (YYYY-MM-DD), or customer phone.', { status: z.string().optional(), date: z.string().optional(), phone: z.string().optional(), limit: z.number().int().min(1).max(200).default(30) }, wrap(async (a) => {
    const rows = await api(`/admin/orders${a.date ? `?date=${a.date}` : ''}`);
    const ph = a.phone ? '+91' + a.phone.replace(/\D/g, '').slice(-10) : null;
    return rows.filter((o: any) => (!a.status || o.status === a.status) && (!ph || o.user?.phone === ph)).slice(0, a.limit).map((o: any) => ({ id: o.id, orderNo: o.orderNo, status: o.status, channel: o.channel, customer: o.user?.name, phone: o.user?.phone, deliveryDate: o.deliveryDate?.slice(0, 10), zone: o.address?.zone?.name, kg: o.totalKg, total: rupees(o.totalPaise), payment: o.payment?.method, paid: o.payment?.status }));
  }));
  s.tool('freshrice_order_get', 'Full detail for one order (items, lots, address, payment, rider, invoice history, events).', { orderId: z.string() }, wrap(async (a) => api(`/orders/${a.orderId}`)));
  s.tool('freshrice_order_set_status', 'WRITE. Move an order to PACKED / OUT_FOR_DELIVERY / DELIVERED / CANCELLED (ops override; normally dispatch does this).', { orderId: z.string(), status: z.enum(['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) }, wrap(async (a) => api(`/admin/orders/${a.orderId}/status`, { method: 'PATCH', body: { status: a.status } })));

  // ---- Customers ----
  s.tool('freshrice_customers_search', 'Find customers by name or phone fragment; returns lifetime orders/value.', { q: z.string() }, wrap(async (a) => {
    const rows = await api('/admin/customers'); const q = a.q.toLowerCase();
    return rows.filter((c: any) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, ''))).slice(0, 25);
  }));

  // ---- Stock ----
  s.tool('freshrice_stock_summary', 'Stock on hand per variety and warehouse, low-stock flags, FIFO oldest milled date.', {}, wrap(async () => api('/inventory/summary')));
  s.tool('freshrice_lots', 'Lots (batches) with mill, harvest, milled date, moisture, brokens, on-hand kg. Optional warehouseId.', { warehouseId: z.string().optional() }, wrap(async (a) => api(`/inventory/lots${a.warehouseId ? `?warehouseId=${a.warehouseId}` : ''}`)));
  s.tool('freshrice_trace_lot', 'Public traceability for a lot number (what a customer sees when scanning the bag QR), incl. cook-mode guide.', { lotNo: z.string() }, wrap(async (a) => api(`/inventory/trace/${encodeURIComponent(a.lotNo)}`)));

  // ---- Riders / field ----
  s.tool('freshrice_riders_live', 'Riders and field staff: live location, online/on-duty, route progress, phone.', {}, wrap(async () => api('/admin/dispatch/live')));
  s.tool('freshrice_dispatch_routes', 'Routes for a date (default today) with stops, rider, status.', { date: z.string().optional() }, wrap(async (a) => api(`/admin/dispatch/routes${a.date ? `?date=${a.date}` : ''}`)));
  s.tool('freshrice_working_hours', 'Duty-shift hours report per person between two dates (YYYY-MM-DD).', { from: z.string(), to: z.string() }, wrap(async (a) => api(`/admin/shifts?from=${a.from}&to=${a.to}`)));

  // ---- Issues desk ----
  s.tool('freshrice_issues_list', 'Support tickets. status: comma list of OPEN,IN_PROGRESS,WAITING_CUSTOMER,RESOLVED,CLOSED (default active).', { status: z.string().optional(), category: z.string().optional() }, wrap(async (a) => (await api(`/issues?${a.status ? `status=${a.status}&` : ''}${a.category ? `category=${a.category}` : ''}`)).map((i: any) => ({ id: i.id, ticketNo: i.ticketNo, status: i.status, priority: i.priority, category: i.category, title: i.title, customer: i.raisedBy?.name, phone: i.raisedBy?.phone, order: i.order?.orderNo, assignee: i.assignee?.name, slaDueAt: i.slaDueAt, lastMessage: i.messages?.[0]?.body }))));
  s.tool('freshrice_issue_get', 'Full ticket thread.', { issueId: z.string() }, wrap(async (a) => api(`/issues/${a.issueId}`)));
  s.tool('freshrice_issue_reply', 'WRITE. Reply to the customer on a ticket (also goes out on WhatsApp) or add an internal note.', { issueId: z.string(), body: z.string(), internal: z.boolean().default(false) }, wrap(async (a) => api(`/issues/${a.issueId}/messages`, { body: { body: a.body, internal: a.internal } })));
  s.tool('freshrice_issue_update', 'WRITE. Change status/priority/assignee, or resolve with a note.', { issueId: z.string(), status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(), assigneeId: z.string().nullable().optional(), resolution: z.string().optional() }, wrap(async (a) => { const { issueId, ...b } = a; return api(`/issues/${issueId}`, { method: 'PATCH', body: b }); }));
  s.tool('freshrice_issue_create', 'WRITE. Raise a ticket on behalf of a customer (by phone).', { phone: z.string(), category: z.enum(['WRONG_BAG', 'LATE', 'DAMAGED', 'MISSING', 'PAYMENT', 'RIDER', 'APP', 'OTHER']), title: z.string(), description: z.string().optional(), orderId: z.string().optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional() }, wrap(async (a) => { const { phone, ...b } = a; return api('/issues', { body: { ...b, onBehalfOfPhone: phone } }); }));

  // ---- Sales CRM ----
  s.tool('freshrice_leads_list', 'Sales leads pipeline. Optional status NEW|CONTACTED|QUALIFIED|PROPOSAL|WON|LOST.', { status: z.string().optional() }, wrap(async (a) => (await api(`/sales/leads${a.status ? `?status=${a.status}` : ''}`)).map((l: any) => ({ id: l.id, name: l.name, phone: l.phone, company: l.company, status: l.status, assignedTo: l.assignedTo?.name, estValue: rupees(l.estValuePaise), nextFollowUpAt: l.nextFollowUpAt, lastActivity: l.activities?.[0] && `${l.activities[0].type} ${l.activities[0].note || ''}` }))));
  s.tool('freshrice_followups_due', 'Leads with follow-ups due today and overdue.', {}, wrap(async () => ({ today: await api('/sales/followups/today'), overdue: await api('/sales/followups/overdue') })));
  s.tool('freshrice_lead_create', 'WRITE. Add a lead.', { name: z.string(), phone: z.string(), company: z.string().optional(), source: z.string().optional(), estValueRupees: z.number().optional(), notes: z.string().optional() }, wrap(async (a) => api('/sales/leads', { body: a })));
  s.tool('freshrice_lead_log_activity', 'WRITE. Log a CALL/WHATSAPP/EMAIL/VISIT/NOTE on a lead, optionally set next follow-up (YYYY-MM-DD).', { leadId: z.string(), type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'NOTE']), note: z.string().optional(), nextFollowUpAt: z.string().optional() }, wrap(async (a) => { const { leadId, ...b } = a; return api(`/sales/leads/${leadId}/activities`, { body: b }); }));
  s.tool('freshrice_lead_update', 'WRITE. Change a lead\'s stage / assignee / notes.', { leadId: z.string(), status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']).optional(), assignedToId: z.string().optional(), notes: z.string().optional(), estValueRupees: z.number().optional() }, wrap(async (a) => { const { leadId, ...b } = a; return api(`/sales/leads/${leadId}`, { method: 'PATCH', body: b }); }));

  // ---- Reports ----
  s.tool('freshrice_report', 'Run a report as JSON: daily | zones | gst | payables | stock-valuation | cohorts. from/to YYYY-MM-DD (daily/zones/gst).', { name: z.enum(['daily', 'zones', 'gst', 'payables', 'stock-valuation', 'cohorts']), from: z.string().optional(), to: z.string().optional() }, wrap(async (a) => api(`/admin/reports/${a.name}?${a.from ? `from=${a.from}&` : ''}${a.to ? `to=${a.to}` : ''}`)));

  // ---- Invoices ----
  s.tool('freshrice_invoices_list', 'Invoices (active + cancelled). Optional search on number/buyer/GSTIN.', { search: z.string().optional(), status: z.enum(['ISSUED', 'CANCELLED']).optional() }, wrap(async (a) => (await api(`/admin/invoices?${a.status ? `status=${a.status}&` : ''}${a.search ? `search=${encodeURIComponent(a.search)}` : ''}`)).map((i: any) => ({ id: i.id, invoiceNo: i.invoiceNo, status: i.status, revision: i.revision, orderId: i.orderId, orderNo: i.order?.orderNo, buyer: i.buyerName, gstin: i.buyerGstin, total: rupees(i.totalPaise), issuedAt: i.issuedAt }))));
  s.tool('freshrice_invoice_resend', 'WRITE. Resend an order\'s invoice on WhatsApp (signed link) and/or email (PDF).', { orderId: z.string(), channels: z.array(z.enum(['whatsapp', 'email'])).default(['whatsapp', 'email']), email: z.string().optional() }, wrap(async (a) => api(`/orders/${a.orderId}/invoice/resend`, { body: { channels: a.channels, email: a.email } })));
  s.tool('freshrice_invoice_reissue', 'WRITE. Cancel and reissue an invoice with corrected buyer details (audit trail kept). Reason required.', { orderId: z.string(), reason: z.string(), buyerName: z.string().optional(), buyerGstin: z.string().optional(), buyerAddress: z.string().optional() }, wrap(async (a) => { const { orderId, ...b } = a; return api(`/orders/${orderId}/invoice/reissue`, { body: b }); }));

  // ---- Marketing ----
  s.tool('freshrice_coupons_list', 'Coupons with usage.', {}, wrap(async () => api('/admin/coupons')));
  s.tool('freshrice_coupon_create', 'WRITE. Create a coupon.', { code: z.string(), type: z.enum(['PERCENT', 'FLAT']), value: z.number(), minOrderRupees: z.number().optional(), firstOrderOnly: z.boolean().optional(), usesPerUser: z.number().int().optional(), totalUses: z.number().int().optional(), validTo: z.string().optional() }, wrap(async (a) => api('/admin/coupons', { body: a })));

  // ---- Notifications log ----
  s.tool('freshrice_messages_log', 'Recent outbound messages (WhatsApp/SMS/email/log) — see what customers were told.', { limit: z.number().int().max(200).default(50) }, wrap(async (a) => (await api('/notifications')).slice(0, a.limit)));
}
