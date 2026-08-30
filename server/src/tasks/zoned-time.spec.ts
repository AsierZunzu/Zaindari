import { describe, it, expect } from 'vitest';
import {
  isValidTimeZone,
  wallClockAt,
  zoneOffsetMs,
  wallClockToUtc,
  wallClockTimeOn,
  addDaysToWallClock,
} from './zoned-time.js';

const MADRID = 'Europe/Madrid';
const HOUR = 60 * 60 * 1000;

describe('isValidTimeZone', () => {
  it('accepts IANA names and UTC', () => {
    expect(isValidTimeZone(MADRID)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects a typo rather than letting it pass as UTC', () => {
    expect(isValidTimeZone('Europe/Madird')).toBe(false);
    expect(isValidTimeZone('CEST')).toBe(false);
  });
});

describe('zoneOffsetMs', () => {
  it('tracks the summer and winter offsets of the same zone', () => {
    expect(zoneOffsetMs(new Date('2026-08-30T12:00:00Z'), MADRID)).toBe(
      2 * HOUR,
    );
    expect(zoneOffsetMs(new Date('2026-01-15T12:00:00Z'), MADRID)).toBe(HOUR);
  });

  it('is zero for UTC', () => {
    expect(zoneOffsetMs(new Date('2026-08-30T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('wallClockAt', () => {
  it('reads the local clock, which can be on the next day', () => {
    expect(wallClockAt(new Date('2026-08-30T23:30:00Z'), MADRID)).toEqual({
      year: 2026,
      month: 8,
      day: 31,
      hour: 1,
      minute: 30,
    });
  });
});

describe('wallClockToUtc', () => {
  const nineAm = (month: number, day: number) => ({
    year: 2026,
    month,
    day,
    hour: 9,
    minute: 0,
  });

  it('resolves an unambiguous reading in summer', () => {
    expect(wallClockToUtc(nineAm(8, 30), MADRID)).toEqual(
      new Date('2026-08-30T07:00:00Z'),
    );
  });

  it('resolves the same reading differently in winter', () => {
    expect(wallClockToUtc(nineAm(1, 15), MADRID)).toEqual(
      new Date('2026-01-15T08:00:00Z'),
    );
  });

  it('is an identity for UTC', () => {
    expect(wallClockToUtc(nineAm(8, 30), 'UTC')).toEqual(
      new Date('2026-08-30T09:00:00Z'),
    );
  });

  it('resolves a reading outside the ambiguous hour on a transition day', () => {
    // Clocks go back at 03:00 local on 2026-10-25; 09:00 that day happened once.
    expect(wallClockToUtc(nineAm(10, 25), MADRID)).toEqual(
      new Date('2026-10-25T08:00:00Z'),
    );
    // Clocks jump forward at 02:00 local on 2026-03-29.
    expect(wallClockToUtc(nineAm(3, 29), MADRID)).toEqual(
      new Date('2026-03-29T07:00:00Z'),
    );
  });

  // The policy is "never fire early": both ambiguous cases take the later
  // candidate, so a reminder is at worst an hour late and never an hour early.
  it('takes the second occurrence of a reading the autumn overlap repeats', () => {
    // 2026-10-25: clocks go back 03:00 -> 02:00, so 02:30 happens twice.
    // 00:30Z is the first pass (02:30 CEST), 01:30Z the second (02:30 CET).
    expect(
      wallClockToUtc(
        { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
        MADRID,
      ),
    ).toEqual(new Date('2026-10-25T01:30:00Z'));
  });

  it('lands after the spring gap rather than before it', () => {
    // 2026-03-29: clocks jump 02:00 -> 03:00, so 02:30 never happens.
    // 01:30Z is 03:30 local, just after the jump; 00:30Z would have been
    // 01:30 local — an hour before the time the user actually asked for.
    expect(
      wallClockToUtc(
        { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
        MADRID,
      ),
    ).toEqual(new Date('2026-03-29T01:30:00Z'));
  });

  it('never resolves a reading to an instant before it', () => {
    // The property behind both cases above, stated directly: whatever the
    // transition does, the answer is never earlier than reading the wall
    // clock at the zone's larger (summer) offset would have been.
    for (const [month, day] of [
      [3, 29],
      [10, 25],
    ]) {
      for (let hour = 0; hour < 5; hour++) {
        const resolved = wallClockToUtc(
          { year: 2026, month, day, hour, minute: 30 },
          MADRID,
        );
        const earliestPossible =
          Date.UTC(2026, month - 1, day, hour, 30) - 2 * HOUR;
        expect(resolved.getTime()).toBeGreaterThanOrEqual(earliestPossible);
      }
    }
  });
});

describe('addDaysToWallClock', () => {
  it('rolls over month and year ends', () => {
    expect(
      addDaysToWallClock(
        { year: 2026, month: 12, day: 31, hour: 9, minute: 0 },
        1,
      ),
    ).toEqual({ year: 2027, month: 1, day: 1, hour: 9, minute: 0 });
  });
});

describe('wallClockTimeOn', () => {
  it('keeps a schedule at the same local time across a transition', () => {
    // The day before the clocks go back, and the day itself: both 09:00 local,
    // an hour apart in UTC. Adding 24h to the instant would have drifted.
    const beforeTransition = wallClockTimeOn(
      new Date('2026-10-24T12:00:00Z'),
      { hour: 9, minute: 0 },
      MADRID,
    );
    const afterTransition = wallClockTimeOn(
      new Date('2026-10-24T12:00:00Z'),
      { hour: 9, minute: 0 },
      MADRID,
      1,
    );

    expect(beforeTransition).toEqual(new Date('2026-10-24T07:00:00Z'));
    expect(afterTransition).toEqual(new Date('2026-10-25T08:00:00Z'));
  });

  it('counts days on the local calendar, not the UTC one', () => {
    // 23:30Z on the 30th is already the 31st in Madrid, so "one day on" is
    // the 1st.
    expect(
      wallClockTimeOn(
        new Date('2026-08-30T23:30:00Z'),
        { hour: 9, minute: 0 },
        MADRID,
        1,
      ),
    ).toEqual(new Date('2026-09-01T07:00:00Z'));
  });
});
