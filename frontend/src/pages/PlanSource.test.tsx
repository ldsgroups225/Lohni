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

test.each([['accueil', PlanToday], ['plan', Plan]] as const)('%s affiche la journée chargée du plan hors ligne', async (_name, Screen) => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  api.plan.mockResolvedValue({ offline: true, plan: { today: '2026-11-09', exams: [{ id: 'e', title: 'Brevet', date: '2026-11-12' }], days: [{ date: '2026-11-09', heavy: true, overloaded: false, rest: false, capacityCards: 10, items: [], actions: [] }] } })
  try {
    await act(async () => root.render(<MemoryRouter><Screen /></MemoryRouter>))
    expect(host.textContent).toContain('Grosse journée de cours')
  } finally { act(() => root.unmount()); host.remove() }
})


test.each([['accueil', PlanToday], ['plan', Plan]] as const)('%s distingue surcharge et cours, sans afficher zéro carte à revoir', async (_name, Screen) => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  api.plan.mockResolvedValue({ offline: true, plan: { today: '2026-11-09', exams: [{ id: 'e', title: 'Brevet', date: '2026-11-12' }], days: [{ date: '2026-11-09', heavy: true, overloaded: true, rest: false, capacityCards: 10, items: [{ chapterId: 'c', chapterTitle: 'Cours', subject: 'Maths', dueCards: 0, newCards: 3, minutes: 3 }], actions: [{ kind: 'addChapter', subject: 'Anglais' }] }] } })
  try {
    await act(async () => root.render(<MemoryRouter><Screen /></MemoryRouter>))
    expect(host.textContent).toContain('Grosse journée de cours')
    expect(host.textContent).toContain('Trop de cartes prévues ce jour')
    expect(host.textContent).not.toContain('0 carte à revoir')
    expect(host.textContent).toContain('Sans chapitre : Anglais')
    expect(host.textContent).not.toContain('Ajoute un chapitre')
    expect([...host.querySelectorAll('a')].filter(link => link.textContent === 'Ajouter un chapitre')).toHaveLength(1)
  } finally { act(() => root.unmount()); host.remove() }
})

test('plan : une seule phrase « Sans chapitre » pour toute la page, rien si tout est couvert', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const day = (date: string, subjects: string[]) => ({ date, heavy: false, overloaded: false, rest: false, capacityCards: 10, items: [], actions: subjects.map(subject => ({ kind: 'addChapter', subject })) })
  try {
    api.plan.mockResolvedValue({ offline: false, plan: { today: '2026-11-09', exams: [], days: [day('2026-11-09', ['Français', 'Anglais']), day('2026-11-10', ['Français'])] } })
    await act(async () => root.render(<MemoryRouter><Plan /></MemoryRouter>))
    expect(host.textContent?.match(/Sans chapitre/g)).toHaveLength(1)
    expect(host.textContent).toContain('Sans chapitre : Français, Anglais')
    api.plan.mockResolvedValue({ offline: false, plan: { today: '2026-11-09', exams: [], days: [day('2026-11-09', [])] } })
    await act(async () => root.render(<MemoryRouter><span /></MemoryRouter>))
    await act(async () => root.render(<MemoryRouter><Plan /></MemoryRouter>))
    expect(host.textContent).not.toContain('Sans chapitre')
  } finally { act(() => root.unmount()); host.remove() }
})
