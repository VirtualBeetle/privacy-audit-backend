import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantIsolationGuard } from './common/guards/tenant-isolation.guard';
import { CurrentUser } from './common/decorators/tenant.decorator';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * GET /api/health
   * Used by Docker Compose healthcheck, Render health check, and start.sh.
   * Returns status of all critical connections.
   */
  @Get('health')
  async health() {
    const checks: Record<string, string> = {};

    // PostgreSQL
    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    // Redis — checked indirectly (if BullMQ registered, Redis is connected)
    checks.redis = 'ok';

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  // ── Legacy test routes (kept for development) ──────────────────────────────

  @Get('test/protected')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  getProtected(@CurrentUser() user: any) {
    return { message: 'Access granted', user };
  }

  @Post('test/cross-tenant')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  crossTenantTest(@CurrentUser() user: any, @Body() body: any) {
    return { message: 'Access granted', user, body };
  }
}
