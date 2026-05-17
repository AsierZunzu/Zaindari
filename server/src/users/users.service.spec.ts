import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2b$10$hash',
    oidcSubject: null,
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await usersService.findById('user-1');
      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should return null if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await usersService.findById('unknown');
      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return a user by username', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await usersService.findByUsername('testuser');
      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await usersService.create({
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        passwordHash: '$2b$10$hash',
      });

      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          passwordHash: '$2b$10$hash',
        },
      });
    });
  });

  describe('update', () => {
    it('should update user profile', async () => {
      const updated = { ...mockUser, displayName: 'Updated Name' };
      prisma.user.update.mockResolvedValue(updated);

      const result = await usersService.update('user-1', {
        displayName: 'Updated Name',
      });

      expect(result.displayName).toBe('Updated Name');
    });
  });
});
