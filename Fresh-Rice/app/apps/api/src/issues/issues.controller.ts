import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IssuesService, CATEGORIES } from './issues.service';
import { CurrentUser, Roles } from '../common/auth.guard';

/** Issues desk. Customers/riders/B2B: own tickets. ADMIN/OPS/SALES: everything + assign/resolve. */
@ApiTags('issues') @ApiBearerAuth() @Controller('issues')
export class IssuesController {
  constructor(private svc: IssuesService) {}
  @Get('categories') categories() { return CATEGORIES; }
  @Get() list(@CurrentUser() u: any, @Query('status') status?: string, @Query('mine') mine?: string, @Query('assigneeId') assigneeId?: string, @Query('category') category?: string) { return this.svc.list(u, { status, mine, assigneeId, category }); }
  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('stats') stats() { return this.svc.stats(); }
  @Roles('ADMIN', 'OPS') @Post('jobs/sla-watch') sla() { return this.svc.slaWatch(); }
  @Post() create(@CurrentUser() u: any, @Body() b: any) { return this.svc.create(u, b); }
  @Get(':id') get(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post(':id/messages') reply(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.reply(u, id, b); }
  @Roles('ADMIN', 'OPS', 'SALES') @Patch(':id') update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.update(u, id, b); }
  @Post(':id/rate') rate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { rating: number }) { return this.svc.rate(u, id, Number(b.rating)); }
}
