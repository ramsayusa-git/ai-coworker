import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rupees } from '../common/money';
import { InvoiceTemplatesService } from './templates';
import { forwardRef, Inject } from '@nestjs/common';

function fy(d = new Date()) { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; }
const STAFF = ['ADMIN', 'OPS'];
const PUBLIC_BASE = process.env.PUBLIC_WEB_URL || 'https://freshrice.in';

/** Fallback seller block, only used if no InvoiceTemplate row exists yet (templates.ts seeds one on first use). */
const FALLBACK: any = { brandName: 'FreshRice', legalName: 'Aetos Tech Labs', address: 'Kukatpally, Hyderabad 500072', gstin: '36XXXXX0000X1Z5', fssai: '13626000000000', footer: 'Rice is a pre-packed & labelled commodity taxed at 5% GST. Store in a cool, dry place. Milling date and lot printed on each bag.', accentColor: '#1d5133', showLot: true, numberPrefix: 'FR' };

const ORDER_INCLUDE = { user: true, b2bAccount: true, address: true, items: { include: { sku: { include: { variety: true } }, lot: true } }, invoices: { orderBy: { revision: 'desc' as const } }, payment: true };

@Injectable()
export class InvoicesService {
  constructor(private db: PrismaService, private notify: NotificationsService, @Inject(forwardRef(() => InvoiceTemplatesService)) private templates: InvoiceTemplatesService) {}
  private async tplFor(o: any) { return (await this.templates.forChannel(o.channel === 'B2B' ? 'B2B' : 'B2C')) || FALLBACK; }
  private async tplOf(inv: any, o: any) { return (inv.templateId && (await this.db.invoiceTemplate.findUnique({ where: { id: inv.templateId } }))) || (await this.tplFor(o)); }

  private canSee(o: any, requester?: { sub: string; role: string }) { if (requester && o.userId !== requester.sub && !STAFF.includes(requester.role) && requester.role !== 'SALES') throw new ForbiddenException(); }
  linesFor(o: any) { return o.items.map((i: any) => ({ description: `${i.sku.variety.name} ${i.sku.packKg}kg`, hsn: i.sku.variety.isAddon ? '0713' : '1006', lotNo: i.lot?.lotNo, qty: i.qty, unitPaise: i.unitPaise, gstPct: i.sku.gstPct, amountPaise: i.unitPaise * i.qty, gstPaise: Math.round((i.unitPaise * i.qty * i.sku.gstPct) / 100) })); }

  /** Idempotent: returns the active (ISSUED) invoice or issues one for a confirmed/delivered order. */
  async forOrder(orderId: string, requester?: { sub: string; role: string }) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    this.canSee(o, requester);
    const active = o.invoices.find((i) => i.status === 'ISSUED');
    if (active) return { invoice: active, order: o, history: o.invoices, tpl: await this.tplOf(active, o) };
    if (o.status === 'PENDING_PAYMENT' || o.status === 'CANCELLED') return { invoice: null, order: o, history: o.invoices };
    const tpl = await this.tplFor(o);
    const invoice = await this.db.invoice.create({ data: { invoiceNo: await this.templates.nextInvoiceNo(tpl), templateId: tpl.id, orderId, revision: o.invoices.length + 1, buyerName: o.b2bAccount?.name || o.user.name || o.user.phone, buyerGstin: o.b2bAccount?.gstin, buyerAddress: `${o.address.line1}${o.address.landmark ? ', ' + o.address.landmark : ''}, Hyderabad ${o.address.pincode}`, sellerGstin: tpl.gstin, fssaiNo: tpl.fssai, lines: this.linesFor(o), subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, totalPaise: o.totalPaise } });
    return { invoice, order: o, history: [invoice, ...o.invoices], tpl };
  }

  /** Reissue: cancel the current invoice (kept for audit) and issue a new number with corrected buyer details / recomputed lines. */
  async reissue(orderId: string, u: { sub: string; role: string }, b: { reason: string; buyerName?: string; buyerGstin?: string; buyerAddress?: string }) {
    if (!b.reason?.trim()) throw new BadRequestException('A reason is required to reissue an invoice');
    const { invoice: cur, order: o } = await this.forOrder(orderId, u);
    if (!cur) throw new BadRequestException('No invoice to reissue — the order is unpaid or cancelled');
    const tpl = await this.tplFor(o); const newNo = await this.templates.nextInvoiceNo(tpl);
    const [cancelled, fresh] = await this.db.$transaction([
      this.db.invoice.update({ where: { id: cur.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: b.reason.trim(), cancelledById: u.sub } }),
      this.db.invoice.create({ data: { invoiceNo: newNo, templateId: tpl.id, orderId, revision: cur.revision + 1, supersedesId: cur.id, buyerName: b.buyerName?.trim() || cur.buyerName, buyerGstin: b.buyerGstin !== undefined ? (b.buyerGstin.trim().toUpperCase() || null) : cur.buyerGstin, buyerAddress: b.buyerAddress?.trim() || cur.buyerAddress, sellerGstin: tpl.gstin, fssaiNo: tpl.fssai, lines: this.linesFor(o), subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, totalPaise: o.totalPaise } }),
    ]);
    await this.db.event.create({ data: { actor: u.sub, type: 'invoice_reissued', payload: { orderId, from: cur.invoiceNo, to: fresh.invoiceNo, reason: b.reason } } });
    await this.notify.send(o.user.phone, 'invoice_reissued', `Your FreshRice invoice for order #${o.orderNo} has been reissued as ${fresh.invoiceNo} (${b.reason}). View: ${this.publicUrl(fresh.id)}`, o.user.email);
    return { invoice: fresh, cancelled };
  }

  /** Resend the active invoice on WhatsApp (link) and/or email (PDF attached). Owner or staff. */
  async resend(orderId: string, u: { sub: string; role: string }, channels: ('whatsapp' | 'email')[] = ['whatsapp', 'email'], toEmail?: string) {
    const { invoice, order: o } = await this.forOrder(orderId, u);
    if (!invoice) throw new BadRequestException('No invoice for this order yet');
    const url = this.publicUrl(invoice.id); const results: Record<string, string> = {};
    if (channels.includes('whatsapp')) {
      const n = await this.notify.send(o.user.phone, 'invoice', `FreshRice tax invoice ${invoice.invoiceNo} for order #${o.orderNo} (₹${rupees(invoice.totalPaise).toFixed(2)}): ${url}`);
      results.whatsapp = n.status;
    }
    if (channels.includes('email')) {
      const email = toEmail || o.user.email;
      if (!email) results.email = 'skipped: no email on file';
      else if (!this.notify.emailConfigured) results.email = 'skipped: SMTP not configured';
      else { try { await this.notify.sendEmail(email, `FreshRice invoice ${invoice.invoiceNo} — order #${o.orderNo}`, `Please find attached your tax invoice ${invoice.invoiceNo}. Online copy: ${url}`, { html: this.html(invoice, o, { embed: true, tpl: await this.tplOf(invoice, o) }), attachments: [{ filename: `${invoice.invoiceNo.replace(/\//g, '-')}.pdf`, content: await this.pdf(invoice, o, await this.tplOf(invoice, o)), contentType: 'application/pdf' }] }); results.email = 'sent'; } catch (e: any) { results.email = 'failed: ' + (e.message || e).toString().slice(0, 100); } }
    }
    await this.db.event.create({ data: { actor: u.sub, type: 'invoice_sent', payload: { orderId, invoiceNo: invoice.invoiceNo, channels, results } } });
    return { invoiceNo: invoice.invoiceNo, url, results };
  }

  /** Signed public link (no login) — safe to forward on WhatsApp/email. */
  sign(id: string) { return createHmac('sha256', process.env.JWT_SECRET || 'dev').update('inv:' + id).digest('hex').slice(0, 24); }
  publicUrl(id: string) { return `${PUBLIC_BASE}/i/${id}/${this.sign(id)}`; }
  async byPublic(id: string, sig: string) {
    if (sig !== this.sign(id)) throw new ForbiddenException('Bad link');
    const invoice = await this.db.invoice.findUnique({ where: { id } }); if (!invoice) throw new NotFoundException();
    const order = await this.db.order.findUniqueOrThrow({ where: { id: invoice.orderId }, include: ORDER_INCLUDE });
    return { invoice, order, tpl: await this.tplOf(invoice, order) };
  }

  html(inv: any, order: any, opts: { embed?: boolean; tpl?: any } = {}) {
    const T = opts.tpl || FALLBACK; const esc = (x: any) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    const rows = (inv.lines as any[]).map((l) => `<tr><td>${esc(l.description)}${T.showLot && l.lotNo ? `<br><small>Lot ${esc(l.lotNo)}</small>` : ''}</td><td>${l.hsn}</td><td class=r>${l.qty}</td><td class=r>₹${rupees(l.unitPaise).toFixed(2)}</td><td class=r>${l.gstPct}%</td><td class=r>₹${rupees(l.amountPaise).toFixed(2)}</td></tr>`).join('');
    const cgst = rupees(inv.gstPaise) / 2; const cancelled = inv.status === 'CANCELLED'; const b2b = order.channel === 'B2B' || !!inv.buyerGstin;
    return `<!doctype html><html><head><meta charset=utf-8><title>${esc(inv.invoiceNo)}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;color:#222;font-size:13px;position:relative}h1{font-size:20px;margin:0;color:${T.accentColor}}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f4}.r{text-align:right}.tot td{font-weight:bold}.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.muted{color:#666}.logo{height:48px;margin-bottom:6px;display:block}.wm{position:absolute;top:35%;left:10%;font-size:80px;color:rgba(200,0,0,.15);transform:rotate(-20deg);font-weight:bold;pointer-events:none}.box{border:1px solid #ddd;padding:8px;margin-top:12px;font-size:12px;white-space:pre-line}.sig{text-align:right;margin-top:28px}@media print{button{display:none}}</style></head><body>
${cancelled ? '<div class=wm>CANCELLED</div>' : ''}
<div class=hdr><div>${T.logo ? `<img class=logo src="${T.logo}" alt="">` : ''}<h1>${esc(T.brandName)}</h1><div class=muted>${esc(T.legalName)} · ${esc(T.address)}<br>GSTIN ${esc(inv.sellerGstin)} · FSSAI ${esc(inv.fssaiNo)}${T.phone ? ' · ' + esc(T.phone) : ''}${T.email ? ' · ' + esc(T.email) : ''}</div></div><div style="text-align:right"><b>TAX INVOICE</b>${inv.revision > 1 ? ` <span class=muted>(reissue ${inv.revision})</span>` : ''}<br>${esc(inv.invoiceNo)}<br>${new Date(inv.issuedAt).toLocaleDateString('en-IN')}<br>Order #${order.orderNo}</div></div>
${cancelled ? `<p style="color:#b00"><b>Cancelled</b> on ${new Date(inv.cancelledAt).toLocaleDateString('en-IN')} — ${esc(inv.cancelReason)}. Superseded by a reissued invoice.</p>` : ''}
<p><b>Bill to:</b> ${esc(inv.buyerName)}${inv.buyerGstin ? ' · GSTIN ' + esc(inv.buyerGstin) : ''}<br>${esc(inv.buyerAddress)}</p>
<table><tr><th>Item</th><th>HSN</th><th class=r>Qty</th><th class=r>Rate</th><th class=r>GST</th><th class=r>Amount</th></tr>${rows}
<tr><td colspan=5 class=r>Subtotal</td><td class=r>₹${rupees(inv.subtotalPaise).toFixed(2)}</td></tr>
<tr><td colspan=5 class=r>CGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr><tr><td colspan=5 class=r>SGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr>
${order.discountPaise ? `<tr><td colspan=5 class=r>Wallet / discount</td><td class=r>-₹${rupees(order.discountPaise).toFixed(2)}</td></tr>` : ''}
<tr class=tot><td colspan=5 class=r>Total</td><td class=r>₹${rupees(inv.totalPaise).toFixed(2)}</td></tr></table>
${b2b && T.bankDetails ? `<div class=box><b>Payment details</b>\n${esc(T.bankDetails)}</div>` : ''}
${T.terms ? `<div class=box>${esc(T.terms)}</div>` : ''}
<p class=muted>Payment: ${esc(order.payment?.method)} · ${esc(order.payment?.status)}<br>${esc(T.footer)}</p>
${T.signatory ? `<div class=sig>${esc(T.signatory)}</div>` : ''}
${opts.embed ? '' : '<button onclick="print()">Print / Save PDF</button>'}</body></html>`;
  }

  /** PDF version (for email attachments / downloads). */
  pdf(inv: any, order: any, tpl?: any): Promise<Buffer> {
    const T = tpl || FALLBACK;
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
      const money = (p: number) => 'Rs ' + rupees(p).toFixed(2); let y0 = 40;
      if (T.logo && /^data:image\/(png|jpeg);base64,/.test(T.logo)) { try { doc.image(Buffer.from(T.logo.split(',')[1], 'base64'), 40, 40, { height: 40 }); y0 = 86; } catch {} }
      doc.fontSize(18).fillColor(T.accentColor || '#1d5133').text(T.brandName, 40, y0); doc.fontSize(9).fillColor('#555').text(`${T.legalName} · ${T.address}`).text(`GSTIN ${inv.sellerGstin} · FSSAI ${inv.fssaiNo}${T.phone ? ' · ' + T.phone : ''}${T.email ? ' · ' + T.email : ''}`);
      doc.fontSize(12).fillColor('#000').text(`TAX INVOICE${inv.revision > 1 ? ` (reissue ${inv.revision})` : ''}`, 350, 40, { align: 'right' }); doc.fontSize(10).text(inv.invoiceNo, { align: 'right' }).text(new Date(inv.issuedAt).toLocaleDateString('en-IN'), { align: 'right' }).text(`Order #${order.orderNo}`, { align: 'right' });
      if (inv.status === 'CANCELLED') { doc.save().fontSize(60).fillColor('#c00').opacity(0.15).rotate(-20, { origin: [300, 400] }).text('CANCELLED', 120, 380).restore(); }
      doc.moveDown(2); doc.fontSize(10).fillColor('#000').text(`Bill to: ${inv.buyerName}${inv.buyerGstin ? ' · GSTIN ' + inv.buyerGstin : ''}`, 40).fillColor('#555').text(inv.buyerAddress);
      doc.moveDown(); const top = doc.y; const cols = [40, 290, 340, 390, 450, 500]; const w = [250, 50, 50, 60, 50, 60];
      doc.rect(40, top - 2, 515, 16).fill('#f4ecd8').fillColor('#000').font('Helvetica-Bold').fontSize(9);
      ['Item', 'HSN', 'Qty', 'Rate', 'GST', 'Amount'].forEach((h, i) => doc.text(h, cols[i] + 2, top, { width: w[i] - 4, align: i >= 2 ? 'right' : 'left' }));
      doc.font('Helvetica').moveDown(0.8);
      for (const l of inv.lines as any[]) { const y = doc.y; [`${l.description}${T.showLot && l.lotNo ? ` (Lot ${l.lotNo})` : ''}`, l.hsn, String(l.qty), money(l.unitPaise), `${l.gstPct}%`, money(l.amountPaise)].forEach((v, i) => doc.text(v, cols[i] + 2, y, { width: w[i] - 4, align: i >= 2 ? 'right' : 'left' })); doc.moveDown(0.6); }
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#ccc'); doc.moveDown(0.4);
      const tot = (label: string, v: string, bold = false) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 340, y, { width: 150, align: 'right' }).text(v, 500, y, { width: 55, align: 'right' }); doc.moveDown(0.5); };
      tot('Subtotal', money(inv.subtotalPaise)); tot('CGST', money(inv.gstPaise / 2)); tot('SGST', money(inv.gstPaise / 2)); if (order.discountPaise) tot('Wallet / discount', '-' + money(order.discountPaise)); tot('Total', money(inv.totalPaise), true);
      doc.moveDown(1); doc.font('Helvetica').fontSize(8).fillColor('#333');
      if ((order.channel === 'B2B' || inv.buyerGstin) && T.bankDetails) { doc.font('Helvetica-Bold').text('Payment details', 40).font('Helvetica').text(T.bankDetails, { width: 515 }); doc.moveDown(0.5); }
      if (T.terms) { doc.text(T.terms, 40, undefined, { width: 515 }); doc.moveDown(0.5); }
      doc.fillColor('#555').text(`Payment: ${order.payment?.method || '-'} · ${order.payment?.status || '-'}`, 40).text(T.footer, { width: 515 });
      if (T.signatory) { doc.moveDown(2); doc.fillColor('#000').text(T.signatory, 300, undefined, { width: 255, align: 'right' }); }
      doc.end();
    });
  }

  list(q: { status?: string; search?: string } = {}) {
    return this.db.invoice.findMany({ where: { ...(q.status ? { status: q.status as any } : {}), ...(q.search ? { OR: [{ invoiceNo: { contains: q.search, mode: 'insensitive' } }, { buyerName: { contains: q.search, mode: 'insensitive' } }, { buyerGstin: { contains: q.search, mode: 'insensitive' } }] } : {}) }, orderBy: { issuedAt: 'desc' }, take: 300, include: { order: { select: { id: true, orderNo: true, status: true, channel: true, payment: true, user: { select: { phone: true, email: true } } } } } });
  }
}
