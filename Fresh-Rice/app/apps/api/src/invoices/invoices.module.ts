import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceTemplatesController, InvoiceTemplatesService } from './templates';
@Module({ controllers: [InvoicesController, InvoiceTemplatesController], providers: [InvoicesService, InvoiceTemplatesService], exports: [InvoicesService, InvoiceTemplatesService] })
export class InvoicesModule {}
