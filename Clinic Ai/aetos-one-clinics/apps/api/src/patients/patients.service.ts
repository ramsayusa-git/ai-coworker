import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePatientDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.patient.create({
      data: {
        locationId: dto.locationId,
        givenName: dto.givenName,
        familyName: dto.familyName,
        gender: dto.gender,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        phone: dto.phone,
        abhaNumber: dto.abhaNumber,
        abhaAddress: dto.abhaAddress,
        preferredLanguage: dto.preferredLanguage ?? 'en',
      },
    });
  }

  async findAll(organizationId: string, locationId?: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.patient.findMany({
      where: locationId ? { locationId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    return patient;
  }

  async findByPhoneOrAbha(organizationId: string, query: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.patient.findMany({
      where: { OR: [{ phone: query }, { abhaNumber: query }, { abhaAddress: query }] },
      take: 20,
    });
  }

  /** Records a patient-portal/kiosk sign-in timestamp (separate from createdAt,
   * which is registration date). No portal exists yet — call this once one does. */
  async recordSignIn(organizationId: string, id: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    return prisma.patient.update({ where: { id }, data: { lastSignInAt: new Date() } });
  }
}
