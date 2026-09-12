import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../common/prisma.service';
import { CreateVisitTemplateDto } from './dto/create-visit-template.dto';
import { DraftVisitTemplateDto } from './dto/draft-visit-template.dto';

/**
 * 1-Click Visit Templates: pick a condition, everything (chief complaint,
 * ICD-10 diagnosis, medications, tests, advice, follow-up) fills in on the
 * encounter in one call — arogyam.ai's flagship "under a minute of charting"
 * feature, which this scaffold had a placeholder field for
 * (Encounter.visitTemplateId) but no actual model or logic behind.
 *
 * organizationId = null on a template means it's a built-in one shipped to
 * every clinic (see prisma/seed-visit-templates.ts); a real organizationId
 * means a clinic's own custom or AI-drafted template.
 */
@Injectable()
export class VisitTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.visitTemplate.findMany({
      where: { OR: [{ organizationId: null }, { organizationId }] },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const template = await prisma.visitTemplate.findFirst({
      where: { id, OR: [{ organizationId: null }, { organizationId }] },
    });
    if (!template) throw new NotFoundException(`Visit template ${id} not found`);
    return template;
  }

  async create(organizationId: string, dto: CreateVisitTemplateDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.visitTemplate.create({
      data: {
        organizationId,
        name: dto.name,
        category: dto.category,
        icd10Code: dto.icd10Code,
        chiefComplaint: dto.chiefComplaint,
        diagnosisDisplay: dto.diagnosisDisplay,
        medicationsJson: dto.medicationsJson as object,
        testsJson: (dto.testsJson ?? []) as object,
        advice: dto.advice ?? '',
        followUpDays: dto.followUpDays,
        language: dto.language ?? 'en',
        aiGenerated: false,
      },
    });
  }

  /**
   * "Describe a condition in two lines — AI drafts the template for your
   * review." Falls back to a plain, clearly-marked-incomplete draft when no
   * ANTHROPIC_API_KEY is configured, so the endpoint stays usable in dev.
   */
  async draftFromDescription(organizationId: string, dto: DraftVisitTemplateDto) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const draft = apiKey ? await this.draftWithLlm(dto, apiKey) : this.draftHeuristic(dto);

    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.visitTemplate.create({
      data: {
        organizationId,
        name: draft.name,
        category: draft.category,
        icd10Code: draft.icd10Code,
        chiefComplaint: draft.chiefComplaint,
        diagnosisDisplay: draft.diagnosisDisplay,
        medicationsJson: draft.medicationsJson as object,
        testsJson: draft.testsJson as object,
        advice: draft.advice,
        followUpDays: draft.followUpDays,
        language: dto.language ?? 'en',
        aiGenerated: true,
      },
    });
  }

  private async draftWithLlm(dto: DraftVisitTemplateDto, apiKey: string) {
    const prompt = [
      'Draft a clinic visit template for this condition description, for an Indian OPD clinic.',
      'Return ONLY a JSON object with keys: name, category, icd10Code, chiefComplaint,',
      'diagnosisDisplay, medicationsJson (array of {medicationName, dosageText, frequency,',
      'durationDays}), testsJson (array of strings), advice, followUpDays (number or null).',
      '',
      `Condition description: ${dto.description}`,
    ].join('\n');

    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout: 20000 },
    );
    const text: string = res.data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? '';
    try {
      return JSON.parse(text);
    } catch {
      throw new BadRequestException('AI drafting returned an unparseable template — try rephrasing the description');
    }
  }

  private draftHeuristic(dto: DraftVisitTemplateDto) {
    return {
      name: dto.description.slice(0, 60),
      category: 'general',
      icd10Code: null,
      chiefComplaint: dto.description,
      diagnosisDisplay: dto.description,
      medicationsJson: [],
      testsJson: [],
      advice: 'Review and complete this draft — no ANTHROPIC_API_KEY configured, so this is a placeholder only.',
      followUpDays: null,
    };
  }

  /**
   * Applies a template to an encounter in one call: sets visitTemplateId,
   * creates the Condition (diagnosis) and MedicationRequest rows. Nothing is
   * billed or finalized by this — the doctor still reviews and finalizes the
   * encounter separately (same "review once, adjust anything, save" model
   * arogyam.ai describes).
   */
  async applyToEncounter(organizationId: string, templateId: string, encounterId: string) {
    const template = await this.findOne(organizationId, templateId);
    const prisma = await this.prisma.forTenant(organizationId);
    const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) throw new NotFoundException(`Encounter ${encounterId} not found`);

    const medications = (template.medicationsJson as Array<Record<string, unknown>>) ?? [];

    await prisma.$transaction([
      prisma.encounter.update({ where: { id: encounterId }, data: { visitTemplateId: templateId } }),
      prisma.condition.create({
        data: {
          encounterId,
          patientId: encounter.patientId,
          codeSystem: template.icd10Code ? 'icd10' : 'template',
          code: template.icd10Code ?? template.category,
          display: template.diagnosisDisplay,
        },
      }),
      ...medications.map((m) =>
        prisma.medicationRequest.create({
          data: {
            encounterId,
            patientId: encounter.patientId,
            medicationCode: String(m.medicationCode ?? m.medicationName ?? ''),
            medicationName: String(m.medicationName ?? ''),
            dosageText: String(m.dosageText ?? ''),
            frequency: m.frequency ? String(m.frequency) : undefined,
            durationDays: typeof m.durationDays === 'number' ? m.durationDays : undefined,
            status: 'draft',
          },
        }),
      ),
    ]);

    return this.prisma.forTenant(organizationId).then((p) =>
      p.encounter.findUnique({
        where: { id: encounterId },
        include: { conditions: true, medications: true, visitTemplate: true },
      }),
    );
  }
}
