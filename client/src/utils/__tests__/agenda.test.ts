import { describe, it, expect } from 'vitest'
import type { TaskWithPlant } from '../../types'
import {
  buildAgenda,
  buildMonthGrid,
  dayKey,
  dayLabel,
  dayMarkers,
  groupByDay,
  monthRange,
} from '../agenda'

const NOW = new Date('2026-07-23T10:00:00')

function task(overrides: Partial<TaskWithPlant> & { id: string; dueAt: string }): TaskWithPlant {
  return {
    plantId: 'plant-1',
    taskType: 'watering',
    status: 'pending',
    completedAt: null,
    completedBy: null,
    snoozeUntil: null,
    plant: { id: 'plant-1', name: 'Monstera', location: 'Kitchen', currentImage: null },
    ...overrides,
  }
}

describe('dayKey', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 23:30 local on the 23rd is the 23rd, whatever UTC thinks.
    expect(dayKey(new Date('2026-07-23T23:30:00'))).toBe('2026-07-23')
  })
})

describe('dayLabel', () => {
  // Returns a descriptor, not a string: the wording is the view layer's job
  // (see useTaskLabels), which is what keeps this module locale-free.
  it('names the days around today', () => {
    expect(dayLabel(new Date('2026-07-23T18:00:00'), NOW)).toEqual({ kind: 'today' })
    expect(dayLabel(new Date('2026-07-24T06:00:00'), NOW)).toEqual({ kind: 'tomorrow' })
    expect(dayLabel(new Date('2026-07-22T06:00:00'), NOW)).toEqual({ kind: 'yesterday' })
  })

  it('falls back to an explicit date for anything further out', () => {
    const label = dayLabel(new Date('2026-08-05T09:00:00'), NOW)
    expect(label.kind).toBe('date')
    if (label.kind !== 'date') throw new Error('unreachable')
    expect(label.date.getDate()).toBe(5)
    expect(label.sameYear).toBe(true)
  })

  it('flags a date in another year, so the view can show the year', () => {
    const label = dayLabel(new Date('2027-02-11T09:00:00'), NOW)
    expect(label).toMatchObject({ kind: 'date', sameYear: false })
  })
})

describe('groupByDay', () => {
  it('collects tasks due on the same local day', () => {
    const days = groupByDay(
      [
        task({ id: 'a', dueAt: '2026-07-23T08:00:00' }),
        task({ id: 'b', dueAt: '2026-07-23T20:00:00' }),
        task({ id: 'c', dueAt: '2026-07-25T08:00:00' }),
      ],
      NOW,
    )

    expect(days).toHaveLength(2)
    expect(days[0].key).toBe('2026-07-23')
    expect(days[0].tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(days[1].key).toBe('2026-07-25')
  })

  it('breaks a shared due time by plant name, then task type', () => {
    const at = '2026-07-23T09:00:00'
    const ficus = { id: 'plant-2', name: 'Ficus', location: null, currentImage: null }
    const days = groupByDay(
      [
        task({ id: 'a', dueAt: at, taskType: 'watering' }),
        task({ id: 'b', dueAt: at, taskType: 'watering', plantId: 'plant-2', plant: ficus }),
        task({ id: 'c', dueAt: at, taskType: 'fertilization' }),
      ],
      NOW,
    )

    expect(days[0].tasks.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('lists tied tasks the same way whatever order they arrive in', () => {
    const at = '2026-07-23T09:00:00'
    const tasks = [
      task({ id: 'a', dueAt: at }),
      task({ id: 'b', dueAt: at }),
      task({ id: 'c', dueAt: at }),
    ]

    const forwards = groupByDay(tasks, NOW)[0].tasks.map((t) => t.id)
    const backwards = groupByDay([...tasks].reverse(), NOW)[0].tasks.map((t) => t.id)
    expect(backwards).toEqual(forwards)
  })

  it('reverses the day order for history', () => {
    const days = groupByDay(
      [
        task({ id: 'a', dueAt: '2026-07-20T08:00:00' }),
        task({ id: 'b', dueAt: '2026-07-22T08:00:00' }),
      ],
      NOW,
      'desc',
    )

    expect(days.map((d) => d.key)).toEqual(['2026-07-22', '2026-07-20'])
  })
})

describe('buildAgenda', () => {
  it('separates overdue work from what is still to come', () => {
    const sections = buildAgenda(
      [
        task({ id: 'late', dueAt: '2026-07-20T08:00:00' }),
        task({ id: 'today', dueAt: '2026-07-23T18:00:00' }),
        task({ id: 'soon', dueAt: '2026-07-26T08:00:00' }),
      ],
      NOW,
    )

    expect(sections.map((s) => s.id)).toEqual(['overdue', 'upcoming'])
    expect(sections[0].days.flatMap((d) => d.tasks).map((t) => t.id)).toEqual(['late'])
    expect(sections[1].days.flatMap((d) => d.tasks).map((t) => t.id)).toEqual(['today', 'soon'])
  })

  it('keeps a task due earlier today out of overdue', () => {
    const sections = buildAgenda([task({ id: 'morning', dueAt: '2026-07-23T08:00:00' })], NOW)

    expect(sections.map((s) => s.id)).toEqual(['upcoming'])
  })

  it('counts a snoozed task as outstanding, not history', () => {
    const sections = buildAgenda(
      [task({ id: 'zzz', dueAt: '2026-07-21T08:00:00', status: 'snoozed' })],
      NOW,
    )

    expect(sections[0].id).toBe('overdue')
  })

  it('files done and skipped tasks under recently completed', () => {
    const sections = buildAgenda(
      [
        task({ id: 'done', dueAt: '2026-07-21T08:00:00', status: 'done' }),
        task({ id: 'skipped', dueAt: '2026-07-19T08:00:00', status: 'skipped' }),
      ],
      NOW,
    )

    expect(sections.map((s) => s.id)).toEqual(['upcoming', 'completed'])
    const completed = sections[1].days.flatMap((d) => d.tasks).map((t) => t.id)
    expect(completed).toEqual(['done', 'skipped'])
  })

  it('always offers an upcoming section so the empty state has a home', () => {
    expect(buildAgenda([], NOW).map((s) => s.id)).toEqual(['upcoming'])
  })
})

describe('buildMonthGrid', () => {
  it('lays out whole Monday-first weeks', () => {
    const weeks = buildMonthGrid(new Date('2026-07-01T00:00:00'), [], NOW)

    expect(weeks.every((w) => w.length === 7)).toBe(true)
    // 1 July 2026 is a Wednesday, so the grid opens on Monday 29 June.
    expect(weeks[0][0].date.getDate()).toBe(29)
    expect(weeks[0][0].inMonth).toBe(false)
    expect(weeks[0][2].date.getDate()).toBe(1)
    expect(weeks[0][2].inMonth).toBe(true)
  })

  it('covers every day of the month exactly once', () => {
    const days = buildMonthGrid(new Date('2026-07-01T00:00:00'), [], NOW)
      .flat()
      .filter((c) => c.inMonth)
      .map((c) => c.date.getDate())

    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
  })

  it('drops each task into its own day cell', () => {
    const weeks = buildMonthGrid(
      new Date('2026-07-01T00:00:00'),
      [
        task({ id: 'a', dueAt: '2026-07-23T08:00:00' }),
        task({ id: 'b', dueAt: '2026-07-23T20:00:00' }),
        task({ id: 'c', dueAt: '2026-07-30T08:00:00' }),
      ],
      NOW,
    )

    const cells = weeks.flat()
    expect(cells.find((c) => c.key === '2026-07-23')!.tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(cells.find((c) => c.key === '2026-07-30')!.tasks.map((t) => t.id)).toEqual(['c'])
    expect(cells.find((c) => c.key === '2026-07-24')!.tasks).toEqual([])
  })

  it('orders a day cell the same way as the agenda', () => {
    const at = '2026-07-23T09:00:00'
    const weeks = buildMonthGrid(
      new Date('2026-07-01T00:00:00'),
      [
        task({ id: 'a', dueAt: at, taskType: 'watering' }),
        task({ id: 'b', dueAt: at, taskType: 'fertilization' }),
      ],
      NOW,
    )

    const cell = weeks.flat().find((c) => c.key === '2026-07-23')!
    expect(cell.tasks.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('marks the current day', () => {
    const cells = buildMonthGrid(new Date('2026-07-01T00:00:00'), [], NOW).flat()
    expect(cells.filter((c) => c.isToday).map((c) => c.key)).toEqual(['2026-07-23'])
  })

  it('handles a month that starts on a Monday without a leading week', () => {
    // 1 June 2026 is a Monday.
    const weeks = buildMonthGrid(new Date('2026-06-01T00:00:00'), [], NOW)
    expect(weeks[0][0].date.getDate()).toBe(1)
    expect(weeks[0][0].inMonth).toBe(true)
  })
})

describe('dayMarkers', () => {
  function cellFor(tasks: TaskWithPlant[]) {
    return buildMonthGrid(new Date('2026-07-01T00:00:00'), tasks, NOW)
      .flat()
      .find((c) => c.key === '2026-07-23')!
  }

  it('collapses a day to one marker per task type, naming every plant behind it', () => {
    const markers = dayMarkers(
      cellFor([
        task({ id: 'a', dueAt: '2026-07-23T08:00:00' }),
        task({
          id: 'b',
          dueAt: '2026-07-23T09:00:00',
          plantId: 'plant-2',
          plant: { id: 'plant-2', name: 'Ficus', location: null, currentImage: null },
        }),
        task({ id: 'c', dueAt: '2026-07-23T10:00:00', taskType: 'misting' }),
      ]),
    )

    expect(markers).toEqual([
      { taskType: 'watering', plants: ['Monstera', 'Ficus'] },
      { taskType: 'misting', plants: ['Monstera'] },
    ])
  })

  it('ignores settled tasks and never repeats a plant', () => {
    const markers = dayMarkers(
      cellFor([
        task({ id: 'a', dueAt: '2026-07-23T08:00:00', status: 'done' }),
        task({ id: 'b', dueAt: '2026-07-23T09:00:00', status: 'skipped' }),
        task({ id: 'c', dueAt: '2026-07-23T10:00:00', status: 'snoozed' }),
        task({ id: 'd', dueAt: '2026-07-23T11:00:00' }),
      ]),
    )

    expect(markers).toEqual([{ taskType: 'watering', plants: ['Monstera'] }])
  })
})

describe('monthRange', () => {
  it('spans exactly the days the grid draws', () => {
    const { from, to } = monthRange(new Date('2026-07-01T00:00:00'))

    expect(dayKey(from)).toBe('2026-06-29')
    expect(dayKey(to)).toBe('2026-08-02')
    expect(to.getHours()).toBe(23)
  })
})
