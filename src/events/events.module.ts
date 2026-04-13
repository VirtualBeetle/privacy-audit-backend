import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { AuditEvent } from './audit-event.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent]), TenantsModule],
  controllers: [EventsController],
  providers: [EventsService, ApiKeyGuard],
  exports: [EventsService],
})
export class EventsModule {}
