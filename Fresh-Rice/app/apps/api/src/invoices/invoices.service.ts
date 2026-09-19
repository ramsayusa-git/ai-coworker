import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rupees } from '../common/money';

function fy(d = new Date()) { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; }

@Injectable()
export class InvoicesService {
  constructor(private db: PrismaService) {}

  /** Idempotent: returns existing invoice or issues one for a confirmed/delivered order */
  async forOrder(orderId: string, requester?: { sub: string; role: string }) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: true, b2bAccount: true, address: true, items: { include: { sku: { include: { variety: true } }, lot: true } }, invoice: true, payment: true } });
    if (requester && o.userId !== requester.sub && !['ADMIN', 'OPS'].includes(requester.role)) throw new ForbiddenException();
    if (o.invoice) return { invoice: o.invoice, order: o };
    if (o.status === 'PENDING_PAYMENT' || o.status === 'CANCELLED') return { invoice: null, order: o };
    const count = await this.db.invoice.count();
    const invoiceNo = `FR/${fy()}/${String(count + 1).padStart(6, '0')}`;
    const lines = o.items.map((i) => ({ description: `${i.sku.variety.name} ${i.sku.packKg}kg`, hsn: i.sku.variety.isAddon ? '0713' : '1006', lotNo: i.lot?.lotNo, qty: i.qty, unitPaise: i.unitPaise, gstPct: i.sku.gstPct, amountPaise: i.unitPaise * i.qty, gstPaise: Math.round((i.unitPaise * i.qty * i.sku.gstPct) / 100) }));
    const invoice = await this.db.invoice.create({ data: { invoiceNo, orderId, buyerName: o.b2bAccount?.name || o.user.name || o.user.phone, buyerGstin: o.b2bAccount?.gstin, buyerAddress: `${o.address.line1}${o.address.landmark ? ', ' + o.address.landmark : ''}, Hyderabad ${o.address.pincode}`, lines, subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, totalPaise: o.totalPaise } });
    return { invoice, order: o };
  }

  html(inv: any, order: any) {
    const rows = (inv.lines as any[]).map((l) => `<tr><td>${l.description}<br><small>Lot ${l.lotNo || '-'}</small></td><td>${l.hsn}</td><td class=r>${l.qty}</td><td class=r>₹${rupees(l.unitPaise).toFixed(2)}</td><td class=r>${l.gstPct}%</td><td class=r>₹${rupees(l.amountPaise).toFixed(2)}</td></tr>`).join('');
    const cgst = rupees(inv.gstPaise) / 2;
    return `<!doctype html><html><head><meta charset=utf-8><title>${inv.invoiceNo}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;color:#222;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f4}.r{text-align:right}.tot td{font-weight:bold}.hdr{display:flex;justify-content:space-between}.muted{color:#666}@media print{button{display:none}}</style></head><body>
<div class=hdr><div><h1>FreshRice</h1><div class=muted>Aetos Tech Labs · Kukatpally, Hyderabad 500072<br>GSTIN ${inv.sellerGstin} · FSSAI ${inv.fssaiNo}</div></div><div style="text-align:right"><b>TAX INVOICE</b><br>${inv.invoiceNo}<br>${new Date(inv.issuedAt).toLocaleDateString('en-IN')}<br>Order #${order.orderNo}</div></div>
<p><b>Bill to:</b> ${inv.buyerName}${inv.buyerGstin ? ' · GSTIN ' + inv.buyerGstin : ''}<br>${inv.buyerAddress}</p>
<table><tr><th>Item</th><th>HSN</th><th class=r>Qty</th><th class=r>Rate</th><th class=r>GST</th><th class=r>Amount</th></tr>${rows}
<tr><td colspan=5 class=r>Subtotal</td><td class=r>₹${rupees(inv.subtotalPaise).toFixed(2)}</td></tr>
<tr><td colspan=5 class=r>CGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr><tr><td colspan=5 class=r>SGST</td><td class=r>₹${cgst.toFixed(2)}</td></tr>
${order.discountPaise ? `<tr><td colspan=5 class=r>Wallet / discount</td><td class=r>-₹${rupees(order.discountPaise).toFixed(2)}</td></tr>` : ''}
<tr class=tot><td colspan=5 class=r>Total</td><td class=r>₹${rupees(inv.totalPaise).toFixed(2)}</td></tr></table>
<p class=muted>Payment: ${order.payment?.method} · ${order.payment?.status}<br>Rice is a pre-packed & labelled commodity taxed at 5% GST. Store in a cool, dry place. Milling date and lot printed on each bag.</p>
<button onclick="print()">Print / Save PDF</button></body></html>`;
  }

  list() { return this.db.invoice.findMany({ orderBy: { issuedAt: 'desc' }, take: 200, include: { order: { select: { orderNo: true, status: true, channel: true, payment: true } } } }); }
}
