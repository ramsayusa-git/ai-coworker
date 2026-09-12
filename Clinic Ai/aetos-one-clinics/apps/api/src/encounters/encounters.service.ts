import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { AddonProxyService } from '../addons/addon-proxy.service';

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addonProxy: AddonProxyService,
  ) {}

  async create(organizationId: string, dto: CreateEncounterDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.encounter.create({
      data: {
        locationId: dto.locationId,
        patientId: dto.patientId,
        practitionerId: dto.practitionerId,
        appointmentId: dto.appointmentId,
        visitTemplateId: dto.visitTemplateId,
        status: 'in-progress',
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const encounter = await prisma.encounter.findUnique({
      where: { id },
      include: { observations: true, conditions: true, medications: true, patient: true },
    });
    if (!encounter) throw new NotFoundException(`Encounter ${id} not found`);
    return encounter;
  }

  /**
   * Calls the ai-scribe add-on (if enabled) with a transcript/audio reference and
   * saves the returned draft SOAP note. The doctor must still explicitly finalize
   * the encounter (finalize()) before it counts as signed — see section 3.3 of the
   * proposal ("nothing is saved unedited").
   */
  async requestScribeDraft(organizationId: string, encounterId: string, transcriptOrAudioRef: string) {
    const draft = await this.addonProxy.call<{
      soapNote: { subjective: string; objective: string; assessment: string; plan: string };
      draftConditions: Array<{ codeSystem: string; code: string; display: string }>;
      draftMedications: Array<{ medicationCode: string; medicationName: string; dosageText: string }>;
    }>(organizationId, 'ai-scribe', '/generate', { encounterId, input: transcriptOrAudioRef });

    const prisma = await this.prisma.forTenant(organizationId);
    await prisma.encounter.update({
      where: { id: encounterId },
      data: { soapNoteJson: { ...draft.soapNote, generatedBy: 'ai-scribe' } },
    });
    return draft;
  }

  async finalize(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.encounter.update({ where: { id }, data: { status: 'finished' } });
  }
}
