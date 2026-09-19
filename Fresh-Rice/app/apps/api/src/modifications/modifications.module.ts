import { Module } from '@nestjs/common';
import { ModificationsController } from './modifications.controller';
import { ModificationsService } from './modifications.service';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoicesModule } from '../invoices/invoices.module';
@Module({ imports: [CatalogModule, InventoryModule, InvoicesModule], controllers: [ModificationsController], providers: [ModificationsService], exports: [ModificationsService] })
export class ModificationsModule {}
