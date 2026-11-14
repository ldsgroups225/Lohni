import { expect, test, vi } from 'vitest'
import { podcastRoutes } from './podcast'
import { makeAudio, makeScript } from '../../services/podcast'

vi.mock('../../services/podcast', () => ({ makeScript: vi.fn(), makeAudio: vi.fn() }))

test('une panne du fournisseur est journalisée et renvoyée en français', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = { ws: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, post: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, get: () => {}, delete: () => {} }
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

test('annuler un podcast interrompt la génération en cours', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = { ws: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, post: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, delete: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, get: () => {} }
  let signal: AbortSignal | undefined
  vi.mocked(makeScript).mockImplementation((_topic, _content, _duration, providedSignal) => {
    signal = providedSignal
    return new Promise((_resolve, reject) => providedSignal?.addEventListener('abort', () => reject(new Error('annulé'))))
  })
  try {
    podcastRoutes(app)
    let pid = ''
    await handlers['/podcast']({ body: { topic: 'Fractions' } }, { status: () => ({ send: (data: { pid: string }) => { pid = data.pid } }) }, vi.fn())
    handlers['/ws/podcast']({ send: vi.fn(), on: vi.fn(), readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    await vi.advanceTimersByTimeAsync(100)
    handlers['/podcast/:pid']({ params: { pid } }, { send: vi.fn() })
    expect(signal?.aborted).toBe(true)
  } finally { vi.useRealTimers(); vi.mocked(makeScript).mockReset() }
})


test('annuler pendant la synthèse interrompt l’audio', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = { ws: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, post: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, delete: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, get: () => {} }
  let signal: AbortSignal | undefined
  vi.mocked(makeScript).mockResolvedValue({ title: 'Sujet', summary: '', segments: [{ spk: 'A', md: 'Bonjour' }] })
  vi.mocked(makeAudio).mockImplementation((_script, _dir, _base, _emit, providedSignal) => {
    signal = providedSignal
    return new Promise((_resolve, reject) => providedSignal?.addEventListener('abort', () => reject(new Error('annulé'))))
  })
  try {
    podcastRoutes(app)
    let pid = ''
    await handlers['/podcast']({ body: { topic: 'Fractions' } }, { status: () => ({ send: (data: { pid: string }) => { pid = data.pid } }) }, vi.fn())
    handlers['/ws/podcast']({ send: vi.fn(), on: vi.fn(), readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    await vi.advanceTimersByTimeAsync(100)
    handlers['/podcast/:pid']({ params: { pid } }, { send: vi.fn() })
    expect(signal?.aborted).toBe(true)
  } finally { vi.useRealTimers(); vi.mocked(makeScript).mockReset(); vi.mocked(makeAudio).mockReset() }
})

test('annuler un podcast est réservé à l’appareil qui l’a lancé', async () => {
  vi.useFakeTimers()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = { ws: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, post: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, delete: (path: string, handler: (...args: any[]) => any) => { handlers[path] = handler }, get: () => {} }
  let signal: AbortSignal | undefined
  vi.mocked(makeScript).mockImplementation((_topic, _content, _duration, providedSignal) => { signal = providedSignal; return new Promise(() => {}) })
  try {
    podcastRoutes(app)
    let pid = ''
    await handlers['/podcast']({ headers: { 'x-device-id': 'appareil-a' }, body: { topic: 'Fractions' } }, { status: () => ({ send: (data: { pid: string }) => { pid = data.pid } }) }, vi.fn())
    handlers['/ws/podcast']({ send: vi.fn(), on: vi.fn(), readyState: 1 }, { url: `/ws/podcast?pid=${pid}` })
    await vi.advanceTimersByTimeAsync(100)
    const refused = { status: vi.fn().mockReturnThis(), send: vi.fn() }
    handlers['/podcast/:pid']({ headers: { 'x-device-id': 'appareil-b' }, params: { pid } }, refused)
    expect(refused.status).toHaveBeenCalledWith(403)
    expect(refused.send).toHaveBeenCalledWith({ ok: false, error: 'Ce podcast appartient à un autre appareil.' })
    expect(signal?.aborted).toBe(false)
    handlers['/podcast/:pid']({ headers: { 'x-device-id': 'appareil-a' }, params: { pid } }, { status: vi.fn().mockReturnThis(), send: vi.fn() })
    expect(signal?.aborted).toBe(true)
  } finally { vi.useRealTimers(); vi.mocked(makeScript).mockReset() }
})
