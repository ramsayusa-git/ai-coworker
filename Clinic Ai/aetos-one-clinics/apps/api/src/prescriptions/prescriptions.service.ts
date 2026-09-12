import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { AddonProxyService } from '../addons/addon-proxy.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addonProxy: AddonProxyService,
  ) {}

  /**
   * Every prescription is created in draft and, if the med-safety add-on is
   * enabled, immediately checked. The rule engine inside that add-on is the
   * source of truth for interaction/allergy/dose hits — see docs/architecture.md
   * 3.3: "LLM cannot suppress a rule hit". A prescription with a `contraindicated`
   * finding stays in draft; the front end blocks activation until the doctor
   * acknowledges it.
   */
  async create(organizationId: string, dto: CreatePrescriptionDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    const rx = await prisma.medicationRequest.create({
      data: {
        encounterId: dto.encounterId,
        patientId: dto.patientId,
        medicationCode: dto.medicationCode,
        medicationName: dto.medicationName,
        salt: dto.salt,
        dosageText: dto.dosageText,
        frequency: dto.frequency,
        durationDays: dto.durationDays,
        status: 'draft',
      },
    });

    try {
      const check = await this.addonProxy.call<{
        severity: 'none' | 'caution' | 'contraindicated';
        findings: string[];
      }>(organizationId, 'med-safety', '/check', {
        patientId: dto.patientId,
        newMedicationCode: dto.medicationCode,
      });
      const updated = await prisma.medicationRequest.update({
        where: { id: rx.id },
        data: {
          safetyCheckJson: { checkedAt: new Date().toISOString(), ...check },
          status: check.severity === 'contraindicated' ? 'draft' : 'active',
        },
      });
      return updated;
    } catch {
      // med-safety add-on disabled/unavailable — activate without an automated
      // check, same as Arogyam.ai clinics on a plan without the safety add-on.
      return prisma.medicationRequest.update({ where: { id: rx.id }, data: { status: 'active' } });
    }
  }

  async activate(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.medicationRequest.update({ where: { id }, data: { status: 'active' } });
  }

  async findForEncounter(organizationId: string, encounterId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.medicationRequest.findMany({ where: { encounterId } });
  }
}
