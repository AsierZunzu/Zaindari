import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  generateVAPIDKeys: vi.fn(() => ({ publicKey: 'pub', privateKey: 'priv' })),
  sendNotification: vi.fn(() => Promise.resolve(undefined)),
}));

describe('PushService.notifyPlantCollaborators', () => {
  let service: PushService;
  let prisma: {
    plant: { findUnique: ReturnType<typeof vi.fn> };
    pushSubscription: {
      findMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    appConfig: { findUnique: ReturnType<typeof vi.fn> };
  };

  /** Renders a body carrying the locale, so assertions can read it back. */
  const buildPayload = (locale: string) => ({
    title: 'Zaindari',
    body: `body-in-${locale}`,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      plant: { findUnique: vi.fn() },
      pushSubscription: { findMany: vi.fn(), delete: vi.fn() },
      appConfig: { findUnique: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: vi.fn(() => undefined) } },
      ],
    }).compile();

    service = module.get<PushService>(PushService);

    // No subscriptions: this suite is about who gets notified in what language,
    // not about web-push delivery.
    prisma.pushSubscription.findMany.mockResolvedValue([]);
  });

  it('renders the payload once per recipient in that recipient’s locale', async () => {
    prisma.plant.findUnique.mockResolvedValue({
      owner: { id: 'owner-1', locale: 'eu' },
      shares: [
        { user: { id: 'friend-1', locale: 'es' } },
        { user: { id: 'friend-2', locale: 'en' } },
      ],
    });

    const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue();

    await service.notifyPlantCollaborators('plant-1', buildPayload);

    expect(spy.mock.calls).toEqual([
      ['owner-1', { title: 'Zaindari', body: 'body-in-eu' }],
      ['friend-1', { title: 'Zaindari', body: 'body-in-es' }],
      ['friend-2', { title: 'Zaindari', body: 'body-in-en' }],
    ]);
  });

  it('notifies an owner who also holds a share exactly once', async () => {
    prisma.plant.findUnique.mockResolvedValue({
      owner: { id: 'owner-1', locale: 'es' },
      shares: [{ user: { id: 'owner-1', locale: 'es' } }],
    });

    const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue();

    await service.notifyPlantCollaborators('plant-1', buildPayload);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still notifies the others when one recipient fails', async () => {
    prisma.plant.findUnique.mockResolvedValue({
      owner: { id: 'owner-1', locale: 'en' },
      shares: [{ user: { id: 'friend-1', locale: 'es' } }],
    });

    const spy = vi
      .spyOn(service, 'sendNotification')
      .mockRejectedValueOnce(new Error('push endpoint gone'))
      .mockResolvedValue();

    await expect(
      service.notifyPlantCollaborators('plant-1', buildPayload),
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a plant that no longer exists', async () => {
    prisma.plant.findUnique.mockResolvedValue(null);
    const spy = vi.spyOn(service, 'sendNotification').mockResolvedValue();

    await service.notifyPlantCollaborators('gone', buildPayload);

    expect(spy).not.toHaveBeenCalled();
  });
});
