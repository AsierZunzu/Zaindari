import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

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

  async serve(imageId: string) {
    const image = await this.prisma.plantImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return path.join(process.cwd(), image.filePath);
  }
}
