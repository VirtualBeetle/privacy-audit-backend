import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { LinkedAccount } from './linked-account.entity';

/**
 * DashboardUser
 *
 * Represents a person who has authenticated on the Privacy Dashboard via
 * Google OAuth. A DashboardUser may link one or more tenant accounts
 * (via LinkedAccount) so that their events from multiple services are
 * aggregated into a single view.
 */
@Entity('dashboard_users')
export class DashboardUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'display_name', nullable: true, type: 'text' })
  displayName: string | null;

  @Column({ name: 'avatar_url', nullable: true, type: 'text' })
  avatarUrl: string | null;

  @Column({ name: 'google_id', unique: true, nullable: true })
  googleId: string | null;

  @OneToMany(() => LinkedAccount, (la) => la.dashboardUser, { cascade: true })
  linkedAccounts: LinkedAccount[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
