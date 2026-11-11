// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const stream = vi.hoisted(() => ({ emit: (_event: unknown) => {} }))
vi.mock('../../lib/api', () => ({
  podcastStart: async () => ({ pid: '1' }),
  connectPodcastStream: (_id: string, emit: (event: unknown) => void) => { stream.emit = emit; return { close: () => {} } },
}))
import PodcastGenerator from './PodcastGenerator'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('un podcast terminé ne devient pas une erreur après le délai maximal', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'audio', file: '/podcast.mp3' }); stream.emit({ type: 'done' }) })
    await act(async () => { vi.advanceTimersByTime(120001) })
    expect(host.textContent).toContain('Terminé')
    expect(host.textContent).not.toContain('prend trop de temps')
  } finally {
    act(() => root.unmount()); host.remove(); vi.useRealTimers()
  }
})
