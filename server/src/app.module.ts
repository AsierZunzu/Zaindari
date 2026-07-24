import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './common/config/configuration.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PlantsModule } from './plants/plants.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PushModule } from './push/push.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DataTransferModule } from './data-transfer/data-transfer.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlantsModule,
    SchedulesModule,
    TasksModule,
    DashboardModule,
    PushModule,
    AdminModule,
    DataTransferModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
