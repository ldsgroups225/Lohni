// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Planner from './Planner'
import * as api from '../../lib/api'

vi.mock('../../lib/api', () => ({
  connectPlannerStream: () => ({ ws: {}, close: () => {} }),
  plannerList: vi.fn(async () => ({ ok: true, tasks: [] })),
  plannerWeekly: vi.fn(async () => ({ ok: true, plan: { days: [] } })),
  plannerIngest: vi.fn(),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => { act(() => root.render(null)) })

async function submit(text: string) {
  const input = container.querySelector('input[aria-label="Nouvelle tâche"]') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Ajouter la tâche')!
  await act(async () => { button.click() })
  return input
}

test('un échec d’ajout affiche un message français et garde le texte saisi', async () => {
  vi.mocked(api.plannerIngest).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await act(async () => root.render(<Planner />))
  const input = await submit('Maths demain')
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('La tâche n’a pas pu être ajoutée')
  expect(input.value).toBe('Maths demain')
})

test('un message du serveur est affiché tel quel, puis efface le champ au succès', async () => {
  vi.mocked(api.plannerIngest).mockRejectedValueOnce(new Error('Le planning est indisponible. Réessaie dans un instant.'))
  await act(async () => root.render(<Planner />))
  await submit('Maths')
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Le planning est indisponible. Réessaie dans un instant.')
  vi.mocked(api.plannerIngest).mockResolvedValueOnce({ ok: true, task: { id: '1', title: 'Maths', dueAt: '2026-11-20T10:00:00Z', estMins: 30, priority: 3, status: 'todo' } } as any)
  const input = await submit('Maths')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(input.value).toBe('')
})
