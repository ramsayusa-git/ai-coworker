import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsService } from './leads.service';

@Injectable()
export class LeadsCron {
  private log = new Logger('LeadsCron');
  constructor(private svc: LeadsService) {}

  // Every weekday morning: WhatsApp each sales rep their due/overdue follow-ups.
  @Cron('0 9 * * 1-6', { timeZone: 'Asia/Kolkata' })
  async remind() {
    const r = await this.svc.remindDueFollowups();
    this.log.log(`Follow-up reminders: ${JSON.stringify(r)}`);
  }
}
