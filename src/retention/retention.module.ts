import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetentionService } from './retention.service';
import { AuditEvent } from '../events/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  providers: [RetentionService],
})
export class RetentionModule {}
