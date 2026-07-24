import { Injectable, NotFoundException } from '@nestjs/common';
import type { Plant, PlantImage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Flattens Prisma's plant row into the shape clients actually declare
 * (`PlantWithImage` in client/src/api/plants.ts).
 *
 * Two mismatches to reconcile. The current image arrives as a one-element
 * `images` array because that is the only way to express "the current one" in
 * an `include`, while the client expects a single `currentImage` -- read the
 * row straight through and every `plant.currentImage` is silently undefined.
 * And the fields are an allowlist rather than a spread so that relations and
 * future columns cannot ride along into a response by accident.
 */
export function toPlantWithImage(plant: Plant & { images: PlantImage[] }) {
  return {
    id: plant.id,
    name: plant.name,
    location: plant.location,
    instructions: plant.instructions,
    ownerId: plant.ownerId,
    createdAt: plant.createdAt,
    updatedAt: plant.updatedAt,
    currentImage: plant.images[0] ?? null,
  };
}

@Injectable()
export class PlantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    return this.prisma.plant.findMany({
      where: {
        OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
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
        shares: true,
        images: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    if (!plant) {
      throw new NotFoundException(
        apiError(ERROR_CODES.plantNotFound, 'Plant not found'),
      );
    }

    return plant;
  }

  async create(
    ownerId: string,
    data: { name: string; location?: string; instructions?: string },
  ) {
    return this.prisma.plant.create({
      data: {
        ownerId,
        name: data.name,
        location: data.location,
        instructions: data.instructions,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; location?: string; instructions?: string },
  ) {
    const plant = await this.prisma.plant.findUnique({ where: { id } });
    if (!plant) {
      throw new NotFoundException(
        apiError(ERROR_CODES.plantNotFound, 'Plant not found'),
      );
    }

    return this.prisma.plant.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const plant = await this.prisma.plant.findUnique({ where: { id } });
    if (!plant) {
      throw new NotFoundException(
        apiError(ERROR_CODES.plantNotFound, 'Plant not found'),
      );
    }

    await this.prisma.plant.delete({ where: { id } });

    const uploadsDir = path.join(process.cwd(), 'uploads', id);
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  }
}
