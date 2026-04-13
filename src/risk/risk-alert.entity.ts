import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * RiskAlert
 *
 * Stores a single AI-generated privacy risk finding for a tenant's recent
 * audit activity. Alerts are produced by the RiskService cron job which
 * passes event statistics to the Claude API and parses structured findings.
 */
@Entity('risk_alerts')
export class RiskAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 16 })
  severity: RiskSeverity;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'suggested_action', type: 'text' })
  suggestedAction: string;

  @Column({ name: 'affected_event_count', default: 0 })
  affectedEventCount: number;

  @Column({ name: 'analysed_at', type: 'timestamptz' })
  analysedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
