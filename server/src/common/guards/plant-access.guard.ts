import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { apiError, ERROR_CODES } from '../errors/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class PlantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    // express types a route param as `string | string[]`; `:id` can only ever
    // bind a single segment, so anything else is not a plant id.
    const rawPlantId = request.params.id;
    const plantId = typeof rawPlantId === 'string' ? rawPlantId : undefined;

    if (!userId || !plantId) {
      return false;
    }

    const plant = await this.prisma.plant.findUnique({
      where: { id: plantId },
      include: { shares: true },
    });

    if (!plant) {
      throw new NotFoundException(
        apiError(ERROR_CODES.plantNotFound, 'Plant not found'),
      );
    }

    const isOwner = plant.ownerId === userId;
    const isShared = plant.shares.some((s) => s.userId === userId);

    return isOwner || isShared;
  }
}
