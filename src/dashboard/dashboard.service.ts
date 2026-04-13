import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../events/audit-event.entity';
import { DashboardUsersService } from '../dashboard-users/dashboard-users.service';
import { CreateDashboardTokenDto } from './dto/create-dashboard-token.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';

const DASHBOARD_TOKEN_TYPE = 'dashboard_token';
const DASHBOARD_SESSION_TYPE = 'dashboard_session';

@Injectable()
export class DashboardService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(AuditEvent)
    private readonly eventsRepository: Repository<AuditEvent>,
    private readonly dashboardUsersService: DashboardUsersService,
  ) {}

  // ─── Auth ─────────────────────────────────────────────────────────────────

  /**
   * issueToken — called by tenant apps (API key auth).
   * Returns a 15-minute handshake JWT the user exchanges for a session.
   */
  issueToken(
    tenantId: string,
    dto: CreateDashboardTokenDto,
  ): { token: string; expiresIn: string; redirectUrl: string } {
    const token = this.jwtService.sign(
      { type: DASHBOARD_TOKEN_TYPE, tenantId, tenantUserId: dto.tenantUserId },
      { expiresIn: '15m' },
    );

    const baseUrl =
      this.configService.get<string>('DASHBOARD_BASE_URL') ?? 'http://localhost:3000';

    return {
      token,
      expiresIn: '15 minutes',
      redirectUrl: `${baseUrl}/auth/redirect?token=${token}`,
    };
  }

  /**
   * exchangeToken — called by the dashboard frontend (/auth/redirect page).
   * Validates the handshake token and issues an 8-hour session JWT.
   */
  exchangeToken(dto: ExchangeTokenDto): {
    sessionToken: string;
    tenantId: string;
    tenantUserId: string;
    expiresIn: string;
  } {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.token);
    } catch {
      throw new UnauthorizedException('Dashboard token is invalid or expired');
    }

    if (payload.type !== DASHBOARD_TOKEN_TYPE) {
      throw new UnauthorizedException('Token type mismatch');
    }

    const sessionToken = this.jwtService.sign(
      { type: DASHBOARD_SESSION_TYPE, tenantId: payload.tenantId, tenantUserId: payload.tenantUserId },
      { expiresIn: '8h' },
    );

    return {
      sessionToken,
      tenantId: payload.tenantId,
      tenantUserId: payload.tenantUserId,
      expiresIn: '8 hours',
    };
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  /**
   * getEvents — returns audit events for the authenticated dashboard user.
   *
   * dashboard_session: events scoped to the user's (tenantId, tenantUserId).
   * google_session: events across all linked tenant accounts.
   */
  async getEvents(user: {
    type: string;
    tenantId?: string;
    tenantUserId?: string;
    dashboardUserId?: string;
  }): Promise<AuditEvent[]> {
    if (user.type === 'dashboard_session') {
      return this.eventsRepository
        .createQueryBuilder('event')
        .where('event.tenant_id = :tenantId', { tenantId: user.tenantId })
        .andWhere('event.tenant_user_id = :tenantUserId', { tenantUserId: user.tenantUserId })
        .orderBy('event.occurred_at', 'DESC')
        .getMany();
    }

    // google_session: aggregate across all linked tenant accounts
    const linked = await this.dashboardUsersService.getLinkedAccounts(
      user.dashboardUserId!,
    );

    if (linked.length === 0) return [];

    const conditions = linked
      .map((_, i) => `(event.tenant_id = :t${i} AND event.tenant_user_id = :u${i})`)
      .join(' OR ');

    const params = Object.fromEntries(
      linked.flatMap((l, i) => [
        [`t${i}`, l.tenantId],
        [`u${i}`, l.tenantUserId],
      ]),
    );

    return this.eventsRepository
      .createQueryBuilder('event')
      .where(conditions, params)
      .orderBy('event.occurred_at', 'DESC')
      .getMany();
  }

  // ─── Account Linking ──────────────────────────────────────────────────────

  /**
   * linkAccount — links a tenant account (from a dashboard_session) to a
   * Google identity (from a google_session). The user calls this while they
   * have both tokens — e.g. after logging in via Google and also visiting from
   * a tenant "View my privacy" link.
   */
  async linkAccount(
    dashboardSessionUser: { tenantId: string; tenantUserId: string },
    googleSessionToken: string,
  ): Promise<{ linked: boolean; message: string }> {
    let googlePayload: any;
    try {
      googlePayload = this.jwtService.verify(googleSessionToken);
    } catch {
      throw new UnauthorizedException('Google session token is invalid or expired');
    }

    if (googlePayload.type !== 'google_session') {
      throw new BadRequestException('Provided token is not a google_session token');
    }

    const result = await this.dashboardUsersService.linkAccount(
      googlePayload.dashboardUserId,
      dashboardSessionUser.tenantId,
      dashboardSessionUser.tenantUserId,
    );

    return {
      linked: result.linked,
      message: result.linked
        ? 'Tenant account linked to your Google identity'
        : 'Account was already linked',
    };
  }
}
