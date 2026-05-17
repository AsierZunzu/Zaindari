import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';
import { SchedulesService } from './schedules.service.js';

@Controller('api/plants/:id/schedules')
@UseGuards(JwtAuthGuard, PlantAccessGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  async getMergedSchedules(@Param('id') plantId: string) {
    return this.schedulesService.getMergedSchedules(plantId);
  }

  @Put(':taskType')
  async setPlantSchedule(
    @Param('id') plantId: string,
    @Param('taskType') taskType: TaskType,
    @Body() body: { intervalDays: number; hour: number; minute: number },
  ) {
    return this.schedulesService.setPlantSchedule(plantId, taskType, body);
  }

  @Delete(':taskType')
  async removePlantSchedule(
    @Param('id') plantId: string,
    @Param('taskType') taskType: TaskType,
  ) {
    return this.schedulesService.removePlantSchedule(plantId, taskType);
  }
}
