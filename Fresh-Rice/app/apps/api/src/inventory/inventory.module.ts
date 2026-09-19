import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LotMilestonesService } from './lot-milestones';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';
@Module({
  controllers: [InventoryController, StickersController],
  providers: [InventoryService, LotMilestonesService, StickersService],
  exports: [InventoryService, LotMilestonesService, StickersService],
})
export class InventoryModule {}
