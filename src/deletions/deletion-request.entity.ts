import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

export enum DeletionStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('deletion_requests')
export class DeletionRequest {
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
    enum: DeletionStatus,
    default: DeletionStatus.REQUESTED,
  })
  status: DeletionStatus;

  /**
   * Evidence of erasure — stored for regulatory proof.
   *
   * GDPR Article 17 requires the right to erasure but Article 5(2) requires
   * the controller to be able to demonstrate compliance (accountability).
   * We delete the actual personal data but retain a non-personal evidence
   * record so the tenant can demonstrate to a Data Protection Authority that
   * the deletion was carried out.
   *
   * Format: JSON string containing:
   *   - eventsDeleted: number of audit events removed
   *   - finalEventHash: hash of the last event in the chain before deletion
   *   - deletedAt: ISO timestamp of when deletion was processed
   *   - tenantId: which tenant's data was erased
   *
   * The tenantUserId itself is NOT stored here — keeping it would defeat the
   * purpose of erasure.
   */
  @Column({ name: 'evidence_ref', type: 'text', nullable: true })
  evidenceRef: string | null;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
