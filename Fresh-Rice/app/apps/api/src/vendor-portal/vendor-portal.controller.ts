import { Controller, Get, Patch, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, CurrentUser } from '../common/auth.guard';

class StoryDto { @IsOptional() @IsString() @MaxLength(80) storyTitle?: string; @IsOptional() @IsString() @MaxLength(1200) story?: string; @IsOptional() @IsString() storyPhoto?: string; }

// Self-service portal for mill/supplier vendors. Every query is scoped to the
// logged-in vendor user's own vendorId - a vendor can never see another vendor's data.
@ApiTags('vendor-portal') @ApiBearerAuth() @Roles('VENDOR_USER') @Controller('vendor')
export class VendorPortalController {
  constructor(private db: PrismaService) {}

  /** "Mill story" — title, a few lines, optional photo — shown to customers on every /trace page for this mill's lots. */
  @Patch('me/story') story(@CurrentUser() u: any, @Body() b: StoryDto) {
    if (b.storyPhoto && b.storyPhoto.length > 400 * 1024 * 1.37) throw new BadRequestException('Photo too large — keep it under 400 KB');
    if (b.storyPhoto && !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(b.storyPhoto)) throw new BadRequestException('Photo must be a JPEG/PNG/WebP image or an https link');
    return this.db.vendor.update({ where: { id: u.vendorId }, data: { storyTitle: b.storyTitle ?? undefined, story: b.story ?? undefined, storyPhoto: b.storyPhoto === '' ? null : (b.storyPhoto ?? undefined) }, select: { storyTitle: true, story: true, storyPhoto: true } });
  }

  @Get('me') async me(@CurrentUser() u: any) {
    const vendor = await this.db.vendor.findUniqueOrThrow({ where: { id: u.vendorId } });
    const ledger = await this.db.vendorLedger.findMany({ where: { vendorId: u.vendorId } });
    return { ...vendor, payablePaise: ledger.reduce((a, l) => a + l.deltaPaise, 0), overduePaise: ledger.filter((l) => l.reason === 'bill' && l.dueOn && l.dueOn < new Date()).reduce((a, l) => a + l.deltaPaise, 0) };
  }

  @Get('pos') pos(@CurrentUser() u: any) {
    return this.db.purchaseOrder.findMany({ where: { vendorId: u.vendorId }, include: { warehouse: true, lines: { include: { variety: true } } }, orderBy: { createdAt: 'desc' } });
  }

  @Get('ledger') ledger(@CurrentUser() u: any) {
    return this.db.vendorLedger.findMany({ where: { vendorId: u.vendorId }, orderBy: { at: 'desc' } });
  }

  @Get('deliveries') deliveries(@CurrentUser() u: any) {
    return this.db.lot.findMany({ where: { vendorId: u.vendorId }, include: { variety: true, warehouse: true }, orderBy: { receivedAt: 'desc' }, take: 100 });
  }
}
