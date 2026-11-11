import { required } from '../../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
vi.mock('../../lib/api', () => ({ transcribeAudio: vi.fn() }))
import Transcriber from './Transcriber'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le retour ferme le micro et libère un accès autorisé tardivement', async () => {
  let resolve!: (stream: MediaStream) => void
  const stop = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise<MediaStream>(r => { resolve = r }) } })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/tools', element: <Transcriber /> }], { initialEntries: ['/tools'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Enregistrer ma voix'))).click())
    expect(host.textContent).not.toContain('Audio en texte')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Audio en texte')
    await act(async () => resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream))
    expect(stop).toHaveBeenCalledOnce()
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
