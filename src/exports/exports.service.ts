import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportRequest, ExportStatus } from './export-request.entity';
import { AuditEvent } from '../events/audit-event.entity';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(ExportRequest)
    private readonly exportsRepository: Repository<ExportRequest>,
    @InjectRepository(AuditEvent)
    private readonly eventsRepository: Repository<AuditEvent>,
  ) {}

  /**
   * requestExport
   *
   * Creates an ExportRequest record and immediately fires the async processing
   * job without awaiting it, so the caller gets a 202 response right away.
   *
   * This pattern will be replaced by a Bull queue job in Phase E. The
   * interface (request → poll status → download) stays identical; only the
   * internal scheduling mechanism changes.
   */
  async requestExport(
    tenantId: string,
    tenantUserId: string,
  ): Promise<{ requestId: string; status: ExportStatus; message: string }> {
    const exportReq = this.exportsRepository.create({
      tenantId,
      tenantUserId,
      status: ExportStatus.REQUESTED,
    });

    const saved = await this.exportsRepository.save(exportReq);

    // Fire and forget — processExportAsync runs in the background.
    this.processExportAsync(saved.id, tenantId, tenantUserId).catch(async () => {
      await this.exportsRepository.update(saved.id, {
        status: ExportStatus.FAILED,
        errorMessage: 'Export processing failed unexpectedly',
      });
    });

    return {
      requestId: saved.id,
      status: ExportStatus.REQUESTED,
      message:
        'Export request received. Poll GET /api/dashboard/exports/:id for status updates.',
    };
  }

  /**
   * processExportAsync
   *
   * Background job: collects all audit events for the user, serialises them
   * into a structured export package, and stores it in the export_requests row.
   * Sets downloadExpiresAt to 24 hours from now so stale exports are not
   * served indefinitely.
   */
  private async processExportAsync(
    exportRequestId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<void> {
    await this.exportsRepository.update(exportRequestId, {
      status: ExportStatus.PROCESSING,
    });

    const events = await this.eventsRepository.find({
      where: { tenantId, tenantUserId },
      order: { occurredAt: 'ASC' },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportFormat: 'json',
      schema: 'privacy-audit-service/v1',
      tenantUserId,
      eventCount: events.length,
      events: events.map((e) => ({
        eventId: e.eventId,
        actionCode: e.actionCode,
        actionLabel: e.actionLabel,
        dataFields: e.dataFields,
        reasonCode: e.reasonCode,
        reasonLabel: e.reasonLabel,
        actorType: e.actorType,
        actorLabel: e.actorLabel,
        actorIdentifier: e.actorIdentifier,
        sensitivityCode: e.sensitivityCode,
        thirdPartyInvolved: e.thirdPartyInvolved,
        thirdPartyName: e.thirdPartyName,
        consentObtained: e.consentObtained,
        userOptedOut: e.userOptedOut,
        region: e.region,
        retentionDays: e.retentionDays,
        meta: e.meta,
        occurredAt: e.occurredAt,
      })),
    };

    const downloadExpiresAt = new Date();
    downloadExpiresAt.setHours(downloadExpiresAt.getHours() + 24);

    await this.exportsRepository.update(exportRequestId, {
      status: ExportStatus.COMPLETED,
      exportData: exportData as any,
      eventCount: events.length,
      downloadExpiresAt,
      completedAt: new Date(),
    });
  }

  /**
   * getStatus
   *
   * Returns the current status of an export request.
   * The tenantId + tenantUserId from the session token are used to verify
   * ownership — a user cannot check someone else's export.
   */
  async getStatus(
    exportRequestId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<{
    requestId: string;
    status: ExportStatus;
    eventCount: number | null;
    downloadAvailable: boolean;
    downloadExpiresAt: Date | null;
    requestedAt: Date;
    completedAt: Date | null;
  }> {
    const exportReq = await this.exportsRepository.findOne({
      where: { id: exportRequestId },
    });

    if (!exportReq) {
      throw new NotFoundException('Export request not found');
    }

    if (
      exportReq.tenantId !== tenantId ||
      exportReq.tenantUserId !== tenantUserId
    ) {
      throw new ForbiddenException('You do not own this export request');
    }

    const now = new Date();
    const downloadAvailable =
      exportReq.status === ExportStatus.COMPLETED &&
      exportReq.downloadExpiresAt !== null &&
      exportReq.downloadExpiresAt > now;

    return {
      requestId: exportReq.id,
      status: exportReq.status,
      eventCount: exportReq.eventCount,
      downloadAvailable,
      downloadExpiresAt: exportReq.downloadExpiresAt,
      requestedAt: exportReq.requestedAt,
      completedAt: exportReq.completedAt,
    };
  }

  /**
   * downloadExport
   *
   * Returns the full export data payload.
   * Validates ownership and checks that the download link has not expired.
   * Once served, the data is not deleted — the user can re-download until expiry.
   */
  async downloadExport(
    exportRequestId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<Record<string, any>> {
    const exportReq = await this.exportsRepository.findOne({
      where: { id: exportRequestId },
    });

    if (!exportReq) {
      throw new NotFoundException('Export request not found');
    }

    if (
      exportReq.tenantId !== tenantId ||
      exportReq.tenantUserId !== tenantUserId
    ) {
      throw new ForbiddenException('You do not own this export request');
    }

    if (exportReq.status !== ExportStatus.COMPLETED) {
      throw new NotFoundException(
        `Export is not ready yet — current status: ${exportReq.status}`,
      );
    }

    if (!exportReq.downloadExpiresAt || exportReq.downloadExpiresAt < new Date()) {
      throw new GoneException(
        'Export download link has expired. Please request a new export.',
      );
    }

    return exportReq.exportData as Record<string, any>;
  }
}
