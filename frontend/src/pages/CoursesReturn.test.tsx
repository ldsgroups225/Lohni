// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Courses from './Courses'

const api = vi.hoisted(() => ({ chapters: vi.fn(), progress: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: { minimumSeenRatio: 0.5 } }))
vi.mock('../components/Chat/MarkdownView', () => ({ default: ({ md }: { md: string }) => <span>{md}</span> }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('au retour les cours et Plus ouvert sont affichés avant la revalidation', async () => {
  sessionStorage.clear()
  api.chapters.mockResolvedValueOnce([{ id: '1', subject: 'Mathématiques', title: 'Les suites', status: 'En cours', origin: 'ai', mastery: null, seenCards: 0, cards: [], summary: '' }]).mockReturnValue(new Promise(() => {}))
  api.progress.mockResolvedValueOnce({ xp: 10, streak: 1 }).mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }, { path: '/quiz', element: <p>Quiz</p> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Les suites')
    const details = [...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Plus')!
    await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')) })
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Les suites')
    expect([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Plus')?.open).toBe(true)
    expect(host.textContent).not.toContain('On prépare tes cours…')
  } finally {
    act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear()
  }
})
