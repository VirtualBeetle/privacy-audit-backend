import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { DeletionRequest, DeletionStatus } from './deletion-request.entity';
import { AuditEvent } from '../events/audit-event.entity';

@Injectable()
export class DeletionsService {
  constructor(
    @InjectRepository(DeletionRequest)
    private readonly deletionsRepository: Repository<DeletionRequest>,
    @InjectRepository(AuditEvent)
    private readonly eventsRepository: Repository<AuditEvent>,
  ) {}

  /**
   * requestDeletion
   *
   * Creates a DeletionRequest and fires the async erasure job.
   *
   * One active deletion per user at a time — if there is already a pending or
   * in-progress request for this user we reject the second one. This prevents
   * race conditions where two deletion jobs run concurrently and one operates
   * on already-deleted rows.
   */
  async requestDeletion(
    tenantId: string,
    tenantUserId: string,
  ): Promise<{ requestId: string; status: DeletionStatus; message: string }> {
    const existing = await this.deletionsRepository.findOne({
      where: [
        { tenantId, tenantUserId, status: DeletionStatus.REQUESTED },
        { tenantId, tenantUserId, status: DeletionStatus.PROCESSING },
      ],
    });

    if (existing) {
      throw new ConflictException(
        'A deletion request for this account is already in progress',
      );
    }

    const deletionReq = this.deletionsRepository.create({
      tenantId,
      tenantUserId,
      status: DeletionStatus.REQUESTED,
    });

    const saved = await this.deletionsRepository.save(deletionReq);

    this.processDeletionAsync(saved.id, tenantId, tenantUserId).catch(
      async () => {
        await this.deletionsRepository.update(saved.id, {
          status: DeletionStatus.FAILED,
          errorMessage: 'Deletion processing failed unexpectedly',
        });
      },
    );

    return {
      requestId: saved.id,
      status: DeletionStatus.REQUESTED,
      message:
        'Deletion request received. Your data will be erased shortly. This action cannot be undone.',
    };
  }

  /**
   * processDeletionAsync
   *
   * GDPR Article 17 compliance:
   *   1. Compute a SHA-256 fingerprint of the events being deleted. This
   *      creates a non-reversible proof that specific records existed, without
   *      retaining the personal data itself.
   *   2. Hard-delete all audit_events for this user in this tenant.
   *   3. Store the evidence in the deletion_requests record for regulatory
   *      accountability (GDPR Article 5(2)).
   *
   * The tenantUserId is NOT stored in evidenceRef — doing so would retain
   * a linkable identifier and partially defeat the purpose of erasure.
   */
  private async processDeletionAsync(
    deletionRequestId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<void> {
    await this.deletionsRepository.update(deletionRequestId, {
      status: DeletionStatus.PROCESSING,
    });

    // Fetch events ordered by created_at so the finalEventHash is deterministic.
    const events = await this.eventsRepository.find({
      where: { tenantId, tenantUserId },
      order: { createdAt: 'ASC' },
      select: ['id', 'hash'],
    });

    const eventsDeleted = events.length;

    // SHA-256 of all event hashes concatenated — a fingerprint of the deleted
    // data that can be used to confirm which events were removed without
    // storing any personal data.
    const evidenceHash =
      events.length > 0
        ? createHash('sha256')
            .update(events.map((e) => e.hash).join(''))
            .digest('hex')
        : 'no_events';

    // Hard-delete all audit events for this user.
    if (events.length > 0) {
      await this.eventsRepository.delete({
        tenantId,
        tenantUserId,
      });
    }

    const evidenceRef = JSON.stringify({
      eventsDeleted,
      evidenceHash,
      tenantId,
      deletedAt: new Date().toISOString(),
      gdprArticle: 'Article 17 — Right to Erasure',
    });

    await this.deletionsRepository.update(deletionRequestId, {
      status: DeletionStatus.COMPLETED,
      evidenceRef,
      completedAt: new Date(),
    });
  }

  /**
   * getStatus
   *
   * Returns the current state of a deletion request.
   * The evidenceRef is only exposed after completion, and only the
   * non-personal parts are returned to the client.
   */
  async getStatus(
    deletionRequestId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<{
    requestId: string;
    status: DeletionStatus;
    eventsDeleted: number | null;
    requestedAt: Date;
    completedAt: Date | null;
  }> {
    const deletionReq = await this.deletionsRepository.findOne({
      where: { id: deletionRequestId },
    });

    if (!deletionReq) {
      throw new NotFoundException('Deletion request not found');
    }

    if (
      deletionReq.tenantId !== tenantId ||
      deletionReq.tenantUserId !== tenantUserId
    ) {
      throw new ForbiddenException('You do not own this deletion request');
    }

    let eventsDeleted: number | null = null;

    if (deletionReq.evidenceRef) {
      try {
        const evidence = JSON.parse(deletionReq.evidenceRef);
        eventsDeleted = evidence.eventsDeleted ?? null;
      } catch {
        // Evidence is malformed — surface what we can.
      }
    }

    return {
      requestId: deletionReq.id,
      status: deletionReq.status,
      eventsDeleted,
      requestedAt: deletionReq.requestedAt,
      completedAt: deletionReq.completedAt,
    };
  }
}
