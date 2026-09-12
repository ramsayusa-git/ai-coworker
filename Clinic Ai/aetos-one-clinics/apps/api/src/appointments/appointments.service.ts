import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AddonBusService } from '../addons/addon-bus.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: AddonBusService,
  ) {}

  async create(organizationId: string, dto: CreateAppointmentDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    const tokenNumber = await this.nextToken(organizationId, dto.locationId, dto.start);
    const appt = await prisma.appointment.create({
      data: {
        locationId: dto.locationId,
        patientId: dto.patientId,
        practitionerId: dto.practitionerId,
        start: new Date(dto.start),
        end: dto.end ? new Date(dto.end) : undefined,
        tokenNumber,
      },
    });
    // Fire-and-forget: the pre-visit-intake and smart-queue add-ons (if enabled)
    // pick this up and may later write triageScore back via PATCH.
    await this.bus.publish(organizationId, 'appointment.created', { appointmentId: appt.id });
    return appt;
  }

  private async nextToken(organizationId: string, locationId: string, startIso: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const dayStart = new Date(startIso);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = await prisma.appointment.count({
      where: { locationId, start: { gte: dayStart, lt: dayEnd } },
    });
    return count + 1;
  }

  async findQueue(organizationId: string, locationId: string, date: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return prisma.appointment.findMany({
      where: { locationId, start: { gte: dayStart, lt: dayEnd } },
      include: { patient: true },
      // Smart-queue add-on writes triageScore; nulls (add-on disabled) sort by time only.
      orderBy: [{ triageScore: 'desc' }, { tokenNumber: 'asc' }],
    });
  }

  async updateStatus(organizationId: string, id: string, status: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.appointment.update({ where: { id }, data: { status } });
  }

  async updateTriageScore(organizationId: string, id: string, triageScore: number) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.appointment.update({ where: { id }, data: { triageScore } });
  }
}
