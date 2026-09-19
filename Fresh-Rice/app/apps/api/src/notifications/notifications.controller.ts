import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { NotificationsService } from './notifications.service';
import { Roles, Public } from '../common/auth.guard';
@ApiTags('notifications') @Controller()
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Get('notifications') list() { return this.svc.list(); }
  /** Meta webhook verification */
  @Public() @Get('webhooks/whatsapp') verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'freshrice')) return res.status(200).send(challenge);
    return res.status(403).send('bad token');
  }
  /** Inbound messages (SKIP / PAUSE / RESUME / RATE n). Also accepts {phone,text} for local testing. */
  @Public() @Post('webhooks/whatsapp') async inbound(@Body() b: any) {
    if (b?.phone && b?.text) return this.svc.handleInbound(b.phone, b.text);
    const msgs = b?.entry?.flatMap((e: any) => e.changes?.flatMap((c: any) => c.value?.messages || []) || []) || [];
    const out: any[] = [];
    for (const m of msgs) if (m.type === 'text') out.push(await this.svc.handleInbound(m.from, m.text.body));
    return { received: msgs.length, out };
  }
}
