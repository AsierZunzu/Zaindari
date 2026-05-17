import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async create(data: {
    username: string;
    displayName: string;
    email?: string;
    passwordHash?: string;
    oidcSubject?: string;
    isAdmin?: boolean;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(
    id: string,
    data: { displayName?: string; email?: string },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
