import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { DataTransferController } from './data-transfer.controller.js';
import { ExportService } from './export.service.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [DataTransferController],
  providers: [ExportService, ImportService],
})
export class DataTransferModule {}
