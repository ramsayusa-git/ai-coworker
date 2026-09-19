import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser, Roles } from '../common/auth.guard';
import { addDays, startOfDay } from '../common/money';
@ApiTags('subscriptions') @ApiBearerAuth() @Controller()
export class SubscriptionsController {
  constructor(private svc: SubscriptionsService) {}
  @Get('subscriptions/mine') mine(@CurrentUser() u: any) { return this.svc.mine(u.sub); }
  @Post('subscriptions') create(@CurrentUser() u: any, @Body() b: any) { return this.svc.create(u.sub, b); }
  @Patch('subscriptions/:id') update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.update(u.sub, id, b); }
  @Roles('ADMIN', 'OPS') @Get('admin/subscriptions') all() { return this.svc.all(); }
  @Roles('ADMIN', 'OPS') @Post('admin/subscriptions/run') run(@Query('date') date?: string) { return this.svc.runFor(date ? startOfDay(new Date(date)) : startOfDay(addDays(new Date(), 1))); }
}
