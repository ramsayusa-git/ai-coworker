import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';

@Module({})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      // Pre-login bootstrap route: the web app calls this BEFORE it has an
      // org id to send, so it can't be required to send one. See
      // organizations.controller.ts.
      .exclude('organizations', 'organizations/(.*)')
      .forRoutes('*');
  }
}
