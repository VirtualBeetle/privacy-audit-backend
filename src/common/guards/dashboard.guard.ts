import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * DashboardGuard (strict — dashboard_session only)
 *
 * Validates Bearer JWTs on dashboard endpoints that require a per-tenant
 * context (exports, deletions). Accepts only `dashboard_session` tokens
 * issued by POST /api/dashboard/session.
 *
 * Use DashboardAnyGuard on endpoints that also accept `google_session`.
 */
@Injectable()
export class DashboardGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const payload = this.extractAndVerify(request);

    if (payload.type !== 'dashboard_session') {
      throw new UnauthorizedException(
        'This endpoint requires a dashboard_session token',
      );
    }

    request.user = {
      tenantId: payload.tenantId,
      tenantUserId: payload.tenantUserId,
      type: 'dashboard_session',
    };

    return true;
  }

  protected extractAndVerify(request: any): any {
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
    }

    const token = authHeader.slice(7);

    try {
      return this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Dashboard session token is invalid or expired',
      );
    }
  }
}

/**
 * DashboardAnyGuard
 *
 * Accepts both `dashboard_session` and `google_session` tokens.
 * Use on endpoints where either auth mode is valid (events, risk-alerts).
 *
 * request.user shape:
 *   dashboard_session → { tenantId, tenantUserId, type }
 *   google_session    → { dashboardUserId, email, displayName, type }
 */
@Injectable()
export class DashboardAnyGuard extends DashboardGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const payload = this.extractAndVerify(request);

    if (payload.type === 'dashboard_session') {
      request.user = {
        tenantId: payload.tenantId,
        tenantUserId: payload.tenantUserId,
        type: 'dashboard_session',
      };
    } else if (payload.type === 'google_session') {
      request.user = {
        dashboardUserId: payload.dashboardUserId,
        email: payload.email,
        displayName: payload.displayName,
        avatarUrl: payload.avatarUrl,
        type: 'google_session',
      };
    } else {
      throw new UnauthorizedException(
        'This endpoint requires a dashboard or google session token',
      );
    }

    return true;
  }
}
