import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { startOfDay } from '../common/money';

const CAPACITY: Record<VehicleType, number> = { TWO_WHEELER: 30, THREE_WHEELER: 150, TEMPO: 600 };

@Injectable()
export class DispatchService {
  constructor(private db: PrismaService, private orders: OrdersService, private notify: NotificationsService) {}

  /** Batch confirmed orders for a date into routes: by zone → slot → apartment complex, fill by kg capacity. 25kg+ orders never go on 2-wheelers. */
  async autoBatch(dateStr: string, vehicleType: VehicleType = 'THREE_WHEELER') {
    const date = startOfDay(new Date(dateStr));
    const orders = await this.db.order.findMany({ where: { deliveryDate: date, status: { in: ['CONFIRMED', 'PACKED'] }, stop: null }, include: { address: true, slot: true }, orderBy: [{ slotId: 'asc' }, { address: { complex: 'asc' } }, { address: { line1: 'asc' } }] });
    const byZone = new Map<string, typeof orders>();
    for (const o of orders) { const z = o.address.zoneId || 'none'; byZone.set(z, [...(byZone.get(z) || []), o]); }
    const created: any[] = [];
    for (const [zoneId, zoneOrders] of byZone) {
      if (zoneId === 'none') continue;
      let route: any = null; let seq = 0;
      for (const o of zoneOrders) {
        const vt: VehicleType = o.totalKg >= 25 && vehicleType === 'TWO_WHEELER' ? 'THREE_WHEELER' : vehicleType;
        if (!route || route.loadKg + o.totalKg > CAPACITY[route.vehicleType] || route.vehicleType !== vt) {
          route = await this.db.route.create({ data: { date, zoneId, vehicleType: vt, capacityKg: CAPACITY[vt], status: 'DRAFT' } });
          created.push(route); seq = 0;
        }
        seq++;
        await this.db.routeStop.create({ data: { routeId: route.id, orderId: o.id, seq, deliveryOtp: String(Math.floor(1000 + Math.random() * 9000)) } });
        route = await this.db.route.update({ where: { id: route.id }, data: { loadKg: { increment: o.totalKg } } });
        if (o.status === 'CONFIRMED') await this.orders.transition(o.id, 'PACKED', 'batch');
      }
    }
    for (const r of created) await this.optimiseRoute(r.id);
    return { date, ordersBatched: orders.length, routesCreated: created.length };
  }

  /** Nearest-neighbour ordering from the zone's warehouse (or first stop). Good enough for <25 stops; swap for Mappls Route Optimisation later. */
  async optimiseRoute(routeId: string) {
    const r = await this.db.route.findUniqueOrThrow({ where: { id: routeId }, include: { zone: { include: { warehouse: true } }, stops: { include: { order: { include: { address: true } } } } } });
    const withGeo = r.stops.filter((s) => s.order.address.lat && s.order.address.lng); const noGeo = r.stops.filter((s) => !s.order.address.lat);
    if (withGeo.length < 2) return r.stops.length;
    let cur = { lat: 17.4849, lng: 78.3914 }; // Kukatpally MFC default
    const remaining = [...withGeo]; const ordered: typeof withGeo = [];
    while (remaining.length) {
      remaining.sort((a, b) => Math.hypot(a.order.address.lat! - cur.lat, a.order.address.lng! - cur.lng) - Math.hypot(b.order.address.lat! - cur.lat, b.order.address.lng! - cur.lng));
      const n = remaining.shift()!; ordered.push(n); cur = { lat: n.order.address.lat!, lng: n.order.address.lng! };
    }
    let seq = 0; const slotStart = r.stops[0]?.order ? undefined : undefined;
    for (const s of [...ordered, ...noGeo]) { seq++; await this.db.routeStop.update({ where: { id: s.id }, data: { seq, eta: new Date(r.date.getTime() + (7 * 60 + seq * 12) * 60000) } }); }
    return seq;
  }

  /** Rider GPS ping (every ~30s while on shift) */
  async ping(riderId: string, lat: number, lng: number) {
    await this.db.riderLocation.create({ data: { riderId, lat, lng } });
    await this.db.riderLocation.deleteMany({ where: { riderId, at: { lt: new Date(Date.now() - 12 * 3600000) } } });
    return { ok: true };
  }
  async lastLocation(riderId: string) { return this.db.riderLocation.findFirst({ where: { riderId }, orderBy: { at: 'desc' } }); }
  /** Every rider with last known position + current route progress. onDutyOnly=true (customers) drops riders
   *  who have no route in progress and hides inactive riders. Single query pass, no N+1. */
  async liveRiders(onDutyOnly = false) {
    const riders = await this.db.user.findMany({ where: { OR: [{ role: 'RIDER' }, { isField: true }], ...(onDutyOnly ? { active: true } : {}) }, select: { id: true, name: true, phone: true, active: true, role: true, isField: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    const ids = riders.map((r) => r.id);
    const [locs, routes, delivered, shifts] = await Promise.all([
      this.db.riderLocation.findMany({ where: { riderId: { in: ids } }, orderBy: { at: 'desc' }, distinct: ['riderId'] }),
      this.db.route.findMany({ where: { riderId: { in: ids }, status: 'IN_PROGRESS' }, include: { zone: true, _count: { select: { stops: true } } } }),
      this.db.routeStop.groupBy({ by: ['routeId'], where: { status: 'DELIVERED', route: { riderId: { in: ids }, status: 'IN_PROGRESS' } }, _count: { _all: true } }),
      this.db.shift.findMany({ where: { userId: { in: ids }, endedAt: null }, orderBy: { startedAt: 'desc' }, distinct: ['userId'] }),
    ]);
    const shiftBy = new Map(shifts.map((s) => [s.userId, s]));
    const locBy = new Map(locs.map((l) => [l.riderId, l])); const routeBy = new Map(routes.map((r) => [r.riderId!, r])); const doneBy = new Map(delivered.map((d) => [d.routeId, d._count._all]));
    const staleMs = 10 * 60000;
    const out = riders.map((r) => {
      const loc = locBy.get(r.id); const route = routeBy.get(r.id); const sh = shiftBy.get(r.id);
      return { ...r, kind: r.role === 'RIDER' ? 'rider' : 'field', onDuty: !!sh, dutySince: sh?.startedAt || null, loc: loc ? { lat: loc.lat, lng: loc.lng, at: loc.at } : null, online: !!loc && Date.now() - loc.at.getTime() < staleMs,
        route: route ? { id: route.id, zone: route.zone.name, stops: route._count.stops, delivered: doneBy.get(route.id) || 0 } : null };
    });
    return onDutyOnly ? out.filter((r) => r.kind === 'rider' && r.route) : out;
  }

  /** Scan-to-load: rider scans bag QR (lot|sku) at warehouse; must match the stop's allocated lot */
  async scanLoad(riderId: string, stopId: string, lotNoRaw: string) {
    // Bag QR now encodes the public trace URL (https://freshrice.in/trace/<lotNo>) instead of
    // a raw "lotNo|sku" string, so pull the lot code out of the last path segment if a URL was
    // scanned; falls back to the raw value for older labels / manual entry.
    const lotNo = lotNoRaw.includes('/trace/') ? lotNoRaw.split('/trace/').pop()!.split(/[?#]/)[0] : lotNoRaw;
    const stop = await this.db.routeStop.findUniqueOrThrow({ where: { id: stopId }, include: { route: true, order: { include: { items: { include: { lot: true } } } } } });
    if (stop.route.riderId !== riderId) throw new ForbiddenException('Not your route');
    const ok = stop.order.items.some((i) => i.lot?.lotNo === lotNo || (i.lot && lotNo.startsWith(i.lot.lotNo)));
    if (!ok) { await this.db.event.create({ data: { actor: riderId, type: 'wrong_lot_scan', payload: { stopId, lotNo } } }); throw new BadRequestException(`Wrong bag: this order needs lot ${stop.order.items.map((i) => i.lot?.lotNo).join(', ')}`); }
    await this.db.routeStop.update({ where: { id: stopId }, data: { loadedAt: new Date() } });
    return { ok: true, loaded: true };
  }

  routes(dateStr?: string) {
    const where = dateStr ? { date: startOfDay(new Date(dateStr)) } : {};
    return this.db.route.findMany({ where, include: { zone: true, rider: { select: { id: true, name: true, phone: true } }, stops: { orderBy: { seq: 'asc' }, include: { order: { include: { address: true, user: { select: { name: true, phone: true } }, items: { include: { sku: true } }, payment: true } } } } }, orderBy: { createdAt: 'asc' } });
  }

  async assign(routeId: string, riderId: string) {
    const rider = await this.db.user.findFirst({ where: { id: riderId, role: 'RIDER' } });
    if (!rider) throw new NotFoundException('Rider not found');
    return this.db.route.update({ where: { id: routeId }, data: { riderId, status: 'PUBLISHED' } });
  }

  async start(routeId: string, riderId: string) {
    const r = await this.db.route.findUniqueOrThrow({ where: { id: routeId }, include: { stops: true } });
    if (r.riderId !== riderId) throw new ForbiddenException();
    await this.db.route.update({ where: { id: routeId }, data: { status: 'IN_PROGRESS' } });
    for (const s of r.stops) {
      const o = await this.db.order.findUnique({ where: { id: s.orderId }, include: { user: true } });
      if (o?.status === 'PACKED') {
        await this.orders.transition(o.id, 'OUT_FOR_DELIVERY', riderId);
        await this.notify.send(o.user.phone, 'otp_delivery', `Your delivery OTP for order #${o.orderNo} is ${s.deliveryOtp}. Share it with the rider only at handover.`);
      }
    }
    return this.db.route.findUnique({ where: { id: routeId } });
  }

  riderManifest(riderId: string) {
    return this.db.route.findMany({ where: { riderId, status: { in: ['PUBLISHED', 'IN_PROGRESS'] } }, include: { zone: true, stops: { orderBy: { seq: 'asc' }, include: { order: { include: { address: true, user: { select: { name: true, phone: true } }, items: { include: { sku: { include: { variety: true } }, lot: true } }, payment: true } } } } }, orderBy: { date: 'asc' } });
  }

  async deliver(stopId: string, riderId: string, d: { otp?: string; podPhotoUrl?: string; lat?: number; lng?: number; failReason?: string }) {
    const stop = await this.db.routeStop.findUniqueOrThrow({ where: { id: stopId }, include: { route: true, order: { include: { address: true } } } });
    if (stop.route.riderId !== riderId) throw new ForbiddenException('Not your route');
    if (d.failReason) {
      await this.db.routeStop.update({ where: { id: stopId }, data: { status: 'FAILED', failReason: d.failReason } });
      await this.orders.transition(stop.orderId, 'FAILED', riderId, { reason: d.failReason });
      return { ok: true, status: 'FAILED' };
    }
    const otpOk = !!d.otp && d.otp === stop.deliveryOtp;
    if (!otpOk && !d.podPhotoUrl) throw new BadRequestException('Need customer OTP or a photo at the door');
    if (d.lat && stop.order.address.lat) {
      const km = Math.hypot((d.lat - stop.order.address.lat) * 111, (d.lng! - stop.order.address.lng!) * 105);
      if (km > 0.5) await this.db.event.create({ data: { actor: riderId, type: 'pod_geofence_flag', payload: { stopId, km } } });
    }
    await this.db.routeStop.update({ where: { id: stopId }, data: { status: 'DELIVERED', otpVerified: otpOk, podPhotoUrl: d.podPhotoUrl, podLat: d.lat, podLng: d.lng, deliveredAt: new Date() } });
    await this.orders.transition(stop.orderId, 'DELIVERED', riderId, { otpVerified: otpOk });
    const remaining = await this.db.routeStop.count({ where: { routeId: stop.routeId, status: { in: ['PENDING', 'ARRIVED'] } } });
    if (remaining === 0) await this.db.route.update({ where: { id: stop.routeId }, data: { status: 'COMPLETED' } });
    return { ok: true, status: 'DELIVERED', otpVerified: otpOk };
  }

  riders() { return this.db.user.findMany({ where: { role: 'RIDER' }, select: { id: true, name: true, phone: true, active: true, createdAt: true }, orderBy: { name: 'asc' } }); }
  updateRider(id: string, b: { name?: string; active?: boolean }) { return this.db.user.update({ where: { id, role: 'RIDER' }, data: { name: b.name, active: b.active }, select: { id: true, name: true, phone: true, active: true } }); }
}
