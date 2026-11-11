import { expect, test, vi } from 'vitest'
import { podcastRoutes } from './podcast'
import { makeScript } from '../../services/podcast'

vi.mock('../../services/podcast', () => ({ makeScript: vi.fn(), makeAudio: vi.fn() }))

test('une panne du fournisseur est journalisée et renvoyée en français', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, Function> = {}
  const app = { ws: (path: string, handler: Function) => { handlers[path] = handler }, post: (path: string, handler: Function) => { handlers[path] = handler }, get: () => {} }
  const cause = new Error('provider HTTP 403')
  vi.mocked(makeScript).mockRejectedValueOnce(cause)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    podcastRoutes(app)
    let pid = ''
    await handlers['/podcast']({ body: { topic: 'Fractions' } }, { status: () => ({ send: (data: { pid: string }) => { pid = data.pid } }) }, vi.fn())
    const send = vi.fn()
    handlers['/ws/podcast']({ send, on: vi.fn(), readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    await vi.advanceTimersByTimeAsync(100)
    expect(log).toHaveBeenCalledWith(expect.any(String), cause)
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', error: 'Impossible de créer le podcast. Réessaie.' }))
  } finally { log.mockRestore(); vi.useRealTimers() }
})
