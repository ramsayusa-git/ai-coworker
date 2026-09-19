import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(private db: PrismaService) {}

  lots(q: { varietyId?: string; warehouseId?: string }) {
    return this.db.lot.findMany({ where: { varietyId: q.varietyId, warehouseId: q.warehouseId }, include: { vendor: true, variety: true, warehouse: true }, orderBy: [{ variety: { code: 'asc' } }, { milledOn: 'asc' }] });
  }

  /** Goods receipt against a PO line (or ad-hoc): creates lot + GRN ledger + vendor bill */
  async receive(d: { lotNo: string; vendorId: string; warehouseId: string; varietyId: string; harvestSeason: string; milledOn: string; moisturePct: number; brokenPct: number; costPaisePerKg: number; receivedKg: number; poId?: string }) {
    if (d.moisturePct > 14) throw new BadRequestException('Reject: moisture above 14% (spec < 13%)');
    return this.db.$transaction(async (tx) => {
      const lot = await tx.lot.create({ data: { lotNo: d.lotNo, vendorId: d.vendorId, warehouseId: d.warehouseId, varietyId: d.varietyId, harvestSeason: d.harvestSeason, milledOn: new Date(d.milledOn), moisturePct: d.moisturePct, brokenPct: d.brokenPct, costPaisePerKg: d.costPaisePerKg, receivedKg: d.receivedKg, onHandKg: d.receivedKg, poId: d.poId } });
      await tx.stockLedger.create({ data: { lotId: lot.id, kgDelta: d.receivedKg, reason: 'GRN', refType: 'lot', refId: lot.id } });
      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: d.vendorId } });
      const due = new Date(); due.setDate(due.getDate() + vendor.termsDays);
      await tx.vendorLedger.create({ data: { vendorId: d.vendorId, deltaPaise: Math.round(d.costPaisePerKg * d.receivedKg), reason: 'bill', ref: lot.lotNo, poId: d.poId, dueOn: due } });
      if (d.poId) {
        const line = await tx.poLine.findFirst({ where: { poId: d.poId, varietyId: d.varietyId } });
        if (line) await tx.poLine.update({ where: { id: line.id }, data: { receivedKg: { increment: d.receivedKg } } });
        const lines = await tx.poLine.findMany({ where: { poId: d.poId } });
        const done = lines.every((l) => l.receivedKg >= l.kg - 0.001);
        await tx.purchaseOrder.update({ where: { id: d.poId }, data: { status: done ? 'RECEIVED' : 'PARTIAL' } });
      }
      return lot;
    });
  }

  /** FIFO allocation within the zone's warehouse: oldest milled lot with stock first. */
  async allocateFifo(tx: Tx, varietyId: string, skuId: string, kg: number, orderId: string, warehouseId?: string | null) {
    const lots = await tx.lot.findMany({ where: { varietyId, onHandKg: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) }, orderBy: { milledOn: 'asc' } });
    let remaining = kg; let primaryLot: string | null = null;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.onHandKg, remaining);
      await tx.lot.update({ where: { id: lot.id }, data: { onHandKg: { decrement: take } } });
      await tx.stockLedger.create({ data: { lotId: lot.id, skuId, kgDelta: -take, reason: 'SALE', refType: 'order', refId: orderId } });
      primaryLot ??= lot.id; remaining -= take;
    }
    if (remaining > 0.001) throw new BadRequestException('Insufficient stock for this variety in your zone warehouse');
    return primaryLot!;
  }

  async release(tx: Tx, orderId: string) {
    const entries = await tx.stockLedger.findMany({ where: { refType: 'order', refId: orderId, reason: 'SALE' } });
    for (const e of entries) {
      await tx.lot.update({ where: { id: e.lotId }, data: { onHandKg: { increment: -e.kgDelta } } });
      await tx.stockLedger.create({ data: { lotId: e.lotId, skuId: e.skuId, kgDelta: -e.kgDelta, reason: 'RELEASE', refType: 'order', refId: orderId } });
    }
  }

  async adjust(lotId: string, kgDelta: number, reason: 'DAMAGE' | 'ADJUST', note?: string) {
    return this.db.$transaction(async (tx) => {
      await tx.lot.update({ where: { id: lotId }, data: { onHandKg: { increment: kgDelta } } });
      return tx.stockLedger.create({ data: { lotId, kgDelta, reason, refType: 'manual', refId: note } });
    });
  }

  /** Move kg of a lot to another warehouse: creates a child lot (same specs) there. */
  async transfer(d: { lotId: string; toWarehouseId: string; kg: number; note?: string }) {
    const lot = await this.db.lot.findUniqueOrThrow({ where: { id: d.lotId } });
    if (d.kg <= 0 || d.kg > lot.onHandKg) throw new BadRequestException('Transfer kg exceeds on-hand');
    if (lot.warehouseId === d.toWarehouseId) throw new BadRequestException('Same warehouse');
    const to = await this.db.warehouse.findUnique({ where: { id: d.toWarehouseId } });
    if (!to) throw new NotFoundException('Warehouse not found');
    return this.db.$transaction(async (tx) => {
      const newLotNo = `${lot.lotNo}-${to.code}`;
      const existing = await tx.lot.findUnique({ where: { lotNo: newLotNo } });
      await tx.lot.update({ where: { id: lot.id }, data: { onHandKg: { decrement: d.kg } } });
      await tx.stockLedger.create({ data: { lotId: lot.id, kgDelta: -d.kg, reason: 'ADJUST', refType: 'transfer_out', refId: newLotNo } });
      const child = existing
        ? await tx.lot.update({ where: { id: existing.id }, data: { onHandKg: { increment: d.kg }, receivedKg: { increment: d.kg } } })
        : await tx.lot.create({ data: { lotNo: newLotNo, vendorId: lot.vendorId, warehouseId: d.toWarehouseId, varietyId: lot.varietyId, harvestSeason: lot.harvestSeason, milledOn: lot.milledOn, moisturePct: lot.moisturePct, brokenPct: lot.brokenPct, costPaisePerKg: lot.costPaisePerKg, receivedKg: d.kg, onHandKg: d.kg, poId: lot.poId } });
      await tx.stockLedger.create({ data: { lotId: child.id, kgDelta: d.kg, reason: 'ADJUST', refType: 'transfer_in', refId: lot.lotNo } });
      return tx.stockTransfer.create({ data: { fromId: lot.warehouseId, toId: d.toWarehouseId, lotNo: lot.lotNo, newLotNo, kg: d.kg, note: d.note } });
    });
  }

  async stockSummary(warehouseId?: string) {
    const varieties = await this.db.variety.findMany({ include: { lots: { where: { onHandKg: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) }, orderBy: { milledOn: 'asc' }, include: { warehouse: true } } } });
    return varieties.map((v) => {
      const byWh: Record<string, number> = {};
      for (const l of v.lots) byWh[l.warehouse.code] = (byWh[l.warehouse.code] || 0) + l.onHandKg;
      const total = v.lots.reduce((a, l) => a + l.onHandKg, 0);
      return { id: v.id, code: v.code, name: v.name, isAddon: v.isAddon, onHandKg: total, byWarehouse: byWh, lots: v.lots.length, oldestMilledOn: v.lots[0]?.milledOn || null, low: !v.isAddon && total < 500 };
    });
  }

  ledger(lotId: string) { return this.db.stockLedger.findMany({ where: { lotId }, orderBy: { at: 'desc' } }); }
  transfers() { return this.db.stockTransfer.findMany({ include: { fromWarehouse: true, toWarehouse: true }, orderBy: { at: 'desc' }, take: 100 }); }
}
