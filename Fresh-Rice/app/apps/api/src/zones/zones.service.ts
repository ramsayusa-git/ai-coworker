import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class ZonesService {
  constructor(private db: PrismaService) {}
  async byPincode(pincode: string) { return this.db.zone.findFirst({ where: { active: true, pincodes: { has: pincode } }, include: { slots: true } }); }
  list() { return this.db.zone.findMany({ include: { slots: true } }); }
  create(d: { name: string; pincodes: string[] }) { return this.db.zone.create({ data: d }); }
}
