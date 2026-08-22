import type { Task } from '../types'
import { isDueToday, isOverdue } from './date'

/**
 * The four status tones of the palette. Like everything else in `utils/`, this
 * module stays pure and returns a *tone*, not classes-with-wording — the tone
 * is the decision, the classes below are just how it is painted.
 */
export type Tone = 'overdue' | 'due' | 'done' | 'idle'

/** Soft fill + AA-contrast ink, for badges and pills. */
export const TONE_BADGE: Record<Tone, string> = {
  overdue: 'bg-overdue-soft text-overdue-ink',
  due: 'bg-due-soft text-due-ink',
  done: 'bg-done-soft text-done-ink',
  idle: 'bg-idle-soft text-idle-ink',
}

/** The bare tone, for a dot, a rule, or a card's left edge. */
export const TONE_MARK: Record<Tone, string> = {
  overdue: 'bg-overdue',
  due: 'bg-due',
  done: 'bg-done',
  idle: 'bg-idle',
}

/**
 * How urgent a task looks. Two signals compete — the lifecycle status
 * (`done`/`skipped`/`snoozed`) and the urgency implied by `dueAt` — and the
 * order below is the product decision about which one wins.
 *
 * **A snooze outranks being overdue.** A snoozed task whose `dueAt` has already
 * passed reads as honey, not clay: the user deliberately deferred it, and an
 * app that goes on shouting after being told "not now" teaches them that
 * snoozing does nothing. It returns to clay when the snooze itself expires and
 * `SchedulerService` moves the task back to `pending`.
 *
 * `skipped` is stone rather than clay for the same reason, and this is where
 * the earlier per-component if-chains got it wrong: they tested `isOverdue`
 * before the status, so a task skipped last week still glowed red.
 */
export function statusTone(task: Pick<Task, 'status' | 'dueAt'>): Tone {
  if (task.status === 'done') return 'done'
  if (task.status === 'skipped') return 'idle'
  if (task.status === 'snoozed') return 'due'
  if (isOverdue(task.dueAt)) return 'overdue'
  if (isDueToday(task.dueAt)) return 'due'
  return 'idle'
}
