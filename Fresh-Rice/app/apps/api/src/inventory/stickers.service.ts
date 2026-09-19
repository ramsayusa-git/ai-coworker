import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Crockford-style base32: no I/L/O/U, so a code read off a sticker by hand can't be
 *  mistyped into a different valid code. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 10; // 32^10 ≈ 1.1e15 — not guessable by brute force

function newCode(): string {
  const b = randomBytes(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[b[i] % 32];
  return s;
}

/** Batches over this size are almost always a typo (e.g. kg typed into the count box). */
const MAX_PER_BATCH = 5000;

@Injectable()
export class StickersService {
  constructor(private db: PrismaService) {}

  /** Generate a batch of unique stickers for one lot + pack size. */
  async createBatch(d: { lotId: string; packKg: number; count: number; note?: string }, userId?: string) {
    const count = Math.floor(Number(d.count));
    const packKg = Math.floor(Number(d.packKg));
    if (!Number.isFinite(count) || count < 1 || count > MAX_PER_BATCH) throw new BadRequestException(`count must be 1..${MAX_PER_BATCH}`);
    if (!Number.isFinite(packKg) || packKg < 1) throw new BadRequestException('packKg must be a positive number');
    const lot = await this.db.lot.findUnique({ where: { id: d.lotId } });
    if (!lot) throw new NotFoundException('Lot not found');

    // Warn (don't block) when a batch would sticker more bags than the lot can fill — ops
    // sometimes pre-print for an incoming refill, but a 10x typo should be visible.
    const capacity = Math.floor(lot.onHandKg / packKg);

    const batch = await this.db.stickerBatch.create({
      data: { lotId: d.lotId, packKg, count, note: d.note || null, createdById: userId || null },
    });

    // Unique codes: generate, then insert with skipDuplicates and top up whatever collided.
    // At 32^10 a collision is vanishingly rare, but retrying is cheaper than trusting luck.
    let made = 0;
    for (let attempt = 0; attempt < 5 && made < count; attempt++) {
      const need = count - made;
      const rows = Array.from({ length: need }, (_, i) => ({
        code: newCode(), batchId: batch.id, lotId: d.lotId, packKg, serial: made + i + 1,
      }));
      const res = await this.db.bagSticker.createMany({ data: rows, skipDuplicates: true });
      made += res.count;
    }
    if (made < count) throw new BadRequestException(`Only ${made}/${count} codes could be generated — try again`);

    return { ...batch, generated: made, lotNo: lot.lotNo, capacity, overCapacity: count > capacity };
  }

  async batches(lotId?: string) {
    const rows = await this.db.stickerBatch.findMany({
      where: lotId ? { lotId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lot: { select: { lotNo: true, variety: { select: { name: true } } } } },
    });
    const counts = await this.db.bagSticker.groupBy({
      by: ['batchId', 'status'],
      where: { batchId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const scanned = await this.db.bagSticker.groupBy({
      by: ['batchId'],
      where: { batchId: { in: rows.map((r) => r.id) }, scanCount: { gt: 0 } },
      _count: { _all: true },
    });
    return rows.map((r) => {
      const mine = counts.filter((c) => c.batchId === r.id);
      const by = (s: string) => mine.find((c) => c.status === s)?._count._all || 0;
      return {
        id: r.id, lotId: r.lotId, lotNo: r.lot.lotNo, variety: r.lot.variety.name,
        packKg: r.packKg, count: r.count, note: r.note, createdAt: r.createdAt, printedAt: r.printedAt,
        printed: by('PRINTED'), applied: by('APPLIED'), void: by('VOID'),
        scanned: scanned.find((s) => s.batchId === r.id)?._count._all || 0,
      };
    });
  }

  /** Stickers in a batch, for the print sheet and the detail drawer. */
  async stickersOf(batchId: string) {
    return this.db.bagSticker.findMany({
      where: { batchId }, orderBy: { serial: 'asc' },
      include: { lot: { include: { vendor: true, variety: true, warehouse: true } } },
    });
  }

  async markPrinted(batchId: string) {
    return this.db.stickerBatch.update({ where: { id: batchId }, data: { printedAt: new Date() } });
  }

  /** Warehouse scans a sticker as it goes onto a bag. */
  async apply(code: string) {
    const s = await this.db.bagSticker.findUnique({ where: { code: code.toUpperCase() } });
    if (!s) throw new NotFoundException('Unknown sticker code');
    if (s.status === 'VOID') throw new BadRequestException('Sticker is void');
    if (s.status === 'APPLIED') return { ...s, alreadyApplied: true };
    return this.db.bagSticker.update({ where: { id: s.id }, data: { status: 'APPLIED', appliedAt: new Date() } });
  }

  /** Damaged/misprinted sticker — voiding keeps the code reserved so it can never be reused. */
  async void(code: string) {
    const s = await this.db.bagSticker.findUnique({ where: { code: code.toUpperCase() } });
    if (!s) throw new NotFoundException('Unknown sticker code');
    return this.db.bagSticker.update({ where: { id: s.id }, data: { status: 'VOID', voidedAt: new Date() } });
  }

  /** Record a public scan. Returns the sticker (with its lot) or null if the code is not ours. */
  async recordScan(code: string) {
    const s = await this.db.bagSticker.findUnique({
      where: { code: code.toUpperCase() },
      // Same shape the public trace endpoint returns for a lot, so either code path
      // (sticker or bare lot number) feeds the page identical data.
      include: {
        lot: {
          include: {
            vendor: true,
            variety: {
              include: {
                skus: {
                  where: { active: true },
                  include: {
                    prices: {
                      where: { scope: 'BASE', validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
                      orderBy: { validFrom: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!s) return null;
    const now = new Date();
    await this.db.bagSticker.update({
      where: { id: s.id },
      data: { scanCount: { increment: 1 }, lastScanAt: now, ...(s.firstScanAt ? {} : { firstScanAt: now }) },
    });
    return s;
  }

  /** Counterfeit watch, per bag. A lot code is legitimately scanned by every customer who
   *  bought from that lot, so it is a noisy signal; ONE bag's sticker scanned from several
   *  different devices means that sticker has been photocopied. */
  async suspicious(hours = 720, minIps = 3) {
    const since = new Date(Date.now() - hours * 3600000);
    // TraceScan.lotNo holds whatever code was scanned — lot number or sticker code.
    const rows = await this.db.$queryRaw<{ code: string; scans: bigint; ips: bigint }[]>`
      SELECT s."lotNo" AS code, COUNT(*) AS scans, COUNT(DISTINCT s.ip) AS ips
      FROM "TraceScan" s
      JOIN "BagSticker" b ON b.code = s."lotNo"
      WHERE s.at >= ${since}
      GROUP BY s."lotNo"
      HAVING COUNT(DISTINCT s.ip) >= ${minIps}
      ORDER BY COUNT(DISTINCT s.ip) DESC
      LIMIT 100`;
    if (!rows.length) return [];
    const stickers = await this.db.bagSticker.findMany({
      where: { code: { in: rows.map((r) => r.code) } },
      include: { lot: { select: { lotNo: true, variety: { select: { name: true } } } } },
    });
    return rows.map((r) => {
      const st = stickers.find((s) => s.code === r.code);
      return {
        code: r.code, scans: Number(r.scans), distinctIps: Number(r.ips),
        lotNo: st?.lot.lotNo || null, variety: st?.lot.variety.name || null,
        packKg: st?.packKg ?? null, serial: st?.serial ?? null, status: st?.status || null,
      };
    });
  }

  async stats() {
    const [byStatus, batches, scannedAgg] = await Promise.all([
      this.db.bagSticker.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.stickerBatch.count(),
      this.db.bagSticker.aggregate({ _sum: { scanCount: true }, _count: { _all: true } }),
    ]);
    const by = (s: string) => byStatus.find((r) => r.status === s)?._count._all || 0;
    return {
      batches, total: scannedAgg._count._all, totalScans: scannedAgg._sum.scanCount || 0,
      printed: by('PRINTED'), applied: by('APPLIED'), void: by('VOID'),
      suspicious: (await this.suspicious()).length,
    };
  }
}
