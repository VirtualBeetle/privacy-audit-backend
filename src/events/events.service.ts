import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AuditEvent } from './audit-event.entity';
import { CreateEventDto } from './dto/create-event.dto';

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
  ) {}

  async create(tenantId: string, dto: CreateEventDto): Promise<AuditEvent> {
    const existing = await this.eventsRepository.findOne({
      where: { eventId: dto.eventId },
    });

    if (existing) {
      throw new ConflictException(
        'Event with this eventId already exists — duplicate rejected',
      );
    }

    // Fetch the latest event for this tenant to continue the hash chain.
    const lastEvent = await this.eventsRepository.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    const prevHash = lastEvent?.hash ?? null;

    const event = new AuditEvent();
    event.tenantId = tenantId;
    event.tenantUserId = dto.tenantUserId;
    event.eventId = dto.eventId;
    event.actionCode = dto.action.code;
    event.actionLabel = dto.action.label;
    event.dataFields = dto.dataFields;
    event.reasonCode = dto.reason.code;
    event.reasonLabel = dto.reason.label;
    event.actorType = dto.actor.type;
    event.actorLabel = dto.actor.label;
    event.actorIdentifier = dto.actor.identifier ?? null;
    event.sensitivityCode = dto.sensitivity.code;
    event.thirdPartyInvolved = dto.thirdPartyInvolved ?? false;
    event.thirdPartyName = dto.thirdPartyName ?? null;
    event.retentionDays = dto.retentionDays ?? 90;
    event.region = dto.region ?? null;
    event.consentObtained = dto.consentObtained ?? false;
    event.userOptedOut = dto.userOptedOut ?? false;
    event.meta = dto.meta ?? null;
    event.occurredAt = new Date(dto.occurredAt);
    event.prevHash = prevHash;
    event.hash = computeEventHash(event, prevHash);

    return this.eventsRepository.save(event);
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
