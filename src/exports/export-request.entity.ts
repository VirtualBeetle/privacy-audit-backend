import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

export enum ExportStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('export_requests')
export class ExportRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_user_id' })
  tenantUserId: string;

  @Column({
    type: 'enum',
    enum: ExportStatus,
    default: ExportStatus.REQUESTED,
  })
  status: ExportStatus;

  /**
   * The serialised export payload, stored as JSONB.
   *
   * Keeping the export data in the database rather than an external file store
   * keeps the system self-contained for the dissertation. In production this
   * would be uploaded to object storage (e.g. S3) and the download URL would
   * point there. The download endpoint on this service reads from this column
   * and streams it to the client.
   */
  @Column({ name: 'export_data', type: 'jsonb', nullable: true })
  exportData: Record<string, any> | null;

  @Column({ name: 'event_count', nullable: true })
  eventCount: number | null;

  /**
   * The download link expires 24 hours after the export completes.
   * The download endpoint checks this before serving the file.
   */
  @Column({ name: 'download_expires_at', type: 'timestamptz', nullable: true })
  downloadExpiresAt: Date | null;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
