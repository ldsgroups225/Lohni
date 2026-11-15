import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DaySlots from './DaySlots'
import type { PlannerSlot, PlannerTask } from '../../lib/api'

const at = (h: number, m: number) => new Date(2026, 10, 19, h, m).getTime()
const slot = (id: string, kind: PlannerSlot['kind'], start: number, end: number) => ({ id, taskId: 't1', kind, start, end }) as PlannerSlot
const tasks = { t1: { id: 't1', title: 'Contrôle de maths jeudi prochain, chapitre fractions' } as PlannerTask }

test('un créneau affiche son type et ses heures ensemble, sans répéter la date du jour', () => {
  const html = renderToStaticMarkup(<DaySlots date="2026-11-19" slots={[slot('a', 'focus', at(8, 0), at(8, 25))]} tasks={tasks} />)
  expect(html).toContain('jeudi 19 novembre')
  const pill = (html.match(/<span[^>]*data-slot-kind[^>]*>(.*?)<\/span>/)?.[1] ?? '').replace(/<[^>]+>/g, '')
  expect(pill).toContain('Concentration')
  expect(pill).toContain('08:00 – 08:25')
  expect(html).not.toContain('19 nov.')
  expect(html).toContain('Contrôle de maths jeudi prochain, chapitre fractions')
})

test('un jour sans créneau le dit', () => {
  expect(renderToStaticMarkup(<DaySlots date="2026-11-18" slots={[]} tasks={{}} />)).toContain('Aucun créneau')
})
