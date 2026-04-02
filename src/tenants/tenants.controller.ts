import { Controller, Post, Body } from '@nestjs/common';
import { TenantsService, RegisterTenantDto } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('register')
  register(@Body() dto: RegisterTenantDto) {
    return this.tenantsService.register(dto);
  }
}
