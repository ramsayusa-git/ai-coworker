import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponsService {
  constructor(private db: PrismaService) {}

  /** Returns discount in paise or throws with a customer-facing reason */
  async evaluate(code: string, userId: string, subtotalPaise: number) {
    const c = await this.db.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
    const now = new Date();
    if (!c || !c.active || c.validFrom > now || (c.validTo && c.validTo < now)) throw new BadRequestException('Coupon not valid');
    if (c.totalUses != null && c.usedCount >= c.totalUses) throw new BadRequestException('Coupon fully redeemed');
    if (subtotalPaise < c.minOrderPaise) throw new BadRequestException(`Minimum order ₹${c.minOrderPaise / 100} for this coupon`);
    const priorOrders = await this.db.order.count({ where: { userId, status: { notIn: ['CANCELLED', 'FAILED'] } } });
    if (c.firstOrderOnly && priorOrders > 0) throw new BadRequestException('Coupon is for first orders only');
    const used = await this.db.order.count({ where: { userId, couponCode: c.code, status: { notIn: ['CANCELLED', 'FAILED'] } } });
    if (used >= c.usesPerUser) throw new BadRequestException('You have already used this coupon');
    let d = c.type === 'PERCENT' ? Math.round((subtotalPaise * c.value) / 100) : c.value;
    if (c.maxDiscountPaise) d = Math.min(d, c.maxDiscountPaise);
    return { code: c.code, discountPaise: Math.min(d, subtotalPaise) };
  }
  async consume(code: string) { await this.db.coupon.update({ where: { code }, data: { usedCount: { increment: 1 } } }); }
  list() { return this.db.coupon.findMany({ orderBy: { validFrom: 'desc' } }); }
  create(d: any) { return this.db.coupon.create({ data: { code: d.code.toUpperCase().trim(), type: d.type, value: d.type === 'PERCENT' ? d.value : Math.round(d.value * 100), minOrderPaise: Math.round((d.minOrderRupees || 0) * 100), maxDiscountPaise: d.maxDiscountRupees ? Math.round(d.maxDiscountRupees * 100) : null, firstOrderOnly: !!d.firstOrderOnly, usesPerUser: d.usesPerUser ?? 1, totalUses: d.totalUses ?? null, validTo: d.validTo ? new Date(d.validTo) : null } }); }
  toggle(id: string, active: boolean) { return this.db.coupon.update({ where: { id }, data: { active } }); }
}
