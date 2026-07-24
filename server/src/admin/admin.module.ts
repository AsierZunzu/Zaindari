import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { SchedulesModule } from '../schedules/schedules.module.js';

@Module({
  imports: [SchedulesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
