import { Global, Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { IssuesModule } from '../issues/issues.module';
@Global()
@Module({ imports: [forwardRef(() => IssuesModule)], providers: [NotificationsService], controllers: [NotificationsController], exports: [NotificationsService] })
export class NotificationsModule {}
