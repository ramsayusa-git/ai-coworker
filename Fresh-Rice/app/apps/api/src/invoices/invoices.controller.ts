import { Controller, Get, Param, Res, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { CurrentUser, Roles, Public } from '../common/auth.guard';
import { JwtService } from '@nestjs/jwt';

@ApiTags('invoices') @ApiBearerAuth() @Controller()
export class InvoicesController {
  constructor(private svc: InvoicesService, private jwt: JwtService) {}
  @Post('orders/:id/invoice') issue(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.forOrder(id, u); }
  @Get('orders/:id/invoice') get(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.forOrder(id, u); }
  /** Customer or staff: resend the invoice on WhatsApp and/or email. */
  @Post('orders/:id/invoice/resend') resend(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { channels?: ('whatsapp' | 'email')[]; email?: string }) { return this.svc.resend(id, u, b?.channels?.length ? b.channels : ['whatsapp', 'email'], b?.email); }
  /** Staff: cancel + reissue with corrected buyer details (audit trail kept). */
  @Roles('ADMIN', 'OPS') @Post('orders/:id/invoice/reissue') reissue(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { reason: string; buyerName?: string; buyerGstin?: string; buyerAddress?: string }) { return this.svc.reissue(id, u, b); }

  /** Printable HTML — token passed as query for browser open: /v1/orders/:id/invoice.html?t=<jwt> */
  @Public() @Roles() @Get('orders/:id/invoice.html') async html(@Param('id') id: string, @Res() res: Response) {
    const t = (res.req.query.t as string) || '';
    let user: any = null; try { user = await this.jwt.verifyAsync(t, { secret: process.env.JWT_SECRET || 'dev' }); } catch { return res.status(401).send('Login required'); }
    const { invoice, order } = await this.svc.forOrder(id, user);
    if (!invoice) return res.status(400).send('Invoice not yet issued (order unpaid or cancelled)');
    res.type('html').send(this.svc.html(invoice, order));
  }
  /** PDF download (owner or staff). */
  @Get('orders/:id/invoice.pdf') async pdf(@CurrentUser() u: any, @Param('id') id: string, @Res() res: Response) {
    const { invoice, order } = await this.svc.forOrder(id, u);
    if (!invoice) return res.status(400).send('Invoice not yet issued');
    const buf = await this.svc.pdf(invoice, order);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoiceNo.replace(/\//g, '-')}.pdf`); res.send(buf);
  }
  /** Signed public links used in WhatsApp/email — no login. */
  @Public() @Roles() @Get('invoices/public/:id/:sig') async pub(@Param('id') id: string, @Param('sig') sig: string, @Query('format') format: string, @Res() res: Response) {
    const { invoice, order } = await this.svc.byPublic(id, sig);
    if (format === 'pdf') { const buf = await this.svc.pdf(invoice, order); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename=${invoice.invoiceNo.replace(/\//g, '-')}.pdf`); return res.send(buf); }
    res.type('html').send(this.svc.html(invoice, order));
  }
  @Roles('ADMIN', 'OPS', 'SALES') @Get('admin/invoices') list(@Query('status') status?: string, @Query('search') search?: string) { return this.svc.list({ status, search }); }
}
