import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { DashboardUser } from './dashboard-user.entity';

/**
 * LinkedAccount
 *
 * Links a DashboardUser (Google identity) to a (tenantId, tenantUserId) pair
 * within the Privacy Audit Service. This enables a single dashboard user to
 * see events from multiple tenant applications after they have logged in with
 * Google and linked each tenant account.
 */
@Entity('linked_accounts')
@Unique('uq_linked_account', ['dashboardUserId', 'tenantId', 'tenantUserId'])
export class LinkedAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dashboard_user_id' })
  dashboardUserId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tenant_user_id' })
  tenantUserId: string;

  @ManyToOne(() => DashboardUser, (u) => u.linkedAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dashboard_user_id' })
  dashboardUser: DashboardUser;

  @CreateDateColumn({ name: 'linked_at' })
  linkedAt: Date;
}
