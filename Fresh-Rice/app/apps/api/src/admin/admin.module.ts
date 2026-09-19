import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { InventoryModule } from '../inventory/inventory.module';
@Module({ imports: [InventoryModule], controllers: [AdminController] })
export class AdminModule {}
