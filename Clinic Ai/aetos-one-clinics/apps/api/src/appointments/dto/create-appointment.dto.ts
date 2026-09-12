import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsString() locationId!: string;
  @IsString() patientId!: string;
  @IsString() practitionerId!: string;
  @IsISO8601() start!: string;
  @IsOptional() @IsISO8601() end?: string;
}
