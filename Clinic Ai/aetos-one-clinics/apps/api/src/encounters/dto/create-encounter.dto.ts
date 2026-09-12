import { IsOptional, IsString } from 'class-validator';

export class CreateEncounterDto {
  @IsString() locationId!: string;
  @IsString() patientId!: string;
  @IsString() practitionerId!: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() visitTemplateId?: string;
}
