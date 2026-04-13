import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../events/audit-event.entity';
import { CreateDashboardTokenDto } from './dto/create-dashboard-token.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';

/**
 * Token type discriminators.
 *
 * We use one JWT_SECRET for all tokens in the system, but we embed a `type`
 * claim in every payload so that each guard can reject tokens that were issued
 * for a different purpose. A session token cannot be used as a dashboard token
 * and vice versa.
 */
const DASHBOARD_TOKEN_TYPE = 'dashboard_token';
const DASHBOARD_SESSION_TYPE = 'dashboard_session';

@Injectable()
export class DashboardService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(AuditEvent)
    private readonly eventsRepository: Repository<AuditEvent>,
  ) {}

  /**
   * issueToken
   *
   * Called by the tenant application (authenticated with an API key) to
   * generate a short-lived handshake token for one of its users.
   *
   * The tenant app embeds this token in the link it shows the user:
   *   https://dashboard.example.com/auth/redirect?token=<token>
   *
   * TTL is intentionally short (15 minutes) — the user is expected to click
   * the link immediately. The token cannot be reused after exchange.
   */
  issueToken(
    tenantId: string,
    dto: CreateDashboardTokenDto,
  ): { token: string; expiresIn: string; redirectUrl: string } {
    const payload = {
      type: DASHBOARD_TOKEN_TYPE,
      tenantId,
      tenantUserId: dto.tenantUserId,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '15m' });

    const baseUrl =
      this.configService.get<string>('DASHBOARD_BASE_URL') ??
      'http://localhost:3000';

    return {
      token,
      expiresIn: '15 minutes',
      redirectUrl: `${baseUrl}/auth/redirect?token=${token}`,
    };
  }

  /**
   * exchangeToken
   *
   * Called by the dashboard frontend when the user lands on /auth/redirect.
   * Validates the short-lived handshake token and issues a longer-lived
   * session JWT that the frontend stores and uses for all subsequent API calls.
   *
   * Why two tokens?
   *   The handshake token lives in a URL — it can appear in browser history,
   *   server logs, and referrer headers. Exchanging it for a session token
   *   immediately limits its exposure window to a single redirect.
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

    const sessionPayload = {
      type: DASHBOARD_SESSION_TYPE,
      tenantId: payload.tenantId,
      tenantUserId: payload.tenantUserId,
    };

    const sessionToken = this.jwtService.sign(sessionPayload, {
      expiresIn: '8h',
    });

    return {
      sessionToken,
      tenantId: payload.tenantId,
      tenantUserId: payload.tenantUserId,
      expiresIn: '8 hours',
    };
  }

  /**
   * getEvents
   *
   * Returns all audit events for the authenticated dashboard user, scoped to
   * their tenant. The session token already carries both tenantId and
   * tenantUserId, so no additional parameters are needed.
   */
  async getEvents(
    tenantId: string,
    tenantUserId: string,
  ): Promise<AuditEvent[]> {
    return this.eventsRepository
      .createQueryBuilder('event')
      .where('event.tenant_id = :tenantId', { tenantId })
      .andWhere('event.tenant_user_id = :tenantUserId', { tenantUserId })
      .orderBy('event.occurred_at', 'DESC')
      .getMany();
  }
}
