import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PushService } from './push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  return {
    ...actual,
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
  };
});

function pushError(statusCode: number) {
  return new webPush.WebPushError(
    'Push failed',
    statusCode,
    {},
    '',
    'https://push.example/abc',
  );
}

describe('PushService', () => {
  let service: PushService;
  let prisma: {
    pushSubscription: {
      findMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  const subscription = {
    id: 'sub-1',
    userId: 'user-1',
    endpoint: 'https://push.example/abc',
    p256dh: 'key',
    auth: 'auth',
  };
  const payload = { title: 'Zaindari', body: 'Water the fern' };

  beforeEach(async () => {
    vi.mocked(webPush.sendNotification).mockReset();
    prisma = {
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([subscription]),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    service = module.get(PushService);
  });

  it('sends the payload to every subscription of the user', async () => {
    vi.mocked(webPush.sendNotification).mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    });

    await service.sendNotification('user-1', payload);

    expect(webPush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: 'key', auth: 'auth' },
      },
      JSON.stringify(payload),
    );
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    'removes a subscription the push service has dropped (%i)',
    async (status) => {
      vi.mocked(webPush.sendNotification).mockRejectedValue(pushError(status));

      await service.sendNotification('user-1', payload);

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
    },
  );

  it('removes a subscription signed for a VAPID key we no longer have (403)', async () => {
    vi.mocked(webPush.sendNotification).mockRejectedValue(pushError(403));

    await service.sendNotification('user-1', payload);

    // Otherwise every reminder to it fails silently, forever.
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
    });
  });

  it('keeps the subscription on a transient failure', async () => {
    vi.mocked(webPush.sendNotification).mockRejectedValue(pushError(503));

    await service.sendNotification('user-1', payload);

    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  describe('unsubscribe', () => {
    it("deletes only the caller's own subscription", async () => {
      await service.unsubscribe('user-1', subscription.endpoint);

      // Matching on the endpoint alone let anyone who knew it switch off
      // another user's reminders.
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: subscription.endpoint, userId: 'user-1' },
      });
    });
  });
});
