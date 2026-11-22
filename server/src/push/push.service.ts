import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const publicKey = await this.prisma.appConfig.findUnique({
      where: { key: 'vapid_public_key' },
    });
    const privateKey = await this.prisma.appConfig.findUnique({
      where: { key: 'vapid_private_key' },
    });

    if (publicKey && privateKey) {
      this.logger.log('Using existing VAPID keys from app_config');
      webPush.setVapidDetails(
        this.getVapidSubject(),
        publicKey.value,
        privateKey.value,
      );
    } else {
      this.logger.log('Generating new VAPID keys');
      const keys = webPush.generateVAPIDKeys();
      await this.prisma.appConfig.upsert({
        where: { key: 'vapid_public_key' },
        update: { value: keys.publicKey },
        create: { key: 'vapid_public_key', value: keys.publicKey },
      });
      await this.prisma.appConfig.upsert({
        where: { key: 'vapid_private_key' },
        update: { value: keys.privateKey },
        create: { key: 'vapid_private_key', value: keys.privateKey },
      });
      webPush.setVapidDetails(
        this.getVapidSubject(),
        keys.publicKey,
        keys.privateKey,
      );
    }
  }

  private getVapidSubject(): string {
    return (
      this.config.get<string>('ZAINDARI_VAPID_SUBJECT') ||
      'mailto:admin@zaindari.local'
    );
  }

  async getVapidPublicKey(): Promise<string> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: 'vapid_public_key' },
    });
    return row?.value ?? '';
  }

  async subscribe(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth },
      create: { userId, endpoint, p256dh, auth },
    });
  }

  /**
   * Scoped to the caller: an endpoint is not a secret to anyone who has seen
   * one, so matching on it alone let any signed-in user switch off somebody
   * else's reminders. Someone else's endpoint matches nothing, and the request
   * still succeeds, so it reveals nothing about which endpoints exist.
   */
  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
  }

  async sendNotification(userId: string, payload: NotificationPayload) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err) {
          // 410 Gone / 404 mean the push service has permanently dropped this
          // endpoint. 403 means it refuses our VAPID signature for it: the
          // subscription was made for a keypair this instance no longer has
          // (a recreated database regenerates it), and will be refused forever.
          // Keeping any of these would fail every reminder silently; the client
          // re-registers a live subscription the next time the app starts.
          // Anything else is transient and worth surfacing.
          const statusCode =
            err instanceof webPush.WebPushError ? err.statusCode : undefined;
          if (statusCode === 410 || statusCode === 404 || statusCode === 403) {
            this.logger.warn(`Removing stale subscription ${sub.id}`);
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          } else {
            throw err;
          }
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} push notification(s) failed`);
    }
  }
}
