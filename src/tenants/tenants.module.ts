import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from './tenant.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
