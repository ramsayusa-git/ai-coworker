import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class MedicationLineDto {
  @IsString() medicationName!: string;
  @IsString() dosageText!: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsInt() durationDays?: number;
}

export class CreateVisitTemplateDto {
  @IsString() name!: string;
  @IsString() category!: string;
  @IsOptional() @IsString() icd10Code?: string;
  @IsString() chiefComplaint!: string;
  @IsString() diagnosisDisplay!: string;
  @IsArray() medicationsJson!: MedicationLineDto[];
  @IsOptional() @IsArray() testsJson?: string[];
  @IsOptional() @IsString() advice?: string;
  @IsOptional() @IsInt() followUpDays?: number;
  @IsOptional() @IsString() language?: string;
}
