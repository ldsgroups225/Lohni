import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { weeklyPlan } from './scheduler'
import type { Task } from './types'

const zone = process.env.TZ
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone })

const slot = (start: string) => ({ id: start, taskId: 't', start, end: start, kind: 'focus' as const })
const plan = (...starts: string[]) => weeklyPlan([{ id: 't', plan: { slots: starts.map(slot) } } as unknown as Task], { pomodoroMins: 25, breakMins: 5, maxDailyMins: 240 })

test('la semaine commence au jour local, pas au jour UTC', () => {
  process.env.TZ = 'Asia/Tokyo'
  vi.setSystemTime(new Date('2026-11-14T10:00:00+09:00'))
  expect(plan().days.map(d => d.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
})

test('un créneau tard le jour du changement d’heure reste dans ce jour', () => {
  process.env.TZ = 'Europe/Paris'
  vi.setSystemTime(new Date('2026-10-25T00:30:00+02:00'))
  const week = plan('2026-10-25T23:30:00+01:00', '2026-10-26T00:30:00+01:00')
  expect(week.days.map(d => d.slots.length)).toEqual([1, 1, 0, 0, 0, 0, 0])
  expect(week.days[1].date).toBe('2026-10-26')
})
