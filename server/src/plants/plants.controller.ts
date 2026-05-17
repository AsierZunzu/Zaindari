import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PlantsService } from './plants.service.js';
import { ImagesService } from './images.service.js';
import { CreatePlantDto } from './dto/create-plant.dto.js';
import { UpdatePlantDto } from './dto/update-plant.dto.js';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class PlantsController {
  constructor(
    private readonly plantsService: PlantsService,
    private readonly imagesService: ImagesService,
  ) {}

  @Get('plants')
  async findAll(@CurrentUser() user: { id: string }) {
    return this.plantsService.findAllForUser(user.id);
  }

  @Post('plants')
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePlantDto,
  ) {
    return this.plantsService.create(user.id, dto);
  }

  @Get('plants/:id')
  @UseGuards(PlantAccessGuard)
  async findOne(@Param('id') id: string) {
    return this.plantsService.findById(id);
  }

  @Patch('plants/:id')
  @UseGuards(PlantAccessGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlantDto,
    @CurrentUser() user: { id: string },
  ) {
    const plant = await this.plantsService.findById(id);
    if (plant.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can update this plant');
    }
    return this.plantsService.update(id, dto);
  }

  @Delete('plants/:id')
  @UseGuards(PlantAccessGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    const plant = await this.plantsService.findById(id);
    if (plant.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can delete this plant');
    }
    return this.plantsService.delete(id);
  }

  @Post('plants/:id/images')
  @UseGuards(PlantAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imagesService.upload(id, file);
  }

  @Get('plants/:id/images')
  @UseGuards(PlantAccessGuard)
  async listImages(@Param('id') id: string) {
    return this.imagesService.findAllForPlant(id);
  }

  @Get('images/:imageId')
  async serveImage(
    @Param('imageId') imageId: string,
    @Res() res: Response,
  ) {
    const filePath = await this.imagesService.serve(imageId);
    res.sendFile(filePath);
  }
}
