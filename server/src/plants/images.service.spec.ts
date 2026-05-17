import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ImagesService } from './images.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const mockToFile = vi.fn().mockResolvedValue(undefined);
const mockWebp = vi.fn().mockReturnValue({ toFile: mockToFile });
const mockResize = vi.fn().mockReturnValue({ webp: mockWebp });

vi.mock('sharp', () => {
  const sharpFn = vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnValue({
      webp: vi.fn().mockReturnValue({
        toFile: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  });
  return { default: sharpFn };
});

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid'),
}));

describe('ImagesService', () => {
  let service: ImagesService;
  let prisma: {
    plantImage: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  const mockImage = {
    id: 'img-1',
    plantId: 'plant-1',
    filePath: 'uploads/plant-1/test-uuid.webp',
    isCurrent: true,
    createdAt: new Date(),
  };

  const mockFile = {
    buffer: Buffer.from('fake-image'),
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
  } as Express.Multer.File;

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      plantImage: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  describe('upload', () => {
    it('should process image and create record', async () => {
      prisma.plantImage.updateMany.mockResolvedValue({ count: 1 });
      prisma.plantImage.create.mockResolvedValue(mockImage);

      const result = await service.upload('plant-1', mockFile);

      expect(prisma.plantImage.updateMany).toHaveBeenCalledWith({
        where: { plantId: 'plant-1', isCurrent: true },
        data: { isCurrent: false },
      });

      expect(prisma.plantImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plantId: 'plant-1',
          isCurrent: true,
        }),
      });

      expect(result).toEqual(mockImage);
    });
  });

  describe('findAllForPlant', () => {
    it('should return images ordered by createdAt desc', async () => {
      prisma.plantImage.findMany.mockResolvedValue([mockImage]);

      const result = await service.findAllForPlant('plant-1');

      expect(result).toEqual([mockImage]);
      expect(prisma.plantImage.findMany).toHaveBeenCalledWith({
        where: { plantId: 'plant-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('serve', () => {
    it('should return full file path', async () => {
      prisma.plantImage.findUnique.mockResolvedValue(mockImage);

      const result = await service.serve('img-1');

      expect(result).toContain('uploads');
      expect(result).toContain('plant-1');
      expect(result).toContain('test-uuid.webp');
    });

    it('should throw NotFoundException if image not found', async () => {
      prisma.plantImage.findUnique.mockResolvedValue(null);

      await expect(service.serve('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
