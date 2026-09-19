import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CurrentUser, Roles } from '../common/auth.guard';

@ApiTags('sales-crm') @ApiBearerAuth() @Roles('ADMIN', 'OPS', 'SALES') @Controller('sales/leads')
export class LeadsController {
  constructor(private svc: LeadsService) {}

  @Get() list(@CurrentUser() u: any, @Query('status') status?: string, @Query('assignedToId') assignedToId?: string, @Query('zoneId') zoneId?: string) {
    return this.svc.list(u, status, assignedToId, zoneId);
  }
  @Get(':id') get(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post() create(@CurrentUser() u: any, @Body() b: any) { return this.svc.create(u, b); }
  @Patch(':id') update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.update(u, id, b); }
  @Post(':id/activities') addActivity(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.addActivity(u, id, b); }
  @Post(':id/convert') convert(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.convert(u, id, b); }
}

@ApiTags('sales-crm') @ApiBearerAuth() @Roles('ADMIN', 'OPS', 'SALES') @Controller('sales/followups')
export class FollowupsController {
  constructor(private svc: LeadsService) {}
  @Get('today') today(@CurrentUser() u: any) { return this.svc.followups(u, 'today'); }
  @Get('overdue') overdue(@CurrentUser() u: any) { return this.svc.followups(u, 'overdue'); }
}
