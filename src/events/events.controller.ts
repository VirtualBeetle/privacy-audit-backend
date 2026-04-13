import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantIsolationGuard } from '../common/guards/tenant-isolation.guard';
import { CurrentUser } from '../common/decorators/tenant.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * Ingest an audit event from a tenant application.
   * Auth: API key (x-api-key header) — machine-to-machine.
   * The tenant identifies itself with the key; no user session needed.
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.tenantId, dto);
  }

  /**
   * List events for a tenant — used by the tenant admin dashboard.
   * Auth: JWT (tenant admin must be logged in).
   * Optional ?userId= filter to narrow to a specific end-user.
   */
  @Get()
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  findAll(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
  ) {
    return this.eventsService.findAll(user.tenantId, userId);
  }

  /**
   * Verify the SHA-256 hash chain for a tenant's audit log.
   * Auth: JWT (tenant admin only).
   * Returns { valid: true } or { valid: false, brokenAtEventId: string }.
   */
  @Get('verify-chain')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  verifyChain(@CurrentUser() user: any) {
    return this.eventsService.verifyChain(user.tenantId);
  }
}
