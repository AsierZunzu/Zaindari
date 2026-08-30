import { describe, it, expect } from 'vitest';
import {
  notificationAnchor,
  notificationDueAt,
  shouldNotifyNow,
} from './notification-window.js';

const NINE_AM = { hour: 9, minute: 0 };
const UTC = 'UTC';
const MADRID = 'Europe/Madrid';

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
      notificationDueAt(new Date('2024-06-10T02:14:00Z'), NINE_AM, UTC),
    ).toEqual(new Date('2024-06-10T09:00:00Z'));
  });

  it('rolls to the next day when the time has already passed', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T14:00:00Z'), NINE_AM, UTC),
    ).toEqual(new Date('2024-06-11T09:00:00Z'));
  });

  it('treats the configured time itself as due, not as passed', () => {
    expect(
      notificationDueAt(new Date('2024-06-10T09:00:00Z'), NINE_AM, UTC),
    ).toEqual(new Date('2024-06-10T09:00:00Z'));
  });

  it('crosses the month boundary', () => {
    expect(
      notificationDueAt(new Date('2024-06-30T23:30:00Z'), NINE_AM, UTC),
    ).toEqual(new Date('2024-07-01T09:00:00Z'));
  });

  it('honours the minute, not just the hour', () => {
    expect(
      notificationDueAt(
        new Date('2024-06-10T09:15:00Z'),
        { hour: 9, minute: 30 },
        UTC,
      ),
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
      shouldNotifyNow(
        morningTask,
        new Date('2024-06-10T08:59:00Z'),
        NINE_AM,
        UTC,
      ),
    ).toBe(false);
  });

  it('is true from the configured time onwards', () => {
    expect(
      shouldNotifyNow(
        morningTask,
        new Date('2024-06-10T09:00:00Z'),
        NINE_AM,
        UTC,
      ),
    ).toBe(true);
    expect(
      shouldNotifyNow(
        morningTask,
        new Date('2024-06-10T17:00:00Z'),
        NINE_AM,
        UTC,
      ),
    ).toBe(true);
  });

  it('stays quiet overnight for a task that appeared after the time', () => {
    const afternoonTask = {
      createdAt: new Date('2024-06-10T14:00:00Z'),
      dueAt: new Date('2024-06-10T14:00:00Z'),
    };

    expect(
      shouldNotifyNow(
        afternoonTask,
        new Date('2024-06-10T23:59:00Z'),
        NINE_AM,
        UTC,
      ),
    ).toBe(false);
    expect(
      shouldNotifyNow(
        afternoonTask,
        new Date('2024-06-11T09:00:00Z'),
        NINE_AM,
        UTC,
      ),
    ).toBe(true);
  });
});

/**
 * The regression these were written for: a reminder set to 09:00 was firing at
 * 09:00 UTC, which is 11:00 in Madrid in summer and 10:00 in winter. The hour
 * is a wall-clock reading and has to be resolved in the instance zone.
 */
describe('notificationDueAt across zones', () => {
  it('reads the configured hour as local, not UTC (summer, UTC+2)', () => {
    expect(
      notificationDueAt(new Date('2026-08-30T02:14:00Z'), NINE_AM, MADRID),
    ).toEqual(new Date('2026-08-30T07:00:00Z'));
  });

  it('follows the offset change into winter without being reconfigured', () => {
    expect(
      notificationDueAt(new Date('2026-01-15T02:14:00Z'), NINE_AM, MADRID),
    ).toEqual(new Date('2026-01-15T08:00:00Z'));
  });

  it('rolls to the next local day, not the next UTC day', () => {
    // 08:00Z is 10:00 in Madrid — already past 09:00 local, so this waits for
    // tomorrow even though 09:00 UTC is still ahead.
    expect(
      notificationDueAt(new Date('2026-08-30T08:00:00Z'), NINE_AM, MADRID),
    ).toEqual(new Date('2026-08-31T07:00:00Z'));
  });

  it('keeps an ordinary morning reminder on the day the clocks change', () => {
    // Spain goes back 03:00 -> 02:00 on 2026-10-25. 09:00 that morning is
    // unambiguous and must not take the transition path.
    expect(
      notificationDueAt(new Date('2026-10-25T00:30:00Z'), NINE_AM, MADRID),
    ).toEqual(new Date('2026-10-25T08:00:00Z'));
  });

  it('is quiet at 09:00 UTC when the recipient asked for 09:00 local', () => {
    const task = {
      createdAt: new Date('2026-08-30T02:14:00Z'),
      dueAt: new Date('2026-08-30T02:14:00Z'),
    };

    expect(
      shouldNotifyNow(task, new Date('2026-08-30T06:59:00Z'), NINE_AM, MADRID),
    ).toBe(false);
    expect(
      shouldNotifyNow(task, new Date('2026-08-30T07:00:00Z'), NINE_AM, MADRID),
    ).toBe(true);
  });
});
