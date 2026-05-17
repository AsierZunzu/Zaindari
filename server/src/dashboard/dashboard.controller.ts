import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('api/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getDashboard(@CurrentUser() user: { id: string }) {
    const plants = await this.prisma.plant.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { shares: { some: { userId: user.id } } },
        ],
      },
      include: {
        images: {
          where: { isCurrent: true },
          take: 1,
        },
        tasks: {
          where: {
            status: { in: ['pending', 'snoozed'] },
          },
          orderBy: { dueAt: 'asc' },
        },
      },
    });

    const now = new Date();

    const result = plants.map((plant) => {
      const currentImage = plant.images[0] ?? null;
      const pendingTasks = plant.tasks.filter((t) => t.status === 'pending');
      const upcomingTasks = plant.tasks.filter(
        (t) => t.dueAt > now && t.status === 'pending',
      );

      return {
        plant: {
          id: plant.id,
          name: plant.name,
          location: plant.location,
          instructions: plant.instructions,
          ownerId: plant.ownerId,
        },
        currentImage,
        pendingTasks,
        upcomingTasks,
      };
    });

    // Sort by most urgent pending task first
    result.sort((a, b) => {
      const aEarliest = a.pendingTasks[0]?.dueAt?.getTime() ?? Infinity;
      const bEarliest = b.pendingTasks[0]?.dueAt?.getTime() ?? Infinity;
      return aEarliest - bEarliest;
    });

    return result;
  }
}
