import { Module } from '@nestjs/common';
import { LeadsController, FollowupsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsCron } from './leads.cron';

@Module({ controllers: [LeadsController, FollowupsController], providers: [LeadsService, LeadsCron] })
export class SalesModule {}
