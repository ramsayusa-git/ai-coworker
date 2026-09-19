import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { OrdersModule } from '../orders/orders.module';
@Module({ imports: [OrdersModule], controllers: [DispatchController], providers: [DispatchService] })
export class DispatchModule {}
