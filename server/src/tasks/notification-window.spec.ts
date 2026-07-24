import { describe, it, expect } from 'vitest';
import {
  notificationAnchor,
  notificationDueAt,
  shouldNotifyNow,
} from './notification-window.js';

const NINE_AM = { hour: 9, minute: 0 };

describe('notificationAnchor', () => {
  it('uses createdAt when dueAt is backdated to the schedule hour', () => {
    const createdAt = new Date('2024-06-10T14:00:00Z');
    const dueAt = new Date('2024-06-10T08:00:00Z');

    expect(notificationAnchor(createdAt, dueAt)).toEqual(createdAt);
  });

  it('uses dueAt for a follow-up created an interval ahead of time', () => {
    const createdAt = new Date('2024-06-10T14:00:00Z');
    const dueAt = new Date('2024-06-13T08:00:00Z');

    expect(notificationAnchor(createdAt, dueAt)).toEqual(dueAt);
  });
});

describe('notificationDueAt', () => {
  it('picks the configured time later the same day', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T02:14:00Z'), NINE_AM),
    ).toEqual(new Date('2024-06-10T09:00:00Z'));
  });

  it('rolls to the next day when the time has already passed', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T14:00:00Z'), NINE_AM),
    ).toEqual(new Date('2024-06-11T09:00:00Z'));
  });

  it('treats the configured time itself as due, not as passed', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T09:00:00Z'), NINE_AM),
    ).toEqual(new Date('2024-06-10T09:00:00Z'));
  });

  it('crosses the month boundary', () => {
    expect(
      notificationDueAt(new Date('2024-06-30T23:30:00Z'), NINE_AM),
    ).toEqual(new Date('2024-07-01T09:00:00Z'));
  });

  it('honours the minute, not just the hour', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T09:15:00Z'), {
        hour: 9,
        minute: 30,
      }),
    ).toEqual(new Date('2024-06-10T09:30:00Z'));
  });
});

describe('shouldNotifyNow', () => {
  const morningTask = {
    createdAt: new Date('2024-06-10T02:14:00Z'),
    dueAt: new Date('2024-06-10T02:14:00Z'),
  };

  it('is false a minute before the configured time', () => {
    expect(
      shouldNotifyNow(morningTask, new Date('2024-06-10T08:59:00Z'), NINE_AM),
    ).toBe(false);
  });

  it('is true from the configured time onwards', () => {
    expect(
      shouldNotifyNow(morningTask, new Date('2024-06-10T09:00:00Z'), NINE_AM),
    ).toBe(true);
    expect(
      shouldNotifyNow(morningTask, new Date('2024-06-10T17:00:00Z'), NINE_AM),
    ).toBe(true);
  });

  it('stays quiet overnight for a task that appeared after the time', () => {
    const afternoonTask = {
      createdAt: new Date('2024-06-10T14:00:00Z'),
      dueAt: new Date('2024-06-10T14:00:00Z'),
    };

    expect(
      shouldNotifyNow(afternoonTask, new Date('2024-06-10T23:59:00Z'), NINE_AM),
    ).toBe(false);
    expect(
      shouldNotifyNow(afternoonTask, new Date('2024-06-11T09:00:00Z'), NINE_AM),
    ).toBe(true);
  });
});
