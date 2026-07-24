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
 * Like every other due-date calculation in this codebase the arithmetic is UTC,
 * so the configured hour is a UTC hour regardless of the `TZ` env var.
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
): Date {
  const due = new Date(anchor);
  due.setUTCHours(time.hour, time.minute, 0, 0);

  if (due < anchor) {
    due.setUTCDate(due.getUTCDate() + 1);
  }

  return due;
}

/**
 * Whether a pending, not-yet-notified task should be pushed on this tick.
 */
export function shouldNotifyNow(
  task: { createdAt: Date; dueAt: Date },
  now: Date,
  time: { hour: number; minute: number },
): boolean {
  const anchor = notificationAnchor(task.createdAt, task.dueAt);
  return now >= notificationDueAt(anchor, time);
}
