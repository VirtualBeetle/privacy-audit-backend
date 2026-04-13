import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

const DASHBOARD_SESSION_TYPE = 'dashboard_session';

/**
 * DashboardGuard
 *
 * Validates the session JWT issued by POST /api/dashboard/session and enforces
 * that the token's `type` claim is exactly 'dashboard_session'. This prevents
 * tenant admin JWTs or handshake tokens from being used to access dashboard
 * user endpoints, even though all tokens share the same signing secret.
 *
 * On success, attaches the session payload to request.user so downstream
 * handlers can read tenantId and tenantUserId via @CurrentUser().
 */
@Injectable()
export class DashboardGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);

    let payload: any;

    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Dashboard session token is invalid or expired');
    }

    if (payload.type !== DASHBOARD_SESSION_TYPE) {
      throw new UnauthorizedException(
        'This endpoint requires a dashboard session token',
      );
    }

    request.user = {
      tenantId: payload.tenantId,
      tenantUserId: payload.tenantUserId,
      type: DASHBOARD_SESSION_TYPE,
    };

    return true;
  }
}
