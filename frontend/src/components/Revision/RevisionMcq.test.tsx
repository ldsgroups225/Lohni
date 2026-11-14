// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const api = vi.hoisted(() => {
  const session = { id: '1', complete: false, position: 0, cards: [{ id: '1', chapterId: 'c', kind: 'mcq', question: 'Question ?', answer: 'Explication', options: ['Une', 'Deux'], correct: 1 }] }
  return { session, answer: vi.fn(async () => ({ ...session, position: 1 })) }
})
vi.mock('../../lib/api', () => ({
  revisionAPI: { profile: async () => ({ schoolClass: '3e', subjects: ['Mathématiques'] }), session: async () => api.session, chapters: async () => [], answer: api.answer },
  revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }), syncRevisionAnswers: () => {}, chatJSON: async () => ({ chatId: '1' }),
}))
import Revision from '../../pages/Revision'
import { revisionAPI as revisionDouble } from '../../lib/api'
import { revisionCacheDouble } from '../../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('les flèches ne répondent pas et une réponse au clavier mène à Continuer', async () => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  window.scrollTo = vi.fn()
  const scroll = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/revision', element: <Revision /> }], { initialEntries: ['/revision'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    const options = host.querySelectorAll<HTMLButtonElement>('fieldset button[aria-pressed]')
    expect(options).toHaveLength(2)
    options[0].focus()
    await act(async () => options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(api.answer).not.toHaveBeenCalled()
    await act(async () => options[0].click())
    expect(api.answer).toHaveBeenCalledOnce()
    expect([...options].every(option => option.disabled)).toBe(true)
    expect(document.activeElement?.textContent).toBe('Continuer')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); Element.prototype.scrollIntoView = scroll }
})
