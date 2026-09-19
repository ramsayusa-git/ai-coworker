import { Module } from '@nestjs/common';
import { B2bController } from './b2b.controller';
@Module({ controllers: [B2bController] })
export class B2bModule {}
