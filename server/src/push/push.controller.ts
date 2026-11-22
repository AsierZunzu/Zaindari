import { Controller, Post, Delete, Get, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PushService } from './push.service.js';

@Controller('api/push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-key')
  async getVapidKey() {
    const publicKey = await this.pushService.getVapidPublicKey();
    return { publicKey };
  }

  @Post('subscribe')
  async subscribe(
    @CurrentUser() user: { id: string },
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.pushService.subscribe(
      user.id,
      body.endpoint,
      body.keys.p256dh,
      body.keys.auth,
    );
    return { ok: true };
  }

  @Delete('subscribe')
  async unsubscribe(
    @CurrentUser() user: { id: string },
    @Body() body: { endpoint: string },
  ) {
    await this.pushService.unsubscribe(user.id, body.endpoint);
    return { ok: true };
  }
}
