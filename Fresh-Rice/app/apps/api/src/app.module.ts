import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ReportsModule } from './reports/reports.module';
import { CouponsModule } from './coupons/coupons.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ZonesModule } from './zones/zones.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { B2bModule } from './b2b/b2b.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { VendorsModule } from './vendors/vendors.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { InvoicesModule } from './invoices/invoices.module';
import { VendorPortalModule } from './vendor-portal/vendor-portal.module';
import { SalesModule } from './sales/sales.module';
import { IssuesModule } from './issues/issues.module';
import { ModificationsModule } from './modifications/modifications.module';
import { HrModule } from './hr/hr.module';
import { FleetModule } from './fleet/fleet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
    PrismaModule, AuthModule, CatalogModule, ZonesModule, InventoryModule, OrdersModule,
    SubscriptionsModule, DispatchModule, B2bModule, AdminModule, NotificationsModule, PaymentsModule, VendorsModule, WarehousesModule, InvoicesModule, ReportsModule, CouponsModule, VendorPortalModule, SalesModule, IssuesModule, ModificationsModule, HrModule, FleetModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
