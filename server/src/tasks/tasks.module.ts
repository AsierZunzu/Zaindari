import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulesModule } from '../schedules/schedules.module.js';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { SchedulerService } from './scheduler.service.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';

@Module({
  imports: [ScheduleModule, SchedulesModule],
  controllers: [TasksController],
  providers: [TasksService, SchedulerService, PlantAccessGuard],
  exports: [TasksService],
})
export class TasksModule {}
