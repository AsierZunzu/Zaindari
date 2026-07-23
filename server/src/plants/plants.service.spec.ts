import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlantsService, toPlantWithImage } from './plants.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
}));

describe('PlantsService', () => {
  let service: PlantsService;
  let prisma: {
    plant: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  const mockPlant = {
    id: 'plant-1',
    ownerId: 'user-1',
    name: 'Monstera',
    location: 'Living room',
    instructions: 'Water weekly',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      plant: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PlantsService>(PlantsService);
  });

  describe('findAllForUser', () => {
    it('should return plants for owner or shared user', async () => {
      prisma.plant.findMany.mockResolvedValue([mockPlant]);

      const result = await service.findAllForUser('user-1');

      expect(result).toEqual([mockPlant]);
      expect(prisma.plant.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: 'user-1' },
            { shares: { some: { userId: 'user-1' } } },
          ],
        },
        include: {
          images: {
            where: { isCurrent: true },
            take: 1,
          },
        },
      });
    });
  });

  describe('findById', () => {
    it('should return plant with relations', async () => {
      prisma.plant.findUnique.mockResolvedValue(mockPlant);

      const result = await service.findById('plant-1');
      expect(result).toEqual(mockPlant);
    });

    it('should throw NotFoundException if plant not found', async () => {
      prisma.plant.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toPlantWithImage', () => {
    const image = {
      id: 'image-1',
      plantId: 'plant-1',
      filePath: 'uploads/plant-1/image-1.jpg',
      isCurrent: true,
      createdAt: new Date(),
    };

    it('should flatten the current image onto currentImage', () => {
      const result = toPlantWithImage({ ...mockPlant, images: [image] });

      expect(result.currentImage).toEqual(image);
    });

    it('should report no current image as null rather than undefined', () => {
      const result = toPlantWithImage({ ...mockPlant, images: [] });

      expect(result.currentImage).toBeNull();
    });

    it('should not leak relations the query happened to include', () => {
      const result = toPlantWithImage({
        ...mockPlant,
        images: [],
        owner: { id: 'user-1', passwordHash: 'secret' },
        shares: [{ userId: 'user-2' }],
      } as unknown as Parameters<typeof toPlantWithImage>[0]);

      expect(result).not.toHaveProperty('owner');
      expect(result).not.toHaveProperty('shares');
      expect(result).not.toHaveProperty('images');
    });
  });

  describe('create', () => {
    it('should create a plant', async () => {
      prisma.plant.create.mockResolvedValue(mockPlant);

      const result = await service.create('user-1', {
        name: 'Monstera',
        location: 'Living room',
        instructions: 'Water weekly',
      });

      expect(result).toEqual(mockPlant);
      expect(prisma.plant.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'user-1',
          name: 'Monstera',
          location: 'Living room',
          instructions: 'Water weekly',
        },
      });
    });
  });

  describe('update', () => {
    it('should update a plant', async () => {
      prisma.plant.findUnique.mockResolvedValue(mockPlant);
      prisma.plant.update.mockResolvedValue({ ...mockPlant, name: 'Updated' });

      const result = await service.update('plant-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if plant not found', async () => {
      prisma.plant.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete plant and remove upload directory', async () => {
      prisma.plant.findUnique.mockResolvedValue(mockPlant);
      prisma.plant.delete.mockResolvedValue(mockPlant);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.delete('plant-1');

      expect(prisma.plant.delete).toHaveBeenCalledWith({ where: { id: 'plant-1' } });
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('should delete plant even if no upload directory exists', async () => {
      prisma.plant.findUnique.mockResolvedValue(mockPlant);
      prisma.plant.delete.mockResolvedValue(mockPlant);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await service.delete('plant-1');

      expect(prisma.plant.delete).toHaveBeenCalledWith({ where: { id: 'plant-1' } });
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if plant not found', async () => {
      prisma.plant.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
