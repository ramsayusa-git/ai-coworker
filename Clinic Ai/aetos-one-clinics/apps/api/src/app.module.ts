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
import { VisitTemplatesModule } from './visit-templates/visit-templates.module';
import { CommandCenterModule } from './command-center/command-center.module';
import { PatientConciergeModule } from './patient-concierge/patient-concierge.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OrganizationsModule } from './organizations/organizations.module';

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
    VisitTemplatesModule,
    CommandCenterModule,
    PatientConciergeModule,
    AnalyticsModule,
    OrganizationsModule,
  ],
})
export class AppModule {}
