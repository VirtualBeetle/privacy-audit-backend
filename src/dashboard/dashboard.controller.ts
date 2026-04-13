import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DashboardService } from './dashboard.service';
import { ExportsService } from '../exports/exports.service';
import { DeletionsService } from '../deletions/deletions.service';
import { RiskService } from '../risk/risk.service';
import { DashboardUsersService } from '../dashboard-users/dashboard-users.service';
import { CreateDashboardTokenDto } from './dto/create-dashboard-token.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DashboardGuard, DashboardAnyGuard } from '../common/guards/dashboard.guard';
import { CurrentUser } from '../common/decorators/tenant.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportsService: ExportsService,
    private readonly deletionsService: DeletionsService,
    private readonly riskService: RiskService,
    private readonly dashboardUsersService: DashboardUsersService,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /**
   * POST /api/dashboard/token
   * Tenant app requests a 15-min handshake token for one of its users.
   */
  @Post('token')
  @UseGuards(ApiKeyGuard)
  issueToken(@CurrentUser() user: any, @Body() dto: CreateDashboardTokenDto) {
    return this.dashboardService.issueToken(user.tenantId, dto);
  }

  /**
   * POST /api/dashboard/session
   * Exchange a 15-min handshake token for an 8-hour session JWT.
   */
  @Post('session')
  exchangeToken(@Body() dto: ExchangeTokenDto) {
    return this.dashboardService.exchangeToken(dto);
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  /**
   * GET /api/dashboard/events
   * Returns audit events for the authenticated user.
   * Accepts both dashboard_session and google_session tokens.
   */
  @Get('events')
  @UseGuards(DashboardAnyGuard)
  getEvents(@CurrentUser() user: any) {
    return this.dashboardService.getEvents(user);
  }

  // ─── Account Linking ───────────────────────────────────────────────────────

  /**
   * POST /api/dashboard/link-account
   *
   * Links the calling user's tenant account (from their dashboard_session)
   * to their Google identity (provided as googleSessionToken in the body).
   * After linking, their `google_session` will aggregate events from this tenant.
   *
   * Body: { googleSessionToken: string }
   */
  @Post('link-account')
  @UseGuards(DashboardGuard)
  linkAccount(
    @CurrentUser() user: any,
    @Body() body: { googleSessionToken: string },
  ) {
    return this.dashboardService.linkAccount(user, body.googleSessionToken);
  }

  /**
   * GET /api/dashboard/linked-accounts
   * Returns all tenant accounts linked to the Google identity.
   * Requires google_session.
   */
  @Get('linked-accounts')
  @UseGuards(DashboardAnyGuard)
  async getLinkedAccounts(@CurrentUser() user: any) {
    if (user.type !== 'google_session') {
      return { linkedAccounts: [] };
    }
    const accounts = await this.dashboardUsersService.getLinkedAccounts(
      user.dashboardUserId,
    );
    return { linkedAccounts: accounts };
  }

  // ─── Exports (GDPR Article 20) ─────────────────────────────────────────────

  /**
   * POST /api/dashboard/exports
   * Request a full data export. Processed async — returns 202 immediately.
   */
  @Post('exports')
  @UseGuards(DashboardGuard)
  requestExport(@CurrentUser() user: any, @Res() res: Response) {
    return this.exportsService
      .requestExport(user.tenantId, user.tenantUserId)
      .then((result) => res.status(HttpStatus.ACCEPTED).json(result));
  }

  /**
   * GET /api/dashboard/exports/:id
   * Poll the status of an export request.
   */
  @Get('exports/:id')
  @UseGuards(DashboardGuard)
  getExportStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.exportsService.getStatus(id, user.tenantId, user.tenantUserId);
  }

  /**
   * GET /api/dashboard/exports/:id/download
   * Download the completed export as a JSON attachment.
   * Returns 410 Gone if the 24-hour download window has expired.
   */
  @Get('exports/:id/download')
  @UseGuards(DashboardGuard)
  async downloadExport(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const data = await this.exportsService.downloadExport(
      id,
      user.tenantId,
      user.tenantUserId,
    );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="privacy-export-${id}.json"`,
    );
    return res.status(HttpStatus.OK).json(data);
  }

  // ─── Deletions (GDPR Article 17) ──────────────────────────────────────────

  /**
   * POST /api/dashboard/deletions
   * Request erasure of all user audit data. Processed async.
   */
  @Post('deletions')
  @UseGuards(DashboardGuard)
  requestDeletion(@CurrentUser() user: any, @Res() res: Response) {
    return this.deletionsService
      .requestDeletion(user.tenantId, user.tenantUserId)
      .then((result) => res.status(HttpStatus.ACCEPTED).json(result));
  }

  /**
   * GET /api/dashboard/deletions/:id
   * Poll the status of a deletion request.
   */
  @Get('deletions/:id')
  @UseGuards(DashboardGuard)
  getDeletionStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.deletionsService.getStatus(id, user.tenantId, user.tenantUserId);
  }

  // ─── AI Risk Alerts ────────────────────────────────────────────────────────

  /**
   * GET /api/dashboard/risk-alerts
   *
   * Returns the most recent AI-generated privacy risk alerts for the user's
   * tenant(s). Accepts both dashboard_session and google_session.
   */
  @Get('risk-alerts')
  @UseGuards(DashboardAnyGuard)
  async getRiskAlerts(@CurrentUser() user: any) {
    let linkedTenantIds: string[] = [];

    if (user.type === 'google_session') {
      const linked = await this.dashboardUsersService.getLinkedAccounts(
        user.dashboardUserId,
      );
      linkedTenantIds = linked.map((l) => l.tenantId);
    }

    return this.riskService.getAlertsForUser(user, linkedTenantIds);
  }
}
