import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardUsersService } from './dashboard-users.service';
import { DashboardUser } from './dashboard-user.entity';
import { LinkedAccount } from './linked-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DashboardUser, LinkedAccount])],
  providers: [DashboardUsersService],
  exports: [DashboardUsersService],
})
export class DashboardUsersModule {}
