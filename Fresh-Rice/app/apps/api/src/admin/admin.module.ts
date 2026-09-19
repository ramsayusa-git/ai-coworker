import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ApiKeysController } from './api-keys.controller';
import { InventoryModule } from '../inventory/inventory.module';
@Module({ imports: [InventoryModule], controllers: [AdminController, ApiKeysController] })
export class AdminModule {}
