import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskService } from './risk.service';
import { RiskAlert } from './risk-alert.entity';
import { AuditEvent } from '../events/audit-event.entity';
import { Tenant } from '../tenants/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RiskAlert, AuditEvent, Tenant])],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
