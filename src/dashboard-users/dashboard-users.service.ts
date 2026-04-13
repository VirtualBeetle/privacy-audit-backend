import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardUser } from './dashboard-user.entity';
import { LinkedAccount } from './linked-account.entity';

@Injectable()
export class DashboardUsersService {
  constructor(
    @InjectRepository(DashboardUser)
    private readonly usersRepo: Repository<DashboardUser>,
    @InjectRepository(LinkedAccount)
    private readonly linkedRepo: Repository<LinkedAccount>,
  ) {}

  /**
   * findOrCreateByGoogle
   *
   * Called on every successful Google OAuth callback. Looks up by googleId
   * first (fastest path), then falls back to email match (handles the case
   * where the same email was linked to a different Google account or registered
   * via a different flow). Creates the user if neither match.
   */
  async findOrCreateByGoogle(
    googleId: string,
    email: string,
    displayName: string,
    avatarUrl: string | null,
  ): Promise<DashboardUser> {
    let user = await this.usersRepo.findOne({ where: { googleId } });

    if (!user) {
      user = await this.usersRepo.findOne({ where: { email } });
    }

    if (!user) {
      user = this.usersRepo.create({ googleId, email, displayName, avatarUrl });
      return this.usersRepo.save(user);
    }

    // Keep Google metadata up-to-date on re-login.
    let changed = false;
    if (!user.googleId) { user.googleId = googleId; changed = true; }
    if (!user.avatarUrl && avatarUrl) { user.avatarUrl = avatarUrl; changed = true; }
    if (changed) return this.usersRepo.save(user);

    return user;
  }

  async findById(id: string): Promise<DashboardUser | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  /**
   * linkAccount
   *
   * Associates a DashboardUser's Google identity with a specific
   * (tenantId, tenantUserId) pair. Idempotent — calling it twice with the
   * same arguments returns the existing record.
   */
  async linkAccount(
    dashboardUserId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<{ linked: boolean; account: LinkedAccount }> {
    const existing = await this.linkedRepo.findOne({
      where: { dashboardUserId, tenantId, tenantUserId },
    });

    if (existing) {
      return { linked: false, account: existing };
    }

    const account = await this.linkedRepo.save(
      this.linkedRepo.create({ dashboardUserId, tenantId, tenantUserId }),
    );

    return { linked: true, account };
  }

  async unlinkAccount(
    dashboardUserId: string,
    tenantId: string,
    tenantUserId: string,
  ): Promise<void> {
    const existing = await this.linkedRepo.findOne({
      where: { dashboardUserId, tenantId, tenantUserId },
    });

    if (!existing) {
      throw new ConflictException('Account link not found');
    }

    await this.linkedRepo.remove(existing);
  }

  async getLinkedAccounts(dashboardUserId: string): Promise<LinkedAccount[]> {
    return this.linkedRepo.find({ where: { dashboardUserId } });
  }
}
