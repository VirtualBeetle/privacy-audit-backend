import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantIsolationGuard } from './common/guards/tenant-isolation.guard';
import { CurrentUser } from './common/decorators/tenant.decorator';

@Controller('test')
export class AppController {
  @Get('protected')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  getProtected(@CurrentUser() user: any) {
    return {
      message: 'Access granted',
      user,
    };
  }

  @Post('cross-tenant')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  crossTenantTest(@CurrentUser() user: any, @Body() body: any) {
    return {
      message: 'Access granted',
      user,
      body,
    };
  }
}
