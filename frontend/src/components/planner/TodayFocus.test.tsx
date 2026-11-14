// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import TodayFocus from './TodayFocus'
import type { PlannerTask } from '../../lib/api'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const zone = process.env.TZ
const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => {
  act(() => root.render(null))
  vi.useRealTimers()
  if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone
})

const task = (title: string, dueAt: string): PlannerTask => ({ id: title, title, dueAt: Date.parse(dueAt), estMins: 30, priority: 3, status: 'todo', createdAt: 0, updatedAt: 0 })

test('« Pour aujourd’hui » suit le jour local de l’élève, pas le jour UTC', () => {
  process.env.TZ = 'Asia/Tokyo'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00+09:00'))
  act(() => root.render(<TodayFocus tasks={[task('Maths', '2026-11-14T18:00:00+09:00'), task('Anglais', '2026-11-13T18:00:00+09:00')]} onStartSession={() => {}} onCompleteTask={() => {}} />))
  expect(container.textContent).toContain('Pour aujourd’hui (1)')
  expect(container.textContent).toContain('Maths')
  expect(container.textContent).not.toContain('Anglais')
})
