import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const signupEnabled = this.configService.get<boolean>('signup.enabled');
    if (!signupEnabled) {
      throw new ForbiddenException('Signup is currently disabled');
    }

    const existing = await this.usersService.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      displayName: dto.displayName,
      email: dto.email,
      passwordHash,
    });

    return this.buildAuthResponse(user);
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    return this.buildAuthResponse(user);
  }

  async refresh(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      accessToken: this.generateAccessToken(user),
    };
  }

  private buildAuthResponse(user: User) {
    const { passwordHash, ...profile } = user;
    return {
      accessToken: this.generateAccessToken(user),
      user: profile,
    };
  }

  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    };
    return this.jwtService.sign(payload);
  }
}
