import { required } from '../../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const stream = vi.hoisted(() => ({ emit: (_event: unknown) => {}, fail: false, cancelled: [] as string[], start: null as null | (() => Promise<{ pid: string }>) }))
vi.mock('../../lib/api', () => ({
  revisionAPI: { chapters: async () => [] },
  podcastCancel: async (pid: string) => { stream.cancelled.push(pid) },
  podcastStart: async () => { if (stream.fail) throw new Error('Failed to fetch'); return stream.start ? stream.start() : { pid: '1' } },
  connectPodcastStream: (_id: string, emit: (event: unknown) => void) => { stream.emit = emit; return { close: () => {} } },
}))
import PodcastGenerator from './PodcastGenerator'
import { podcastJob } from './podcastJob'
import { afterEach } from 'vitest'

afterEach(() => { podcastJob.reset(); stream.cancelled = []; stream.start = null })

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('un podcast terminé ne devient pas une erreur après le délai maximal', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'script', data: { segments: [{ spk: 'A', md: 'Bonjour !' }, { spk: 'B', md: 'Bonjour à toi.' }] } }); stream.emit({ type: 'audio', file: '/podcast.mp3' }); stream.emit({ type: 'done' }) })
    await act(async () => { vi.advanceTimersByTime(120001) })
    expect(host.textContent).toContain('Podcast prêt')
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
    await act(async () => { required([...host.querySelectorAll('button')].find(button => button.textContent === 'Créer le podcast')).click() })
    expect(host.textContent).toContain('Impossible de créer le podcast. Réessaie.')
    expect(host.textContent).not.toContain('Failed to fetch')
    expect(host.querySelector('button')?.disabled).toBe(false)
  } finally { stream.fail = false; act(() => root.unmount()); host.remove() }
})

test('la saisie explique le bouton désactivé et propose la durée', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><PodcastGenerator /></MemoryRouter>))
    expect(host.textContent).toContain('Écris un sujet pour continuer')
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Créer le podcast')?.disabled).toBe(true)
    expect(host.textContent).toContain('Détaillé')
  } finally { act(() => root.unmount()); host.remove() }
})

test('une erreur de synthèse vocale est expliquée', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'error', error: 'tts_error' }) })
    expect(host.textContent).toContain('La synthèse vocale est indisponible')
  } finally { act(() => root.unmount()); host.remove() }
})

test('le code tts_error accompagné d’un message français est expliqué', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: '1', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'error', error: 'La synthèse vocale est indisponible. Réessaie dans un moment.', code: 'tts_error' }) })
    expect(host.textContent).toContain('La synthèse vocale est indisponible')
  } finally { act(() => root.unmount()); host.remove() }
})

test('le résultat reste disponible après avoir quitté puis rouvert le podcast', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: 'reprise', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => root.render(<MemoryRouter><div>Autre écran</div></MemoryRouter>))
    await act(async () => { stream.emit({ type: 'script', data: { segments: [{ spk: 'A', md: 'Bonjour' }] } }); stream.emit({ type: 'audio', file: '/reprise.mp3' }); stream.emit({ type: 'done' }) })
    await act(async () => root.render(<MemoryRouter><PodcastGenerator /></MemoryRouter>))
    expect(host.textContent).toContain('Podcast prêt')
    expect(host.textContent).toContain('Bonjour')
  } finally { act(() => root.unmount()); host.remove() }
})


test('annuler interrompt la création sur le serveur', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/tools', state: { podcastPid: 'annulation', podcastTopic: 'Fractions' } }]}><PodcastGenerator /></MemoryRouter>))
    await act(async () => { required([...host.querySelectorAll('button')].find(button => button.textContent === 'Annuler')).click() })
    expect(stream.cancelled).toEqual(['annulation'])
    await act(async () => { stream.emit({ type: 'audio', file: '/ignored.mp3' }); stream.emit({ type: 'done' }) })
    expect(host.textContent).not.toContain('Podcast prêt')
  } finally { act(() => root.unmount()); host.remove() }
})


test('annuler pendant le démarrage annule aussi le travail créé tardivement', async () => {
  let complete: (value: { pid: string }) => void = () => {}
  stream.start = () => new Promise(resolve => { complete = resolve })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><PodcastGenerator /></MemoryRouter>))
    const input = required(host.querySelector('textarea'))
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, 'Fractions'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { required([...host.querySelectorAll('button')].find(button => button.textContent === 'Créer le podcast')).click() })
    await act(async () => { required([...host.querySelectorAll('button')].find(button => button.textContent === 'Annuler')).click() })
    await act(async () => complete({ pid: 'retard' }))
    expect(stream.cancelled).toEqual(['retard'])
    expect(host.textContent).not.toContain('Podcast prêt')
  } finally { act(() => root.unmount()); host.remove() }
})
