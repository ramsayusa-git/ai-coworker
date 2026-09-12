import { IsOptional, IsString } from 'class-validator';

export class DraftVisitTemplateDto {
  // Two-line free-text description of the condition, e.g. "acute viral fever
  // in an adult, 3 days of symptoms" — mirrors arogyam.ai's "describe a
  // condition in two lines, AI drafts the template for review" flow.
  @IsString() description!: string;
  @IsOptional() @IsString() language?: string;
}
