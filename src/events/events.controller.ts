import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantIsolationGuard } from '../common/guards/tenant-isolation.guard';
import { CurrentUser } from '../common/decorators/tenant.decorator';

@Controller('events')
@UseGuards(JwtAuthGuard, TenantIsolationGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.tenantId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
  ) {
    return this.eventsService.findAll(user.tenantId, userId);
  }
}
