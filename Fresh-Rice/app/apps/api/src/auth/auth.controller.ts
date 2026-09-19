import { Body, Controller, Get, Post, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsInt, Min, Max, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from '../common/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

class OtpReq { @IsString() phone: string; }
class AdminLoginDto { @IsEmail() email: string; @IsString() password: string; }
class OtpVerify { @IsString() phone: string; @IsString() @Length(4, 6) code: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() referral?: string; }
class ProfileDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() lang?: 'te' | 'hi' | 'en'; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsInt() @Min(1) @Max(30) householdSize?: number; }

@ApiTags('auth') @Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private db: PrismaService) {}
  // Per-phone abuse limit (5/10min) is enforced inside AuthService.requestOtp; this per-IP cap only
  // guards against basic volumetric abuse, so it's kept generous — shared office/NAT wifi with several
  // family members or staff signing in shouldn't get blocked by one IP-wide limit.
  @Public() @Throttle({ default: { ttl: 600000, limit: 60 } }) @Post('otp/request') requestOtp(@Body() b: OtpReq) { return this.auth.requestOtp(b.phone); }
  @Public() @Get('referrals/check') async checkCode(@Query('code') code: string) { const r = await this.db.user.findUnique({ where: { referralCode: (code || '').toUpperCase() }, select: { name: true } }); return r ? { valid: true, referrer: r.name?.split(' ')[0] || 'a neighbour', rewardPaise: 10000 } : { valid: false }; }
  // Real brute-force guard is per-phone (5 wrong guesses/10min, in AuthService.verifyOtp); this IP cap is a backstop.
  @Public() @Throttle({ default: { ttl: 600000, limit: 60 } }) @Post('otp/verify') verify(@Body() b: OtpVerify) { return this.auth.verifyOtp(b.phone, b.code, b.name, b.referral); }
  // Built-in backend login (email + password) for the super-admin / staff accounts that have a password set.
  // Separate, tighter throttle: this is a password-guessable endpoint, unlike phone+OTP.
  @Public() @Throttle({ default: { ttl: 600000, limit: 8 } }) @Post('admin-login') adminLogin(@Body() b: AdminLoginDto) { return this.auth.adminLogin(b.email, b.password); }
  @ApiBearerAuth() @Get('me') me(@CurrentUser() u: any) { return this.auth.me(u.sub); }
  @ApiBearerAuth() @Get('referrals/mine') async referrals(@CurrentUser() u: any) {
    const me = await this.db.user.findUniqueOrThrow({ where: { id: u.sub } });
    const invited = await this.db.user.findMany({ where: { referredById: u.sub }, select: { id: true, name: true, phone: true, createdAt: true, orders: { where: { status: 'DELIVERED' }, select: { id: true }, take: 1 } }, orderBy: { createdAt: 'desc' } });
    const earned = await this.db.walletLedger.aggregate({ where: { userId: u.sub, reason: 'referral' }, _sum: { deltaPaise: true } });
    return { code: me.referralCode, rewardPaise: 10000, invited: invited.length, converted: invited.filter((i) => i.orders.length).length, earnedPaise: earned._sum.deltaPaise || 0, walletBalance: me.walletBalance,
      shareText: `Try FreshRice — mill-direct, correctly aged Sona Masoori delivered to your door in Hyderabad. Use my code ${me.referralCode} for ₹100 off your first bag: https://freshrice.in/r/${me.referralCode}`,
      list: invited.map((i) => ({ name: i.name || i.phone.replace(/(\+91)(\d{2})\d{6}(\d{2})/, '$1 $2******$3'), joined: i.createdAt, status: i.orders.length ? 'delivered' : 'signed up' })) };
  }
  @ApiBearerAuth() @Patch('me') async update(@CurrentUser() u: any, @Body() b: ProfileDto) {
    const user = await this.db.user.update({ where: { id: u.sub }, data: { name: b.name, lang: b.lang as any, ...(b.email !== undefined ? { email: b.email } : {}), ...(b.householdSize !== undefined ? { householdSize: b.householdSize } : {}) } });
    return this.auth.publicUser(user);
  }
}
