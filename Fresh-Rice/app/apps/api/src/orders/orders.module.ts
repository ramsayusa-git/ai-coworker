import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RiceMeterController } from './rice-meter.controller';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ZonesModule } from '../zones/zones.module';
// RiceMeterController is listed before OrdersController so GET orders/rice-meter isn't swallowed by GET orders/:id.
@Module({ imports: [CatalogModule, InventoryModule, ZonesModule], controllers: [RiceMeterController, OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
