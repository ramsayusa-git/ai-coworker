import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ModStatus, ModType } from '@prisma/client';
import { Roles, CurrentUser } from '../common/auth.guard';
import { ModificationsService, DiscountLimits } from './modifications.service';

/** Order modifications, goodwill discounts and the approval queue. */
@Controller()
export class ModificationsController {
  constructor(private svc: ModificationsService) {}

  // customer + staff: change log for an order; customer self-service for slot/address/note
  @Get('orders/:id/modifications') forOrder(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.forOrder(id, u); }
  @Patch('orders/:id') selfModify(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { type: ModType; reason: string; slotId?: string | null; deliveryDate?: string; addressId?: string; note?: string }) { return this.svc.modify(id, u, b); }

  // staff
  @Roles('ADMIN', 'OPS', 'SALES') @Post('admin/orders/:id/modify') modify(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.modify(id, u, b); }
  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Post('admin/orders/:id/discount') discount(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { amountPaise?: number; pct?: number; reason: string; issueId?: string }) { return this.svc.requestDiscount(id, u, b); }

  /** Dropdown data for the admin order editor: zone slots, the customer's addresses, order issues, catalog SKUs. */
  @Roles('ADMIN', 'OPS', 'SALES') @Get('admin/orders/:id/options') options(@Param('id') id: string) { return this.svc.options(id); }

  // approvals queue
  @Roles('ADMIN', 'OPS') @Get('admin/approvals') approvals(@CurrentUser() u: any, @Query('status') status?: ModStatus) { return this.svc.approvals(u, status || 'PENDING_APPROVAL'); }
  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('admin/approvals/stats') stats() { return this.svc.stats(); }
  @Roles('ADMIN', 'OPS') @Post('admin/approvals/:id/approve') approve(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { note?: string }) { return this.svc.decide(id, u, true, b?.note); }
  @Roles('ADMIN', 'OPS') @Post('admin/approvals/:id/reject') reject(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { note?: string }) { return this.svc.decide(id, u, false, b?.note); }

  // limits (hierarchy)
  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('admin/settings/discount-limits') limits() { return this.svc.limits(); }
  @Roles('ADMIN') @Put('admin/settings/discount-limits') setLimits(@CurrentUser() u: any, @Body() b: Partial<DiscountLimits>) { return this.svc.setLimits(u, b); }
}
