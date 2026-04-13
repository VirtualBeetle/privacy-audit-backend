import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../events/audit-event.entity';

/**
 * RetentionService
 *
 * Runs a nightly cron job (02:00 UTC) that hard-deletes audit events whose
 * retention window has expired. Each event stores a `retentionDays` value set
 * by the tenant at ingest time. When `created_at + retention_days` < now, the
 * record is outside its allowed retention period and must be purged to comply
 * with GDPR Article 5(1)(e) (storage limitation).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly eventsRepository: Repository<AuditEvent>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeExpiredEvents(): Promise<void> {
    this.logger.log('Retention purge started');

    const result = await this.eventsRepository
      .createQueryBuilder()
      .delete()
      .from(AuditEvent)
      .where(`created_at + (retention_days * INTERVAL '1 day') < NOW()`)
      .execute();

    this.logger.log(
      `Retention purge complete: removed ${result.affected ?? 0} expired events`,
    );
  }
}
