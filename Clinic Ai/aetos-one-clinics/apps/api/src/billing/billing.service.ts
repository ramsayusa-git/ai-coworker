import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateInvoiceDto) {
    const prisma = await this.prisma.forTenant(organizationId);
    const total = dto.lineItems.reduce((sum, li) => sum + li.amount, 0);
    return prisma.invoice.create({
      data: {
        locationId: dto.locationId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        lineItemsJson: dto.lineItems as any,
        totalAmount: total,
        status: 'issued',
      },
    });
  }

  async markPaid(organizationId: string, id: string, paymentMethod: 'upi' | 'razorpay' | 'cash') {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.invoice.update({
      where: { id },
      data: { status: 'paid', paymentMethod, paidAt: new Date() },
    });
  }

  async findForPatient(organizationId: string, patientId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.invoice.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' } });
  }

  /** Feeds the revenue-integrity add-on: procedures/observations vs what was actually billed. */
  async findUnbilledCandidates(organizationId: string, encounterId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const [encounter, invoices] = await Promise.all([
      prisma.encounter.findUnique({ where: { id: encounterId }, include: { conditions: true, medications: true } }),
      prisma.invoice.findMany({ where: { encounterId } }),
    ]);
    return { encounter, invoices };
  }
}
