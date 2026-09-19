import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { Public, CurrentUser } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
@ApiTags('payments') @Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService, private db: PrismaService) {}
  @Public() @Get('config') config() { return { provider: this.svc.mock ? 'mock' : 'razorpay', keyId: this.svc.publicKey }; }
  @Public() @Post('razorpay/webhook') webhook(@Req() req: any, @Headers('x-razorpay-signature') sig: string, @Body() b: any) { return this.svc.webhook(req.rawBody, sig, b); }
  @Post('razorpay/verify') async verify(@CurrentUser() u: any, @Body() b: { orderId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: b.orderId } });
    if (o.userId !== u.sub) throw new Error('Forbidden');
    return this.svc.verifyCheckout(b.orderId, b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature);
  }
}
