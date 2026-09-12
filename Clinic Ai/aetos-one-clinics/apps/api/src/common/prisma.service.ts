import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around PrismaClient. `forTenant` sets the Postgres session variable
 * that the RLS policies in prisma/rls.sql key off of — every tenant-scoped query in
 * a request should go through the client returned by forTenant(orgId), not the raw
 * client, so isolation holds even if a query forgets its own WHERE clause.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  async forTenant(organizationId: string) {
    await this.$executeRawUnsafe(`SET app.current_org_id = '${organizationId}'`);
    return this;
  }
}
