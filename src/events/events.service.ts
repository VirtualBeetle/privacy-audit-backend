import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { AuditEvent } from './audit-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { AUDIT_EVENTS_QUEUE } from '../queue/queue.constants';

/**
 * computeEventHash
 *
 * Produces the SHA-256 hash for a single audit event by hashing a
 * deterministic pipe-delimited string of its immutable fields plus the
 * previous event's hash. If any stored field is altered, this hash will
 * no longer match, and every subsequent hash in the chain also breaks —
 * giving tamper-evidence across the entire log.
 */
function computeEventHash(
  event: Partial<AuditEvent>,
  prevHash: string | null,
): string {
  const input = [
    event.eventId,
    event.tenantId,
    event.tenantUserId,
    event.actionCode,
    JSON.stringify([...(event.dataFields ?? [])].sort()),
    event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : event.occurredAt,
    prevHash ?? '',
  ].join('|');

  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(AuditEvent)
    private eventsRepository: Repository<AuditEvent>,
    @InjectQueue(AUDIT_EVENTS_QUEUE)
    private readonly auditQueue: Queue,
  ) {}

  /**
   * create
   *
   * Performs a fast idempotency check, then enqueues the event for async
   * processing by AuditEventProcessor. Returns 202 Accepted immediately.
   * The processor handles hash-chain computation and DB persistence.
   */
  async create(
    tenantId: string,
    dto: CreateEventDto,
  ): Promise<{ jobId: string | undefined; message: string }> {
    // Fast-fail on obvious duplicates before the job even hits the queue.
    // The processor also checks — this guards against immediate double-submits.
    const existing = await this.eventsRepository.findOne({
      where: { eventId: dto.eventId },
    });
    if (existing) {
      throw new ConflictException(
        'Event with this eventId already exists — duplicate rejected',
      );
    }

    const job = await this.auditQueue.add(
      'process-event',
      { tenantId, dto },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    return { jobId: job.id, message: 'Event accepted and queued for processing' };
  }

  async findAll(
    tenantId: string,
    tenantUserId?: string,
  ): Promise<AuditEvent[]> {
    const query = this.eventsRepository
      .createQueryBuilder('event')
      .where('event.tenant_id = :tenantId', { tenantId })
      .orderBy('event.occurred_at', 'DESC');

    if (tenantUserId) {
      query.andWhere('event.tenant_user_id = :tenantUserId', { tenantUserId });
    }

    return query.getMany();
  }

  /**
   * verifyChain
   *
   * Walks every event for a tenant in insertion order (ASC by created_at) and
   * recomputes the expected hash for each one. Returns early with the first
   * event ID where the stored hash does not match, indicating that record (or
   * its predecessor) was tampered with.
   */
  async verifyChain(
    tenantId: string,
  ): Promise<{ valid: boolean; eventCount: number; brokenAtEventId?: string }> {
    const events = await this.eventsRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });

    let prevHash: string | null = null;

    for (const event of events) {
      const expected = computeEventHash(event, prevHash);

      if (event.hash !== expected) {
        return { valid: false, eventCount: events.length, brokenAtEventId: event.id };
      }

      prevHash = event.hash;
    }

    return { valid: true, eventCount: events.length };
  }
}
