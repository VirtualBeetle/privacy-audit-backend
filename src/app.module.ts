import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportsModule } from './exports/exports.module';
import { DeletionsModule } from './deletions/deletions.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { Tenant } from './tenants/tenant.entity';
import { User } from './users/user.entity';
import { AuditEvent } from './events/audit-event.entity';
import { ExportRequest } from './exports/export-request.entity';
import { DeletionRequest } from './deletions/deletion-request.entity';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
        entities: [Tenant, User, AuditEvent, ExportRequest, DeletionRequest],
        synchronize: true,
      }),
    }),
    AuthModule,
    TenantsModule,
    UsersModule,
    EventsModule,
    DashboardModule,
    ExportsModule,
    DeletionsModule,
  ],
  controllers: [AppController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
