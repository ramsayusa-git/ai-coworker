import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called from the JWT strategy once a token is verified, to hydrate role + org. */
  async findByKeycloakSub(keycloakSub: string) {
    return this.prisma.user.findUnique({ where: { keycloakSub } });
  }

  async create(organizationId: string, keycloakSub: string, name: string, role: 'OWNER' | 'ADMIN' | 'DOCTOR' | 'FRONT_DESK') {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.user.create({ data: { organizationId, keycloakSub, name, role } });
  }

  async listForOrg(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.user.findMany({ where: { organizationId } });
  }

  async updateRole(organizationId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'DOCTOR' | 'FRONT_DESK') {
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.user.update({ where: { id: userId }, data: { role } });
  }
}
