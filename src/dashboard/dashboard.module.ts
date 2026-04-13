import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuditEvent } from '../events/audit-event.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { ExportsModule } from '../exports/exports.module';
import { DeletionsModule } from '../deletions/deletions.module';
import { DashboardUsersModule } from '../dashboard-users/dashboard-users.module';
import { RiskModule } from '../risk/risk.module';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DashboardGuard, DashboardAnyGuard } from '../common/guards/dashboard.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditEvent]),
    TenantsModule,
    ExportsModule,
    DeletionsModule,
    DashboardUsersModule,
    RiskModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, ApiKeyGuard, DashboardGuard, DashboardAnyGuard],
})
export class DashboardModule {}
