import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { DashboardUsersService } from '../../dashboard-users/dashboard-users.service';

/**
 * GoogleStrategy
 *
 * Passport strategy for Google OAuth 2.0. On a successful Google
 * authentication, it finds or creates a DashboardUser record and attaches it
 * to the request so that the auth controller can issue a `google_session` JWT.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly dashboardUsersService: DashboardUsersService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') as string,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const email: string = profile.emails?.[0]?.value ?? '';
    const displayName: string = profile.displayName ?? '';
    const avatarUrl: string | null = profile.photos?.[0]?.value ?? null;

    try {
      const user = await this.dashboardUsersService.findOrCreateByGoogle(
        profile.id,
        email,
        displayName,
        avatarUrl,
      );
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
