import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportsService } from './exports.service';
import { ExportRequest } from './export-request.entity';
import { AuditEvent } from '../events/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExportRequest, AuditEvent])],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
