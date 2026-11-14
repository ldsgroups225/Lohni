// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
import { connectExamStream } from '../lib/api'

test('une fermeture inattendue du flux signale une erreur, mais pas une fermeture volontaire ou après la fin', () => {
  class Socket {
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null
    close() { this.onclose?.() }
  }
  vi.stubGlobal('WebSocket', Socket)
  try {
    const emit = vi.fn()
    const interrupted = connectExamStream('1', emit)
    ;(interrupted.ws as unknown as Socket).onclose?.()
    expect(emit).toHaveBeenCalledWith({ type: 'error', error: 'stream_error' })
    emit.mockClear()
    const finished = connectExamStream('2', emit)
    ;(finished.ws as unknown as Socket).onmessage?.({ data: JSON.stringify({ type: 'done' }) })
    ;(finished.ws as unknown as Socket).onclose?.()
    expect(emit).toHaveBeenCalledTimes(1)
    emit.mockClear()
    connectExamStream('3', emit).close()
    expect(emit).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})

test('la fermeture du flux podcast en cours de génération signale tout de suite une erreur', async () => {
  const { connectPodcastStream } = await import('../lib/api')
  class Socket { onmessage = null; onerror = null; onclose: (() => void) | null = null; constructor(public url: string) {} close() {} }
  vi.stubGlobal('WebSocket', Socket)
  try {
    const emit = vi.fn()
    const stream = connectPodcastStream('p1', emit)
    expect((stream.ws as unknown as Socket).url).toContain('/ws/podcast?pid=p1')
    ;(stream.ws as unknown as Socket).onclose?.()
    expect(emit).toHaveBeenCalledWith({ type: 'error', error: 'stream_error' })
  } finally { vi.unstubAllGlobals() }
})
