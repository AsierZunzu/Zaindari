import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PlantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    return this.prisma.plant.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { shares: { some: { userId } } },
        ],
      },
      include: {
        images: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });
  }

  async findById(id: string) {
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: {
        owner: true,
        shares: true,
        images: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    if (!plant) {
      throw new NotFoundException('Plant not found');
    }

    return plant;
  }

  async create(ownerId: string, data: { name: string; location?: string; instructions?: string }) {
    return this.prisma.plant.create({
      data: {
        ownerId,
        name: data.name,
        location: data.location,
        instructions: data.instructions,
      },
    });
  }

  async update(id: string, data: { name?: string; location?: string; instructions?: string }) {
    const plant = await this.prisma.plant.findUnique({ where: { id } });
    if (!plant) {
      throw new NotFoundException('Plant not found');
    }

    return this.prisma.plant.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const plant = await this.prisma.plant.findUnique({ where: { id } });
    if (!plant) {
      throw new NotFoundException('Plant not found');
    }

    await this.prisma.plant.delete({ where: { id } });

    const uploadsDir = path.join(process.cwd(), 'uploads', id);
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  }
}
