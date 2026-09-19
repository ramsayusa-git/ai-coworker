import { Global, Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
@Global()
@Module({ providers: [CouponsService], controllers: [CouponsController], exports: [CouponsService] })
export class CouponsModule {}
