import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Tenant-admin login ────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  /**
   * GET /api/auth/google
   *
   * Redirects the browser to Google's OAuth consent page. Passport adds the
   * required `client_id`, `redirect_uri`, `scope`, and `state` parameters
   * automatically — this handler never executes.
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Passport redirects — this body never runs.
  }

  /**
   * GET /api/auth/google/callback
   *
   * Google redirects here after the user grants consent. Passport verifies the
   * code, calls GoogleStrategy.validate(), and attaches the DashboardUser to
   * req.user. We then issue an 8-hour `google_session` JWT and redirect the
   * frontend to /auth/google/callback?token=<jwt>.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: Request & { user: any }, @Res() res: Response) {
    const user = req.user;

    const token = this.jwtService.sign(
      {
        type: 'google_session',
        dashboardUserId: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      { expiresIn: '8h' },
    );

    const frontendUrl =
      this.configService.get<string>('DASHBOARD_BASE_URL') ?? 'http://localhost:3000';

    return res.redirect(`${frontendUrl}/auth/google/callback?token=${encodeURIComponent(token)}`);
  }
}
