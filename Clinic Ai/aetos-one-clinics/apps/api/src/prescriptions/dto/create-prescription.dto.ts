import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePrescriptionDto {
  @IsString() encounterId!: string;
  @IsString() patientId!: string;
  @IsString() medicationCode!: string;
  @IsString() medicationName!: string;
  @IsOptional() @IsString() salt?: string;
  @IsString() dosageText!: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsInt() durationDays?: number;
}
