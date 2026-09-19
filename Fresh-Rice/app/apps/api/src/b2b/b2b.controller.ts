import { Body, Controller, Get, Param, Post, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { rupees } from '../common/money';

@ApiTags('b2b') @ApiBearerAuth() @Controller()
export class B2bController {
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  @Get('b2b/account') async account(@CurrentUser() u: any) {
    if (!u.b2b) return null;
    const acc = await this.db.b2bAccount.findUniqueOrThrow({ where: { id: u.b2b }, include: { ledger: { orderBy: { at: 'desc' }, take: 50 } } });
    const exposure = acc.ledger.reduce((a, l) => a + l.deltaPaise, 0);
    const overdue = acc.ledger.filter((l) => l.reason === 'invoice' && l.dueOn && l.dueOn < new Date()).reduce((a, l) => a + l.deltaPaise, 0);
    return { ...acc, exposurePaise: exposure, availablePaise: acc.creditLimitPaise - exposure, overduePaise: overdue };
  }
  @Post('b2b/payments') async pay(@CurrentUser() u: any, @Body() b: { amountPaise: number; ref: string }) {
    if (!u.b2b) throw new Error('Not a B2B user');
    await this.db.b2bLedger.create({ data: { accountId: u.b2b, deltaPaise: -b.amountPaise, reason: 'payment:' + b.ref } });
    return { ok: true };
  }

  @Roles('ADMIN', 'OPS', 'SALES') @Get('admin/b2b') async list() {
    const accs = await this.db.b2bAccount.findMany({ include: { ledger: true, users: { select: { name: true, phone: true } }, _count: { select: { orders: true } } } });
    return accs.map((a) => ({ ...a, exposurePaise: a.ledger.reduce((s, l) => s + l.deltaPaise, 0), overduePaise: a.ledger.filter((l) => l.reason === 'invoice' && l.dueOn && l.dueOn < new Date()).reduce((s, l) => s + l.deltaPaise, 0), ledger: undefined }));
  }
  @Roles('ADMIN', 'OPS', 'SALES') @Post('admin/b2b') async create(@Body() b: { name: string; gstin?: string; phone: string; contactName?: string; creditLimitRupees: number; termsDays?: number; tier?: number }) {
    const acc = await this.db.b2bAccount.create({ data: { name: b.name, gstin: b.gstin, creditLimitPaise: 0, termsDays: 0, tier: b.tier ?? 1 } });
    const phone = '+91' + b.phone.replace(/\D/g, '').slice(-10);
    await this.db.user.upsert({ where: { phone }, update: { role: 'B2B_USER', b2bAccountId: acc.id }, create: { phone, name: b.contactName, role: 'B2B_USER', b2bAccountId: acc.id, lang: 'en', referralCode: 'B2B' + phone.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() } });
    return acc;
  }
  @Roles('ADMIN', 'OPS') @Patch('admin/b2b/:id') update(@Param('id') id: string, @Body() b: any) { return this.db.b2bAccount.update({ where: { id }, data: { onHold: b.onHold, creditLimitPaise: b.creditLimitRupees != null ? Math.round(b.creditLimitRupees * 100) : undefined, termsDays: b.termsDays, tier: b.tier } }); }
  @Roles('ADMIN', 'OPS') @Post('admin/b2b/dunning') async dunning() {
    const accs = await this.db.b2bAccount.findMany({ include: { ledger: true, users: true } });
    let sent = 0;
    for (const a of accs) {
      const overdue = a.ledger.filter((l) => l.reason === 'invoice' && l.dueOn && l.dueOn < new Date()).reduce((s, l) => s + l.deltaPaise, 0);
      if (overdue > 0) {
        for (const u of a.users) await this.notify.send(u.phone, 'b2b_dunning', `${a.name}: ₹${rupees(overdue)} is overdue. Please pay to keep deliveries running.`);
        const oldest = a.ledger.filter((l) => l.reason === 'invoice' && l.dueOn && l.dueOn < new Date()).sort((x, y) => x.dueOn!.getTime() - y.dueOn!.getTime())[0];
        if (oldest && Date.now() - oldest.dueOn!.getTime() > 7 * 86400000) await this.db.b2bAccount.update({ where: { id: a.id }, data: { onHold: true } });
        sent++;
      }
    }
    return { accountsNotified: sent };
  }
}
