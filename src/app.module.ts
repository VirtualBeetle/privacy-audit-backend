import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportsModule } from './exports/exports.module';
import { DeletionsModule } from './deletions/deletions.module';
import { DashboardUsersModule } from './dashboard-users/dashboard-users.module';
import { RetentionModule } from './retention/retention.module';
import { RiskModule } from './risk/risk.module';

// Entities
import { Tenant } from './tenants/tenant.entity';
import { User } from './users/user.entity';
import { AuditEvent } from './events/audit-event.entity';
import { ExportRequest } from './exports/export-request.entity';
import { DeletionRequest } from './deletions/deletion-request.entity';
import { DashboardUser } from './dashboard-users/dashboard-user.entity';
import { LinkedAccount } from './dashboard-users/linked-account.entity';
import { RiskAlert } from './risk/risk-alert.entity';

// Middleware
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AppController } from './app.controller';

@Module({
  imports: [
    // ── Config ─────────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Database ───────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [
          Tenant,
          User,
          AuditEvent,
          ExportRequest,
          DeletionRequest,
          DashboardUser,
          LinkedAccount,
          RiskAlert,
        ],
        synchronize: true,
      }),
    }),

    // ── Queue (BullMQ / Redis) ──────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') ?? 'localhost',
          port: configService.get<number>('REDIS_PORT') ?? 6379,
        },
      }),
    }),

    // ── Cron scheduling ────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Rate limiting (global) ─────────────────────────────────────────────
    // short:  10 req / 1 s   — guards against burst attacks on any endpoint
    // medium: 200 req / 1 min — overall throughput cap per IP
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 200 },
    ]),

    // ── Feature modules ────────────────────────────────────────────────────
    AuthModule,
    TenantsModule,
    UsersModule,
    EventsModule,
    DashboardModule,
    ExportsModule,
    DeletionsModule,
    DashboardUsersModule,
    RetentionModule,
    RiskModule,
  ],
  controllers: [AppController],
  providers: [
    // Apply ThrottlerGuard globally — all routes are rate-limited by default.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
