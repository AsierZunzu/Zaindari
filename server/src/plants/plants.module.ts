import { Module } from '@nestjs/common';
import { PlantsService } from './plants.service.js';
import { ImagesService } from './images.service.js';
import { PlantsController } from './plants.controller.js';
import { SharingController } from './sharing.controller.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';

@Module({
  controllers: [PlantsController, SharingController],
  providers: [PlantsService, ImagesService, PlantAccessGuard],
  exports: [PlantsService, ImagesService],
})
export class PlantsModule {}
