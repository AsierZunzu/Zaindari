import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SharePlantDto } from './dto/share-plant.dto.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

@Controller('api/plants/:id/shares')
@UseGuards(JwtAuthGuard, PlantAccessGuard)
export class SharingController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureOwner(plantId: string, userId: string) {
    const plant = await this.prisma.plant.findUnique({
      where: { id: plantId },
    });
    if (!plant || plant.ownerId !== userId) {
      throw new ForbiddenException(
        apiError(
          ERROR_CODES.plantShareOwnerOnly,
          'Only the owner can manage shares',
        ),
      );
    }
  }

  @Get()
  async listShares(
    @Param('id') plantId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureOwner(plantId, user.id);
    return this.prisma.plantShare.findMany({
      where: { plantId },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  @Post()
  async createShare(
    @Param('id') plantId: string,
    @Body() dto: SharePlantDto,
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureOwner(plantId, user.id);
    return this.prisma.plantShare.create({
      data: {
        plantId,
        userId: dto.userId,
        grantedBy: user.id,
      },
    });
  }

  @Delete(':userId')
  async revokeShare(
    @Param('id') plantId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureOwner(plantId, user.id);
    return this.prisma.plantShare.delete({
      where: {
        plantId_userId: {
          plantId,
          userId: targetUserId,
        },
      },
    });
  }
}
