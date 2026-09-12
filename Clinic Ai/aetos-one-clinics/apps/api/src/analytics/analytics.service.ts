import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Practice analytics — named in arogyam.ai's Full Suite/Multi-Clinic tiers,
 * completely absent from this scaffold before this pass. Deliberately plain
 * SQL aggregation (no add-on involved) since this is just counting rows we
 * already store; Command Center is the "operational, right now" view, this
 * is the "over time" view.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(organizationId: string, days = 30) {
    const prisma = await this.prisma.forTenant(organizationId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [appointmentCount, completedEncounters, revenue, topDiagnoses, noShowCount] = await Promise.all([
      prisma.appointment.count({ where: { createdAt: { gte: since } } }),
      prisma.encounter.count({ where: { status: 'finished', createdAt: { gte: since } } }),
      prisma.invoice.aggregate({
        where: { status: 'paid', createdAt: { gte: since } },
        _sum: { totalAmount: true },
      }),
      prisma.condition.groupBy({
        by: ['display'],
        where: { createdAt: { gte: since } },
        _count: { display: true },
        orderBy: { _count: { display: 'desc' } },
        take: 5,
      }),
      prisma.appointment.count({ where: { status: 'no-show', createdAt: { gte: since } } }),
    ]);

    return {
      periodDays: days,
      appointments: { total: appointmentCount, noShows: noShowCount },
      encountersCompleted: completedEncounters,
      revenueCollected: revenue._sum.totalAmount ?? 0,
      topDiagnoses: topDiagnoses.map((d) => ({ diagnosis: d.display, count: d._count.display })),
    };
  }
}
