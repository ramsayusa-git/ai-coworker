import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { Public, CurrentUser } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
@ApiTags('catalog') @Controller('catalog')
export class CatalogController {
  constructor(private svc: CatalogService, private db: PrismaService) {}
  @Public() @Get() async get(@Query('pincode') pincode?: string, @CurrentUser() u?: any) {
    const zone = pincode ? await this.db.zone.findFirst({ where: { pincodes: { has: pincode } } }) : null;
    let b2bTier: number | null = null;
    if (u?.b2b) { const acc = await this.db.b2bAccount.findUnique({ where: { id: u.b2b } }); b2bTier = acc?.tier ?? null; }
    return { zone: zone ? { id: zone.id, name: zone.name } : null, b2bTier, items: await this.svc.storefront({ zoneId: zone?.id, b2bTier }) };
  }
}
