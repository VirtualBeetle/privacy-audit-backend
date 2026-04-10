import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit-event.entity';
import { CreateEventDto } from './dto/create-event.dto';

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
      throw new ConflictException('Event with this eventId already exists — duplicate rejected');
    }

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

    return this.eventsRepository.save(event);
  }

  async findAll(tenantId: string, tenantUserId?: string): Promise<AuditEvent[]> {
    const query = this.eventsRepository.createQueryBuilder('event')
      .where('event.tenant_id = :tenantId', { tenantId })
      .orderBy('event.occurred_at', 'DESC');

    if (tenantUserId) {
      query.andWhere('event.tenant_user_id = :tenantUserId', { tenantUserId });
    }

    return query.getMany();
  }
}
