import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionsService } from './deletions.service';
import { DeletionRequest } from './deletion-request.entity';
import { AuditEvent } from '../events/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeletionRequest, AuditEvent])],
  providers: [DeletionsService],
  exports: [DeletionsService],
})
export class DeletionsModule {}
