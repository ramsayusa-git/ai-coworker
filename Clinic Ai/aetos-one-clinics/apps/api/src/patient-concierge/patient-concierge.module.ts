import { Module } from '@nestjs/common';
import { PatientConciergeController } from './patient-concierge.controller';
import { PatientConciergeService } from './patient-concierge.service';
import { AddonsModule } from '../addons/addons.module';

@Module({
  imports: [AddonsModule],
  controllers: [PatientConciergeController],
  providers: [PatientConciergeService],
})
export class PatientConciergeModule {}
