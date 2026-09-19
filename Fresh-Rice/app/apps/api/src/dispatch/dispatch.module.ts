import { HrModule } from '../hr/hr.module';
import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { ShiftsController, ShiftsService } from './shifts';
import { OrdersModule } from '../orders/orders.module';
@Module({ imports: [OrdersModule, HrModule], controllers: [DispatchController, ShiftsController], providers: [DispatchService, ShiftsService] })
export class DispatchModule {}
