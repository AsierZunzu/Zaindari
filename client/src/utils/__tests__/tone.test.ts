import { describe, it, expect } from 'vitest'
import { statusTone } from '../tone'
import type { Task } from '../../types'

function task(status: Task['status'], daysFromNow: number): Pick<Task, 'status' | 'dueAt'> {
  return {
    status,
    dueAt: new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString(),
  }
}

describe('statusTone', () => {
  it('reads a late pending task as overdue', () => {
    expect(statusTone(task('pending', -2))).toBe('overdue')
  })

  it('tells today and the future apart', () => {
    expect(statusTone(task('pending', 0))).toBe('due')
    expect(statusTone(task('pending', 6))).toBe('idle')
  })

  // The decision this module exists to hold: the two signals conflict here,
  // and deferring something on purpose is not the same as neglecting it.
  it('keeps a snoozed task honey even once its due date has passed', () => {
    expect(statusTone(task('snoozed', -3))).toBe('due')
  })

  it('lets a skipped task go quiet rather than staying red', () => {
    expect(statusTone(task('skipped', -3))).toBe('idle')
  })

  it('always reads a completed task as done', () => {
    expect(statusTone(task('done', -3))).toBe('done')
  })
})
