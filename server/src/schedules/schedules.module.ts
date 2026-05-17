import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service.js';
import { SchedulesController } from './schedules.controller.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, PlantAccessGuard],
  exports: [SchedulesService],
})
export class SchedulesModule {}
