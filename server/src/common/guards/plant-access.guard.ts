import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PlantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id;
    const plantId: string = request.params.id;

    if (!userId || !plantId) {
      return false;
    }

    const plant = await this.prisma.plant.findUnique({
      where: { id: plantId },
      include: { shares: true },
    });

    if (!plant) {
      throw new NotFoundException('Plant not found');
    }

    const isOwner = plant.ownerId === userId;
    const isShared = plant.shares.some((s) => s.userId === userId);

    return isOwner || isShared;
  }
}
