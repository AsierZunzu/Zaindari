import { wallClockTimeOn } from './zoned-time.js';

/**
 * When a reminder for a task is allowed to go out.
 *
 * Tasks are created the moment their interval elapses, which is the clock time
 * of the last completion and so lands at arbitrary hours. The push is held back
 * until the configured notification time instead, which is the whole point of
 * the setting: reminders arrive when the user asked for them, not at 02:14.
 *
 * The rule is "the first occurrence of the configured time at or after the task
 * became actionable". A task that became actionable at 02:14 with a 09:00 time
 * waits until 09:00 the same day; one that became actionable at 14:00 waits
 * until 09:00 the next day rather than firing immediately, because notifying
 * late in the evening would break the promise the setting makes. The trade is
 * that an afternoon task can sit quiet overnight — it is still visible as
 * pending in the app the whole time.
 *
 * The configured time is a *wall-clock* reading, not a UTC one: someone who
 * asks for 09:00 means nine in the morning where they are. It is resolved
 * against the instance timezone (`TZ`, see `configuration.ts`) via
 * `zoned-time.ts`. Instants — `createdAt`, `dueAt`, `now` — stay UTC, as they
 * must: those are shared facts about a task rather than anyone's morning.
 */

/**
 * The two task creators disagree about which timestamp matters, so the anchor
 * is the later of the two. `SchedulerService` backdates `dueAt` to the
 * schedule's hour, which can already be hours past by the time the row is
 * written — there, `createdAt` is when the task became real. `TasksService`
 * does the opposite and creates the follow-up immediately with a `dueAt` one
 * interval out — there, anchoring on `createdAt` would push a reminder days
 * before the task is due.
 */
export function notificationAnchor(createdAt: Date, dueAt: Date): Date {
  return dueAt > createdAt ? dueAt : createdAt;
}

export function notificationDueAt(
  anchor: Date,
  time: { hour: number; minute: number },
  zone: string,
): Date {
  const today = wallClockTimeOn(anchor, time, zone);
  return today < anchor ? wallClockTimeOn(anchor, time, zone, 1) : today;
}

/**
 * Whether a pending, not-yet-notified task should be pushed on this tick.
 */
export function shouldNotifyNow(
  task: { createdAt: Date; dueAt: Date },
  now: Date,
  time: { hour: number; minute: number },
  zone: string,
): boolean {
  const anchor = notificationAnchor(task.createdAt, task.dueAt);
  return now >= notificationDueAt(anchor, time, zone);
}
