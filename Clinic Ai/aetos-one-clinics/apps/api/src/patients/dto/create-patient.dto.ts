import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreatePatientDto {
  @IsString() locationId!: string;
  @IsString() givenName!: string;
  @IsOptional() @IsString() familyName?: string;
  @IsIn(['male', 'female', 'other', 'unknown']) gender!: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() abhaNumber?: string;
  @IsOptional() @IsString() abhaAddress?: string;
  @IsOptional() @IsIn(['hi', 'en', 'te', 'ta', 'kn']) preferredLanguage?: string;
}
