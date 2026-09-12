import { Body, Controller, Post, Req } from '@nestjs/common';
import { PatientConciergeService } from './patient-concierge.service';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('patient-concierge')
export class PatientConciergeController {
  constructor(private readonly concierge: PatientConciergeService) {}

  @Post('draft-reply')
  draftReply(
    @Req() req: TenantRequest,
    @Body('patientId') patientId: string,
    @Body('question') question: string,
  ) {
    return this.concierge.draftReply(req.organizationId!, patientId, question);
  }
}
