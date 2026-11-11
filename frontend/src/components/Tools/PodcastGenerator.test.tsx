import { required } from '../../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const stream = vi.hoisted(() => ({ emit: (_event: unknown) => {}, fail: false }))
vi.mock('../../lib/api', () => ({
  podcastStart: async () => { if (stream.fail) throw new Error('Failed to fetch'); return { pid: '1' } },
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
    await act(async () => { stream.emit({ type: 'script', data: { segments: [{ spk: 'A', md: 'Bonjour !' }, { spk: 'B', md: 'Bonjour à toi.' }] } }); stream.emit({ type: 'audio', file: '/podcast.mp3' }); stream.emit({ type: 'done' }) })
    await act(async () => { vi.advanceTimersByTime(120001) })
    expect(host.textContent).toContain('Terminé')
    expect(host.textContent).not.toContain('prend trop de temps')
    expect(host.textContent).toContain('Intervenant A : Bonjour !')
    expect(host.textContent).toContain('Intervenant B : Bonjour à toi.')
  } finally {
    act(() => root.unmount()); host.remove(); vi.useRealTimers()
  }
})


test('une panne du fournisseur est expliquée et permet de réessayer', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'error', error: 'provider HTTP 403' }) })
    expect(host.textContent).toContain('Impossible de créer le podcast. Réessaie.')
    expect(host.textContent).not.toContain('403')
    expect(host.querySelector('button')?.disabled).toBe(false)
  } finally { act(() => root.unmount()); host.remove() }
})

test('une panne réseau est expliquée en français', async () => {
  stream.fail = true
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'error', error: 'stream_error' }) })
    await act(async () => { required(host.querySelector('button')).click() })
    expect(host.textContent).toContain('Impossible de créer le podcast. Réessaie.')
    expect(host.textContent).not.toContain('Failed to fetch')
    expect(host.querySelector('button')?.disabled).toBe(false)
  } finally { stream.fail = false; act(() => root.unmount()); host.remove() }
})
