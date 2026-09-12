import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { EncountersModule } from './encounters/encounters.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { BillingModule } from './billing/billing.module';
import { AddonsModule } from './addons/addons.module';
import { AuthModule } from './auth/auth.module';
import { BrandingModule } from './branding/branding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenancyModule,
    AuthModule,
    BrandingModule,
    PatientsModule,
    AppointmentsModule,
    EncountersModule,
    PrescriptionsModule,
    BillingModule,
    AddonsModule,
  ],
})
export class AppModule {}
