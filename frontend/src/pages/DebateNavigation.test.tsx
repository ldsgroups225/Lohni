// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Debate from './Debate'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('retour ferme le bilan et permet de relire le debat', async () => {
  const sockets: FakeSocket[] = []
  class FakeSocket {
    onmessage: ((event: { data: string }) => void) | null = null
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    url: string
    constructor(url: string) { this.url = url; sockets.push(this) }
    close() {}
    sendEvent(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  }
  vi.stubGlobal('WebSocket', FakeSocket)
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true, session: { topic: 'Sujet', position: 'for', messages: [{ role: 'user', content: 'Argument', timestamp: 1 }] } }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  const analyzeCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/analyze')).length
  Element.prototype.scrollIntoView = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/debate', element: <Debate /> }], { initialEntries: ['/debate?debateId=1'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.querySelector('textarea')?.placeholder).toBe('Écris ton argument…')
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Terminer le débat'))!.click())
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Terminer')!.click())
    expect(host.textContent).toContain('Analyse du débat')
    expect(sockets[1].url).toMatch(/^ws:\/\/.+\/ws\/debate\/analyze\?debateId=1$/)
    // The server only streams the analysis to sockets already registered.
    expect(analyzeCalls()).toBe(0)
    await act(async () => sockets[1].sendEvent({ type: 'ready', debateId: '1' }))
    expect(analyzeCalls()).toBe(1)
    await act(async () => sockets[1].sendEvent({ type: 'complete', analysis: { winner: 'user', reason: 'Bravo', overallAssessment: 'Bilan', userStrengths: [], aiStrengths: [], userWeaknesses: [], aiWeaknesses: [], keyMoments: [] } }))
    expect(host.textContent).toContain('Bilan')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).not.toContain('Bilan')
    expect(host.querySelector('textarea')?.disabled).toBe(false)
    await act(async () => sockets[1].sendEvent({ type: 'complete', analysis: { winner: 'user' } }))
    expect(host.querySelector('textarea')?.disabled).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove(); vi.unstubAllGlobals() }
})

test('les erreurs de transport du débat restent compréhensibles', async () => {
  let socket: { onmessage: ((event: { data: string }) => void) | null; close: () => void }
  class FakeSocket {
    onmessage: ((event: { data: string }) => void) | null = null
    constructor() { socket = this }
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('http 500: provider failure')))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/debate', element: <Debate /> }], { initialEntries: ['/debate?debateId=1'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Impossible de charger le débat')
    expect(host.textContent).not.toContain('http 500')
    await act(async () => socket.onmessage?.({ data: JSON.stringify({ type: 'error', error: 'provider failure' }) }))
    expect(host.textContent).toContain('Erreur de connexion')
    expect(host.textContent).not.toContain('provider failure')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); vi.unstubAllGlobals() }
})
