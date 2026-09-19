import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rupees } from '../common/money';

function fy(d = new Date()) { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; }
const STAFF = ['ADMIN', 'OPS'];
const PUBLIC_BASE = process.env.PUBLIC_WEB_URL || 'https://freshrice.in';

/** Seller block. #39 (invoice template management) will move this into a Settings table; everything below reads it from here. */
export const SELLER = { name: 'FreshRice', legal: 'Aetos Tech Labs', address: 'Kukatpally, Hyderabad 500072', gstin: '36XXXXX0000X1Z5', fssai: '13626000000000', footer: 'Rice is a pre-packed & labelled commodity taxed at 5% GST. Store in a cool, dry place. Milling date and lot printed on each bag.' };

const ORDER_INCLUDE = { user: true, b2bAccount: true, address: true, items: { include: { sku: { include: { variety: true } }, lot: true } }, invoices: { orderBy: { revision: 'desc' as const } }, payment: true };

@Injectable()
export class InvoicesService {
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  private canSee(o: any, requester?: { sub: string; role: string }) { if (requester && o.userId !== requester.sub && !STAFF.includes(requester.role) && requester.role !== 'SALES') throw new ForbiddenException(); }
  private nextNo = async () => `FR/${fy()}/${String((await this.db.invoice.count()) + 1).padStart(6, '0')}`;
  private linesFor(o: any) { return o.items.map((i: any) => ({ description: `${i.sku.variety.name} ${i.sku.packKg}kg`, hsn: i.sku.variety.isAddon ? '0713' : '1006', lotNo: i.lot?.lotNo, qty: i.qty, unitPaise: i.unitPaise, gstPct: i.sku.gstPct, amountPaise: i.unitPaise * i.qty, gstPaise: Math.round((i.unitPaise * i.qty * i.sku.gstPct) / 100) })); }

  /** Idempotent: returns the active (ISSUED) invoice or issues one for a confirmed/delivered order. */
  async forOrder(orderId: string, requester?: { sub: string; role: string }) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    this.canSee(o, requester);
    const active = o.invoices.find((i) => i.status === 'ISSUED');
    if (active) return { invoice: active, order: o, history: o.invoices };
    if (o.status === 'PENDING_PAYMENT' || o.status === 'CANCELLED') return { invoice: null, order: o, history: o.invoices };
    const invoice = await this.db.invoice.create({ data: { invoiceNo: await this.nextNo(), orderId, revision: o.invoices.length + 1, buyerName: o.b2bAccount?.name || o.user.name || o.user.phone, buyerGstin: o.b2bAccount?.gstin, buyerAddress: `${o.address.line1}${o.address.landmark ? ', ' + o.address.landmark : ''}, Hyderabad ${o.address.pincode}`, sellerGstin: SELLER.gstin, fssaiNo: SELLER.fssai, lines: this.linesFor(o), subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, totalPaise: o.totalPaise } });
    return { invoice, order: o, history: [invoice, ...o.invoices] };
  }

  /** Reissue: cancel the current invoice (kept for audit) and issue a new number with corrected buyer details / recomputed lines. */
  async reissue(orderId: string, u: { sub: string; role: string }, b: { reason: string; buyerName?: string; buyerGstin?: string; buyerAddress?: string }) {
    if (!b.reason?.trim()) throw new BadRequestException('A reason is required to reissue an invoice');
    const { invoice: cur, order: o } = await this.forOrder(orderId, u);
    if (!cur) throw new BadRequestException('No invoice to reissue — the order is unpaid or cancelled');
    const [cancelled, fresh] = await this.db.$transaction([
      this.db.invoice.update({ where: { id: cur.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: b.reason.trim(), cancelledById: u.sub } }),
      this.db.invoice.create({ data: { invoiceNo: await this.nextNo(), orderId, revision: cur.revision + 1, supersedesId: cur.id, buyerName: b.buyerName?.trim() || cur.buyerName, buyerGstin: b.buyerGstin !== undefined ? (b.buyerGstin.trim().toUpperCase() || null) : cur.buyerGstin, buyerAddress: b.buyerAddress?.trim() || cur.buyerAddress, sellerGstin: SELLER.gstin, fssaiNo: SELLER.fssai, lines: this.linesFor(o), subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, totalPaise: o.totalPaise } }),
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
      else { try { await this.notify.sendEmail(email, `FreshRice invoice ${invoice.invoiceNo} — order #${o.orderNo}`, `Please find attached your tax invoice ${invoice.invoiceNo}. Online copy: ${url}`, { html: this.html(invoice, o, { embed: true }), attachments: [{ filename: `${invoice.invoiceNo.replace(/\//g, '-')}.pdf`, content: await this.pdf(invoice, o), contentType: 'application/pdf' }] }); results.email = 'sent'; } catch (e: any) { results.email = 'failed: ' + (e.message || e).toString().slice(0, 100); } }
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
    return { invoice, order };
  }

  html(inv: any, order: any, opts: { embed?: boolean } = {}) {
    const rows = (inv.lines as any[]).map((l) => `<tr><td>${l.description}<br><small>Lot ${l.lotNo || '-'}</small></td><td>${l.hsn}</td><td class=r>${l.qty}</td><td class=r>₹${rupees(l.unitPaise).toFixed(2)}</td><td class=r>${l.gstPct}%</td><td class=r>₹${rupees(l.amountPaise).toFixed(2)}</td></tr>`).join('');
    const cgst = rupees(inv.gstPaise) / 2; const cancelled = inv.status === 'CANCELLED';
    return `<!doctype html><html><head><meta charset=utf-8><title>${inv.invoiceNo}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;color:#222;font-size:13px;position:relative}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f4}.r{text-align:right}.tot td{font-weight:bold}.hdr{display:flex;justify-content:space-between}.muted{color:#666}.wm{position:absolute;top:35%;left:10%;font-size:80px;color:rgba(200,0,0,.15);transform:rotate(-20deg);font-weight:bold;pointer-events:none}@media print{button{display:none}}</style></head><body>
${cancelled ? '<div class=wm>CANCELLED</div>' : ''}
<div class=hdr><div><h1>${SELLER.name}</h1><div class=muted>${SELLER.legal} · ${SELLER.address}<br>GSTIN ${inv.sellerGstin} · FSSAI ${inv.fssaiNo}</div></div><div style="text-align:right"><b>TAX INVOICE</b>${inv.revision > 1 ? ` <span class=muted>(reissue ${inv.revision})</span>` : ''}<br>${inv.invoiceNo}<br>${new Date(inv.issuedAt).toLocaleDateString('en-IN')}<br>Order #${order.orderNo}</div></div>
${cancelled ? `<p style="color:#b00"><b>Cancelled</b> on ${new Date(inv.cancelledAt).toLocaleDateString('en-IN')} — ${inv.cancelReason || ''}. Superseded by a reissued invoice.</p>` : ''}
<p><b>Bill to:</b> ${inv.buyerName}${inv.buyerGstin ? ' · GSTIN ' + inv.buyerGstin : ''}<br>${inv.buyerAddress}</p>
<table><tr><th>Item</th><th>HSN</th><th class=r>Qty</th><th class=r>Rate</th><th class=r>GST</th><th class=r>Amount</th></tr>${rows}
<tr><td colspan=5 class=r>Subtotal</td><td class=r>₹${rupees(inv.subtotalPaise).toFixed(2)}</td></tr>
<tr><td colspan=5 class=r>CGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr><tr><td colspan=5 class=r>SGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr>
${order.discountPaise ? `<tr><td colspan=5 class=r>Wallet / discount</td><td class=r>-₹${rupees(order.discountPaise).toFixed(2)}</td></tr>` : ''}
<tr class=tot><td colspan=5 class=r>Total</td><td class=r>₹${rupees(inv.totalPaise).toFixed(2)}</td></tr></table>
<p class=muted>Payment: ${order.payment?.method} · ${order.payment?.status}<br>${SELLER.footer}</p>
${opts.embed ? '' : '<button onclick="print()">Print / Save PDF</button>'}</body></html>`;
  }

  /** PDF version (for email attachments / downloads). */
  pdf(inv: any, order: any): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
      const money = (p: number) => 'Rs ' + rupees(p).toFixed(2);
      doc.fontSize(18).fillColor('#1d5133').text(SELLER.name); doc.fontSize(9).fillColor('#555').text(`${SELLER.legal} · ${SELLER.address}`).text(`GSTIN ${inv.sellerGstin} · FSSAI ${inv.fssaiNo}`);
      doc.fontSize(12).fillColor('#000').text(`TAX INVOICE${inv.revision > 1 ? ` (reissue ${inv.revision})` : ''}`, 350, 40, { align: 'right' }); doc.fontSize(10).text(inv.invoiceNo, { align: 'right' }).text(new Date(inv.issuedAt).toLocaleDateString('en-IN'), { align: 'right' }).text(`Order #${order.orderNo}`, { align: 'right' });
      if (inv.status === 'CANCELLED') { doc.save().fontSize(60).fillColor('#c00').opacity(0.15).rotate(-20, { origin: [300, 400] }).text('CANCELLED', 120, 380).restore(); }
      doc.moveDown(2); doc.fontSize(10).fillColor('#000').text(`Bill to: ${inv.buyerName}${inv.buyerGstin ? ' · GSTIN ' + inv.buyerGstin : ''}`, 40).fillColor('#555').text(inv.buyerAddress);
      doc.moveDown(); const top = doc.y; const cols = [40, 290, 340, 390, 450, 500]; const w = [250, 50, 50, 60, 50, 60];
      doc.rect(40, top - 2, 515, 16).fill('#f4ecd8').fillColor('#000').font('Helvetica-Bold').fontSize(9);
      ['Item', 'HSN', 'Qty', 'Rate', 'GST', 'Amount'].forEach((h, i) => doc.text(h, cols[i] + 2, top, { width: w[i] - 4, align: i >= 2 ? 'right' : 'left' }));
      doc.font('Helvetica').moveDown(0.8);
      for (const l of inv.lines as any[]) { const y = doc.y; [`${l.description}${l.lotNo ? ` (Lot ${l.lotNo})` : ''}`, l.hsn, String(l.qty), money(l.unitPaise), `${l.gstPct}%`, money(l.amountPaise)].forEach((v, i) => doc.text(v, cols[i] + 2, y, { width: w[i] - 4, align: i >= 2 ? 'right' : 'left' })); doc.moveDown(0.6); }
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#ccc'); doc.moveDown(0.4);
      const tot = (label: string, v: string, bold = false) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 340, y, { width: 150, align: 'right' }).text(v, 500, y, { width: 55, align: 'right' }); doc.moveDown(0.5); };
      tot('Subtotal', money(inv.subtotalPaise)); tot('CGST', money(inv.gstPaise / 2)); tot('SGST', money(inv.gstPaise / 2)); if (order.discountPaise) tot('Wallet / discount', '-' + money(order.discountPaise)); tot('Total', money(inv.totalPaise), true);
      doc.moveDown(1.5); doc.font('Helvetica').fontSize(8).fillColor('#555').text(`Payment: ${order.payment?.method || '-'} · ${order.payment?.status || '-'}`, 40).text(SELLER.footer, { width: 515 });
      doc.end();
    });
  }

  list(q: { status?: string; search?: string } = {}) {
    return this.db.invoice.findMany({ where: { ...(q.status ? { status: q.status as any } : {}), ...(q.search ? { OR: [{ invoiceNo: { contains: q.search, mode: 'insensitive' } }, { buyerName: { contains: q.search, mode: 'insensitive' } }, { buyerGstin: { contains: q.search, mode: 'insensitive' } }] } : {}) }, orderBy: { issuedAt: 'desc' }, take: 300, include: { order: { select: { id: true, orderNo: true, status: true, channel: true, payment: true, user: { select: { phone: true, email: true } } } } } });
  }
}
