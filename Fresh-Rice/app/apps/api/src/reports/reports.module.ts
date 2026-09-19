import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { DataIoController } from './data-io.controller';
@Module({ controllers: [ReportsController, DataIoController] })
export class ReportsModule {}
