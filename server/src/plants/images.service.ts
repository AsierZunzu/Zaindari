import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

@Injectable()
export class ImagesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(plantId: string, file: Express.Multer.File) {
    const uploadsDir = path.join(process.cwd(), 'uploads', plantId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${randomUUID()}.webp`;
    const filePath = path.join(uploadsDir, filename);

    await sharp(file.buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp()
      .toFile(filePath);

    await this.prisma.plantImage.updateMany({
      where: { plantId, isCurrent: true },
      data: { isCurrent: false },
    });

    const image = await this.prisma.plantImage.create({
      data: {
        plantId,
        filePath: path.join('uploads', plantId, filename),
        isCurrent: true,
      },
    });

    return image;
  }

  async findAllForPlant(plantId: string) {
    return this.prisma.plantImage.findMany({
      where: { plantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Resolves an image to an on-disk path, but only for a user who may see the
   * plant it belongs to. The route has no `:id` plant param, so PlantAccessGuard
   * cannot cover it -- the same owner-or-shared rule is applied here instead.
   */
  async serve(imageId: string, userId: string) {
    const image = await this.prisma.plantImage.findUnique({
      where: { id: imageId },
      include: { plant: { include: { shares: true } } },
    });

    if (!image) {
      throw new NotFoundException(
        apiError(ERROR_CODES.imageNotFound, 'Image not found'),
      );
    }

    const isOwner = image.plant.ownerId === userId;
    const isShared = image.plant.shares.some((s) => s.userId === userId);

    if (!isOwner && !isShared) {
      throw new ForbiddenException(
        apiError(ERROR_CODES.imageForbidden, 'You do not have access to this image'),
      );
    }

    return path.join(process.cwd(), image.filePath);
  }
}
