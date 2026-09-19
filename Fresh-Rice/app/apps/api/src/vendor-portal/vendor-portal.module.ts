import { Module } from '@nestjs/common';
import { VendorPortalController } from './vendor-portal.controller';
@Module({ controllers: [VendorPortalController] })
export class VendorPortalModule {}
