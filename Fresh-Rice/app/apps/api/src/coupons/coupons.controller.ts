import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CurrentUser, Roles } from '../common/auth.guard';
@ApiTags('coupons') @ApiBearerAuth() @Controller()
export class CouponsController {
  constructor(private svc: CouponsService) {}
  @Post('coupons/check') check(@CurrentUser() u: any, @Body() b: { code: string; subtotalPaise: number }) { return this.svc.evaluate(b.code, u.sub, b.subtotalPaise); }
  @Roles('ADMIN', 'OPS', 'MARKETING') @Get('admin/coupons') list() { return this.svc.list(); }
  @Roles('ADMIN', 'OPS', 'MARKETING') @Post('admin/coupons') create(@Body() b: any) { return this.svc.create(b); }
  @Roles('ADMIN', 'OPS', 'MARKETING') @Patch('admin/coupons/:id') toggle(@Param('id') id: string, @Body() b: { active: boolean }) { return this.svc.toggle(id, b.active); }
}
