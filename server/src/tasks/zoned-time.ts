/**
 * Wall-clock arithmetic in a named IANA zone, built on `Intl` so the server
 * needs no date dependency (the zone database ships with Node's ICU).
 *
 * This exists because a reminder time and a due date are different kinds of
 * value and were being stored in the same units. A `dueAt` is one shared fact
 * about a task, so it is an instant and UTC is right for it. "Remind me at
 * 09:00" is a claim about somebody's morning: it is a *wall clock reading*,
 * and it does not name an instant until you say in which zone to read it.
 * Comparing one against the other in UTC is what made every push arrive a
 * whole UTC offset late.
 */

/** A reading off a wall clock. Not an instant: it has no zone of its own. */
export interface WallClock {
  year: number;
  /** 1-12, as a human would say it, not as `Date` counts months. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    FORMATTERS.set(zone, formatter);
  }
  return formatter;
}

/**
 * Whether the runtime recognises this zone. Called at boot rather than at use:
 * an unknown zone silently degrading to UTC is precisely the failure this
 * module was written to end, so a typo should stop the process, not quietly
 * reinstate the bug.
 */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** What a clock in `zone` reads at this instant. */
export function wallClockAt(instant: Date, zone: string): WallClock {
  const parts = formatterFor(zone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

/**
 * How far ahead of UTC `zone` is at this instant, in milliseconds. Positive
 * east of Greenwich. Derived by reading the local clock and asking what that
 * reading would be worth as UTC — the difference is the offset in force.
 */
export function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = formatterFor(zone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );

  // The formatter has no sub-second precision, so compare against a truncated
  // instant or every offset comes out a few hundred ms off a whole minute.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function sameWallClock(a: WallClock, b: WallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

/**
 * The instant at which clocks in `zone` read `wall`.
 *
 * Twice a year there is no single answer, which is why this is not a
 * subtraction. Clocks in Europe/Madrid jump 02:00 -> 03:00 on the last Sunday
 * in March, so 02:30 never happens; they fall 03:00 -> 02:00 in October, so
 * 02:30 happens twice. Both candidate instants are computed here and
 * `resolveDstTransition` decides between them.
 */
export function wallClockToUtc(wall: WallClock, zone: string): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );

  // Bracket the reading by a day either side. On an ordinary day both samples
  // agree and there is one answer; across a transition they differ, and the
  // two offsets in force give the two candidate instants. Sampling only at the
  // guess itself would quietly collapse the autumn overlap onto one of its two
  // occurrences without ever noticing there had been a choice.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const before = zoneOffsetMs(new Date(naive - DAY_MS), zone);
  const after = zoneOffsetMs(new Date(naive + DAY_MS), zone);

  // A larger offset is further east, so it maps the same reading to an
  // earlier instant.
  const earlier = new Date(naive - Math.max(before, after));
  const later = new Date(naive - Math.min(before, after));

  if (earlier.getTime() === later.getTime()) {
    return earlier;
  }

  const earlierIsReal = sameWallClock(wallClockAt(earlier, zone), wall);
  const laterIsReal = sameWallClock(wallClockAt(later, zone), wall);

  // Most readings on a transition day are still unambiguous — 09:00 on the
  // morning the clocks changed happened exactly once — and only one candidate
  // survives. That is arithmetic, not policy, so it is settled here rather
  // than sent below; otherwise an ordinary reminder would take the
  // transition path twice a year.
  if (earlierIsReal !== laterIsReal) {
    return earlierIsReal ? earlier : later;
  }

  return resolveDstTransition({
    earlier,
    later,
    ambiguity: earlierIsReal ? 'overlap' : 'gap',
  });
}

/**
 * Which instant to remind someone at when their chosen wall-clock time is
 * either missing or duplicated by a daylight-saving transition.
 *
 * `earlier` and `later` are the two candidates, in chronological order, an
 * hour apart, and exactly one of two things is true of them:
 *
 * - `overlap` — the reading happened twice. Clocks in Europe/Madrid go back
 *   03:00 -> 02:00 in October, so 02:30 comes round again; `earlier` is the
 *   first pass (still on summer time), `later` the second.
 * - `gap` — the reading never happened. Clocks jump 02:00 -> 03:00 in March,
 *   so 02:30 does not exist; `earlier` lands at 01:30 local, just before the
 *   jump, and `later` at 03:30 local, just after it.
 *
 * Both cases take `later`, under one rule: never fire early. A reminder is a
 * promise not to disturb someone before the hour they named, and on a gap
 * `earlier` would ring at 01:30 for a time they wrote as 02:30 — waking them
 * an hour ahead of a schedule they set precisely to avoid that. Late is the
 * cheaper failure here: the task stays visible as pending in the app the whole
 * time, so an hour's delay costs a little lateness, while an hour's earliness
 * costs the trust that makes the setting worth having.
 *
 * On an overlap the same rule happens to pick the second pass, which is also
 * the reading a clock on the wall shows when the night has settled — someone
 * glancing at 02:30 after the change sees the occurrence they were pushed on.
 */
function resolveDstTransition(candidates: {
  earlier: Date;
  later: Date;
  ambiguity: 'overlap' | 'gap';
}): Date {
  return candidates.later;
}

/** Calendar-day arithmetic on a reading, rolling months and years over. */
export function addDaysToWallClock(wall: WallClock, days: number): WallClock {
  const rolled = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
  };
}

/**
 * The instant at which clocks in `zone` read `time` on the day `instant` falls
 * on there, optionally `plusDays` later.
 *
 * This is the one conversion every scheduled hour in the app goes through, so
 * that a stored `hour` of 7 means the same thing to the push gate as it does
 * to a `dueAt` stamp. Adding the days to the *reading* rather than to the
 * instant is what keeps a daily schedule at the same time of day across a
 * transition: 24 hours after 09:00 on the last Saturday in March is 10:00,
 * but the next day's 09:00 is still 09:00.
 */
export function wallClockTimeOn(
  instant: Date,
  time: { hour: number; minute: number },
  zone: string,
  plusDays = 0,
): Date {
  const day = addDaysToWallClock(wallClockAt(instant, zone), plusDays);
  return wallClockToUtc({ ...day, hour: time.hour, minute: time.minute }, zone);
}
