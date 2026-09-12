import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('invoices')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreateInvoiceDto) {
    return this.billing.create(req.organizationId!, dto);
  }

  @Patch(':id/pay')
  markPaid(@Req() req: TenantRequest, @Param('id') id: string, @Body('paymentMethod') method: 'upi' | 'razorpay' | 'cash') {
    return this.billing.markPaid(req.organizationId!, id, method);
  }

  @Get()
  findForPatient(@Req() req: TenantRequest, @Query('patientId') patientId: string) {
    return this.billing.findForPatient(req.organizationId!, patientId);
  }

  /** Powers the revenue-integrity add-on's unbilled-item detection. */
  @Get('unbilled-candidates/:encounterId')
  unbilledCandidates(@Req() req: TenantRequest, @Param('encounterId') encounterId: string) {
    return this.billing.findUnbilledCandidates(req.organizationId!, encounterId);
  }
}
