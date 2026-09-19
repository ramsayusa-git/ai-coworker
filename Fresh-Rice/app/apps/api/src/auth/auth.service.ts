import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addDays } from '../common/money';

@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService, private notify: NotificationsService) {}

  normalize(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
  }

  async requestOtp(rawPhone: string) {
    const phone = this.normalize(rawPhone);
    const recent = await this.db.otp.count({ where: { phone, createdAt: { gt: new Date(Date.now() - 10 * 60000) } } });
    if (recent >= 5) throw new BadRequestException('Too many OTP requests, try after 10 minutes');
    const dev = (process.env.OTP_DEV_MODE || 'true') === 'true';
    const code = dev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    await this.db.otp.create({ data: { phone, code, expiresAt: new Date(Date.now() + 5 * 60000) } });
    const existing = await this.db.user.findUnique({ where: { phone }, select: { email: true } });
    await this.notify.send(phone, 'otp', `Your FreshRice OTP is ${code}. Valid 5 minutes.`, existing?.email);
    return { phone, sent: true, ...(dev ? { devOtp: code } : {}) };
  }

  async verifyOtp(rawPhone: string, code: string, name?: string, referral?: string) {
    const phone = this.normalize(rawPhone);
    // Per-phone brute-force guard: 5 wrong guesses in 10 min locks that number (the per-IP throttle on the
    // route is only a coarse backstop, since a distributed guesser would spread across IPs).
    const wrong = await this.db.event.count({ where: { type: 'otp_wrong', actor: phone, at: { gt: new Date(Date.now() - 10 * 60000) } } });
    if (wrong >= 5) throw new UnauthorizedException('Too many wrong attempts, request a new OTP after 10 minutes');
    const otp = await this.db.otp.findFirst({ where: { phone, code, used: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp) { await this.db.event.create({ data: { actor: phone, type: 'otp_wrong', payload: {} } }); throw new UnauthorizedException('Invalid or expired OTP'); }
    await this.db.otp.update({ where: { id: otp.id }, data: { used: true } });
    let user = await this.db.user.findUnique({ where: { phone } });
    let isNew = false;
    if (!user) {
      isNew = true;
      const referrer = referral ? await this.db.user.findUnique({ where: { referralCode: referral.toUpperCase() } }) : null;
      user = await this.db.user.create({ data: { phone, name: name || null, referralCode: this.makeCode(phone), referredById: referrer?.id } });
    } else if (name && !user.name) user = await this.db.user.update({ where: { id: user.id }, data: { name } });
    if (!user.active) throw new UnauthorizedException('This account has been deactivated');
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role, phone: user.phone, b2b: user.b2bAccountId || undefined, warehouseId: user.warehouseId || undefined, vendorId: user.vendorId || undefined });
    return { token, isNew, user: this.publicUser(user) };
  }

  /** Backend login for the built-in super-admin (and any other staff account with a passwordHash set) — a second login path alongside phone+OTP. */
  async adminLogin(email: string, password: string) {
    const user = await this.db.user.findFirst({ where: { email: email.toLowerCase(), passwordHash: { not: null } } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    if (!user.active) throw new UnauthorizedException('This account has been deactivated');
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role, phone: user.phone, b2b: user.b2bAccountId || undefined, warehouseId: user.warehouseId || undefined, vendorId: user.vendorId || undefined });
    return { token, isNew: false, user: this.publicUser(user) };
  }

  makeCode(phone: string) { return 'FR' + phone.slice(-4) + Math.random().toString(36).slice(2, 5).toUpperCase(); }
  publicUser(u: any) { return { id: u.id, phone: u.phone, email: u.email || null, name: u.name, role: u.role, lang: u.lang, referralCode: u.referralCode, walletBalance: u.walletBalance, b2bAccountId: u.b2bAccountId, referredById: u.referredById || null, warehouseId: u.warehouseId || null, vendorId: u.vendorId || null, active: u.active, isSuperAdmin: !!u.isSuperAdmin, householdSize: u.householdSize ?? null }; }

  async me(userId: string) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId }, include: { addresses: { include: { zone: true } }, b2bAccount: true } });
    return { ...this.publicUser(u), addresses: u.addresses, b2bAccount: u.b2bAccount };
  }
}
