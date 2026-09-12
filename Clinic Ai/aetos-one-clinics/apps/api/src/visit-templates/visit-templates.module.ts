import { Module } from '@nestjs/common';
import { VisitTemplatesController } from './visit-templates.controller';
import { VisitTemplatesService } from './visit-templates.service';

@Module({
  controllers: [VisitTemplatesController],
  providers: [VisitTemplatesService],
})
export class VisitTemplatesModule {}
