import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User } from '@prisma/client';
import { isSupportedLocale } from '../i18n/messages.js';

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
    locale?: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(
    id: string,
    data: { displayName?: string; email?: string; locale?: string },
  ): Promise<User> {
    // The locale is echoed straight into the client's `<html lang>` and used as
    // a message-catalog key, so it is validated against what we actually ship
    // rather than stored as whatever the request sent.
    if (data.locale !== undefined && !isSupportedLocale(data.locale)) {
      throw new BadRequestException(`Unsupported locale: ${data.locale}`);
    }

    return this.prisma.user.update({ where: { id }, data });
  }
}
