// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Plan from './Plan'
import { PlanToday } from '../components/Revision/PlanToday'

const api = vi.hoisted(() => ({ plan: vi.fn(), settings: async () => ({ dailyMinutes: 15, restDays: [] }) }))
vi.mock('../lib/api', () => ({ revisionAPI: api }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test.each([['accueil', PlanToday], ['plan', Plan]] as const)('%s date seulement la copie hors ligne', async (_name, Screen) => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const plan = { today: '2026-11-09', exams: [], days: [] }
  try {
    api.plan.mockResolvedValue({ plan, offline: false })
    await act(async () => root.render(<MemoryRouter><Screen /></MemoryRouter>))
    expect(host.textContent).not.toContain('Plan du')
    await act(async () => root.render(<MemoryRouter><span /></MemoryRouter>))
    api.plan.mockResolvedValue({ plan, offline: true })
    await act(async () => root.render(<MemoryRouter><Screen /></MemoryRouter>))
    expect(host.textContent).toContain('Plan du 9 novembre 2026')
  } finally { act(() => root.unmount()); host.remove() }
})
