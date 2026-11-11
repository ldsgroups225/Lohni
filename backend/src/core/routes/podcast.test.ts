import { expect, test, vi } from 'vitest'
import { podcastRoutes } from './podcast'
import { makeScript } from '../../services/podcast'

vi.mock('../../services/podcast', () => ({ makeScript: vi.fn(), makeAudio: vi.fn() }))

test('une panne du fournisseur est journalisée et renvoyée en français', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = { ws: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, post: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, get: () => {} }
  const cause = new Error('provider HTTP 403')
  vi.mocked(makeScript).mockRejectedValueOnce(cause)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    podcastRoutes(app)
    let pid = ''
    await handlers['/podcast']({ body: { topic: 'Fractions' } }, { status: () => ({ send: (data: { pid: string }) => { pid = data.pid } }) }, vi.fn())
    const send = vi.fn()
    const sendClosed = vi.fn()
    let close = () => {}
    handlers['/ws/podcast']({ send: sendClosed, on: (event: string, callback: () => void) => { if (event === 'close') close = callback }, readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    handlers['/ws/podcast']({ send, on: vi.fn(), readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    close()
    await vi.advanceTimersByTimeAsync(100)
    expect(log).toHaveBeenCalledWith(expect.any(String), cause)
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', error: 'Impossible de créer le podcast. Réessaie.' }))
    expect(sendClosed).not.toHaveBeenCalledWith(JSON.stringify({ type: 'error', error: 'Impossible de créer le podcast. Réessaie.' }))
  } finally { log.mockRestore(); vi.useRealTimers() }
})
