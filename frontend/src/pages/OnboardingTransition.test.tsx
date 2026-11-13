// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { required } from '../test/required'
import { navigationTransitions } from '../navigationTransitions'
import { routes } from '../routes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)

test('après la création des cartes, la première carte apparaît sans rechargement', async () => {
  const transitions: Array<{ skipTransition: () => void }> = []
  const startTransition = vi.fn((callback: () => Promise<void>) => {
    let start!: () => void
    const finished = new Promise<void>(resolve => { start = () => { void Promise.resolve(callback()).then(resolve) } })
    const transition = { finished, ready: finished, updateCallbackDone: finished, skipTransition: start }
    transitions.push(transition)
    return transition
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startTransition })
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem('lohni-device-id', '11111111-1111-4111-8111-111111111111')
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, fn: () => void) => fn() } })
  const profile = { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] }
  let saved = false
  let finishGeneration!: () => void
  const generation = new Promise<void>(resolve => { finishGeneration = resolve })
  const cards = Array.from({ length: 10 }, (_, i) => ({ id: String(i), chapterId: 'c', kind: 'basic', question: 'Question de révision ?', answer: 'Réponse' }))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname.split('/revision')[1]
    let data: unknown = null
    if (path === '/profile' && init.method === 'PUT') { saved = true; data = profile }
    else if (path === '/profile') data = saved ? profile : null
    else if (path === '/chapters' && init.method === 'POST') { await generation; data = { id: 'c' } }
    else if (path === '/chapters') data = [{ id: 'c', title: 'Les suites arithmétiques', subject: 'Mathématiques' }]
    else if (path === '/home' && saved) data = { profile, totalCards: 10, cardCount: 10, state: 'ready', estimatedMinutes: 5 }
    else if (path === '/session') data = { id: 's', localDate: '2026-11-13', position: 0, complete: false, cards }
    else if (path === '/exams') data = []
    else if (path === '/progress') data = { xp: 0, streak: 0, learnedCards: 0, subjects: [] }
    return new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } })
  }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  window.history.replaceState(null, '', '/')
  const router = navigationTransitions(createBrowserRouter(routes))
  const submit = async () => { await act(async () => { required(host.querySelector('form')).requestSubmit() }) }
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await vi.waitFor(() => expect(host.textContent).toContain('Choisis ta langue et ton pays'))
    await submit(); await submit()
    await act(async () => required([...host.querySelectorAll('button')].find(b => b.textContent === 'Terminale')).click())
    await act(async () => required([...host.querySelectorAll('button')].find(b => b.textContent === 'D')).click())
    await submit(); await submit(); await submit()
    const input = required(host.querySelector<HTMLInputElement>('input[placeholder]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(input, 'Les suites arithmétiques'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await submit()
    expect(host.textContent).toContain('Préparation de tes')
    await act(async () => { finishGeneration(); await generation })
    await vi.waitFor(() => expect(host.textContent).toContain('Question de révision ?'))
    expect(router.state.location.pathname).toBe('/revision')
    expect(host.textContent).toContain('1/10')
  } finally { await act(async () => { transitions.forEach(transition => { transition.skipTransition() }); root.unmount() }); router.dispose(); host.remove(); vi.unstubAllGlobals(); delete (document as Partial<Document>).startViewTransition; localStorage.clear(); sessionStorage.clear() }
}, 15000)
