import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class InvoiceLineItemDto {
  @IsString() description!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() code?: string;
}

export class CreateInvoiceDto {
  @IsString() locationId!: string;
  @IsString() patientId!: string;
  @IsOptional() @IsString() encounterId?: string;
  @IsArray() lineItems!: InvoiceLineItemDto[];
}
