import { Injectable } from '@nestjs/common';
import { AddonProxyService } from '../addons/addon-proxy.service';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PatientConciergeService {
  constructor(
    private readonly addonProxy: AddonProxyService,
    private readonly prisma: PrismaService,
  ) {}

  async draftReply(organizationId: string, patientId: string, question: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    return this.addonProxy.call(organizationId, 'patient-concierge', '/events/patient.inquiry', {
      patientId,
      question,
      clinicName: branding?.productName ?? 'Aetos One Clinics',
    });
  }
}
