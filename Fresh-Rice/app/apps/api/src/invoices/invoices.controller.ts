import { Controller, Get, Param, Res, Post } from '@nestjs/common';
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
  /** Printable HTML — token passed as query for browser open: /v1/orders/:id/invoice.html?t=<jwt> */
  @Public() @Get('orders/:id/invoice.html') async html(@Param('id') id: string, @Res() res: Response) {
    const t = (res.req.query.t as string) || '';
    let user: any = null; try { user = await this.jwt.verifyAsync(t, { secret: process.env.JWT_SECRET || 'dev' }); } catch { return res.status(401).send('Login required'); }
    const { invoice, order } = await this.svc.forOrder(id, user);
    if (!invoice) return res.status(400).send('Invoice not yet issued (order unpaid or cancelled)');
    res.type('html').send(this.svc.html(invoice, order));
  }
  @Roles('ADMIN', 'OPS') @Get('admin/invoices') list() { return this.svc.list(); }
}
