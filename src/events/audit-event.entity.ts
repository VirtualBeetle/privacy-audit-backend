import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_user_id' })
  tenantUserId: string;

  @Column({ name: 'event_id', unique: true })
  eventId: string;

  @Column({ name: 'action_code' })
  actionCode: string;

  @Column({ name: 'action_label' })
  actionLabel: string;

  @Column({ name: 'data_fields', type: 'jsonb' })
  dataFields: string[];

  @Column({ name: 'reason_code' })
  reasonCode: string;

  @Column({ name: 'reason_label' })
  reasonLabel: string;

  @Column({ name: 'actor_type' })
  actorType: string;

  @Column({ name: 'actor_label' })
  actorLabel: string;

  @Column({ name: 'actor_identifier', nullable: true })
  actorIdentifier: string;

  @Column({ name: 'sensitivity_code' })
  sensitivityCode: string;

  @Column({ name: 'third_party_involved', default: false })
  thirdPartyInvolved: boolean;

  @Column({ name: 'third_party_name', nullable: true })
  thirdPartyName: string;

  @Column({ name: 'retention_days', default: 90 })
  retentionDays: number;

  @Column({ nullable: true })
  region: string;

  @Column({ name: 'consent_obtained', default: false })
  consentObtained: boolean;

  @Column({ name: 'user_opted_out', default: false })
  userOptedOut: boolean;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any>;

  @Column({ name: 'occurred_at' })
  occurredAt: Date;

  /**
   * Hash chain columns.
   *
   * prevHash: the `hash` value of the immediately preceding event for this
   *   tenant (null for the first event in the chain).
   *
   * hash: SHA-256 of the deterministic string formed from this event's
   *   own fields concatenated with prevHash. Any modification to a stored
   *   event breaks all subsequent hashes, making the log tamper-evident.
   */
  @Column({ name: 'prev_hash', nullable: true })
  prevHash: string | null;

  @Column({ name: 'hash' })
  hash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
