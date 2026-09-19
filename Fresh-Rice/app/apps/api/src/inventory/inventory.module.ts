import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LotMilestonesService } from './lot-milestones';
@Module({ controllers: [InventoryController], providers: [InventoryService, LotMilestonesService], exports: [InventoryService, LotMilestonesService] })
export class InventoryModule {}
