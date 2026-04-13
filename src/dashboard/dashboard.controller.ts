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
import { CreateDashboardTokenDto } from './dto/create-dashboard-token.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DashboardGuard } from '../common/guards/dashboard.guard';
import { CurrentUser } from '../common/decorators/tenant.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportsService: ExportsService,
    private readonly deletionsService: DeletionsService,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /**
   * POST /api/dashboard/token
   *
   * Called by the tenant app backend (API key auth) to get a short-lived
   * handshake token for one of its users. The tenant embeds this token in the
   * "View my privacy" link that the user clicks.
   *
   * Response: { token, expiresIn: '15 minutes', redirectUrl }
   */
  @Post('token')
  @UseGuards(ApiKeyGuard)
  issueToken(@CurrentUser() user: any, @Body() dto: CreateDashboardTokenDto) {
    return this.dashboardService.issueToken(user.tenantId, dto);
  }

  /**
   * POST /api/dashboard/session
   *
   * Called by the dashboard frontend when the user lands on /auth/redirect.
   * Validates the 15-min handshake token and issues an 8-hour session JWT.
   *
   * No auth header needed — the handshake token is the credential.
   *
   * Response: { sessionToken, tenantId, tenantUserId, expiresIn: '8 hours' }
   */
  @Post('session')
  exchangeToken(@Body() dto: ExchangeTokenDto) {
    return this.dashboardService.exchangeToken(dto);
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  /**
   * GET /api/dashboard/events
   *
   * Returns all audit events for the authenticated dashboard user.
   * The session JWT encodes tenantId + tenantUserId — no query params needed.
   * A user can only ever read their own events within their own tenant.
   */
  @Get('events')
  @UseGuards(DashboardGuard)
  getEvents(@CurrentUser() user: any) {
    return this.dashboardService.getEvents(user.tenantId, user.tenantUserId);
  }

  // ─── Exports (GDPR Article 20 — Right to Data Portability) ───────────────

  /**
   * POST /api/dashboard/exports
   *
   * User requests a full export of their audit data (GDPR Article 20).
   * The export is processed asynchronously — this returns 202 immediately.
   *
   * Response: { requestId, status: 'requested', message }
   * Next step: poll GET /api/dashboard/exports/:id
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
   *
   * Poll the status of an export request.
   * When status === 'completed' and downloadAvailable === true, the user can
   * call GET /api/dashboard/exports/:id/download.
   */
  @Get('exports/:id')
  @UseGuards(DashboardGuard)
  getExportStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.exportsService.getStatus(id, user.tenantId, user.tenantUserId);
  }

  /**
   * GET /api/dashboard/exports/:id/download
   *
   * Download the completed export as an attachment (JSON file).
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

    const filename = `privacy-export-${id}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.status(HttpStatus.OK).json(data);
  }

  // ─── Deletions (GDPR Article 17 — Right to Erasure) ──────────────────────

  /**
   * POST /api/dashboard/deletions
   *
   * User requests erasure of all their audit data (GDPR Article 17).
   * Processed asynchronously. After completion, no audit events for this user
   * will exist in the tenant's dataset. A non-personal evidence record is
   * retained for regulatory accountability (GDPR Article 5(2)).
   *
   * Response: { requestId, status: 'requested', message }
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
   *
   * Poll the status of a deletion request.
   * When status === 'completed', eventsDeleted shows how many records were removed.
   */
  @Get('deletions/:id')
  @UseGuards(DashboardGuard)
  getDeletionStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.deletionsService.getStatus(
      id,
      user.tenantId,
      user.tenantUserId,
    );
  }
}
