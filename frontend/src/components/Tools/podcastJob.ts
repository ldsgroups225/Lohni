import { connectPodcastStream, podcastCancel, podcastStart, type PodcastEvent } from '../../lib/api'

type Segment = { spk: string; md: string; id: number }
type State = { topic: string; busy: boolean; status: string; audioFile: string | null; audioFilename: string; transcript: Segment[] }
const initial: State = { topic: '', busy: false, status: '', audioFile: null, audioFilename: 'podcast.mp3', transcript: [] }
let state = initial
let pid: string | null = null
let controller: AbortController | null = null
let close = () => {}
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const update = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(listener => { listener() }) }
export const podcastJob = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  snapshot: () => state,
  topic: (topic: string) => update({ topic }),
  playbackError: () => update({ status: "Impossible de lire ce podcast." }),
  reset: () => { state = initial; pid = null; listeners.forEach(listener => { listener() }) },
  attach(id: string, topic: string) {
    if (pid === id) return
    if (controller) void this.cancel()
    pid = id
    controller = new AbortController()
    update({ ...initial, topic, busy: true, status: 'Connexion au générateur de podcast…' })
    connect(id, controller)
  },
  async start(topic: string, duration: 'short' | 'long') {
    const current = new AbortController()
    controller = current
    pid = null
    update({ ...initial, topic, busy: true, status: 'Démarrage…' })
    try {
      const result = await podcastStart({ topic, duration })
      if (current.signal.aborted) {
        try { await podcastCancel(result.pid) } catch { if (!controller) update({ status: "Impossible d’annuler la création. Vérifie ta connexion." }) }
        return
      }
      pid = result.pid
      connect(result.pid, current)
    } catch {
      if (!current.signal.aborted) { controller = null; update({ busy: false, status: 'Impossible de créer le podcast. Réessaie.' }) }
    }
  },
  async cancel() {
    const current = controller
    if (!current) return
    const id = pid
    current.abort()
    clearTimeout(timer); close(); controller = null; pid = null
    update({ busy: false, status: '', audioFile: null })
    if (id) {
      try { await podcastCancel(id) } catch { if (!controller) update({ status: 'Impossible d’annuler la création. Vérifie ta connexion.' }) }
    }
  },
}
function connect(id: string, current: AbortController) {
  timer = setTimeout(() => {
    if (current.signal.aborted) return
    void podcastJob.cancel().then(() => update({ status: 'La création prend trop de temps. Réessaie.' }))
  }, 120000)
  close = connectPodcastStream(id, (ev: PodcastEvent) => {
    if (current.signal.aborted) return
    if (ev.type === 'ready' || ev.type === 'phase') update({ status: 'Écriture du script…' })
    if (ev.type === 'script') {
      const segments = (ev.data as { segments?: unknown })?.segments
      update({ transcript: Array.isArray(segments) ? segments.filter(s => typeof s?.md === 'string').map((s, id) => ({ spk: s.spk, md: s.md, id })) : [], status: 'Création de l’audio…' })
    }
    if (ev.type === 'audio') update({ audioFile: ev.file || ev.staticUrl || null, audioFilename: ev.filename || 'podcast.mp3' })
    if (ev.type === 'done' || ev.type === 'error') {
      clearTimeout(timer); close(); controller = null
      if (ev.type === 'error' && ev.error === 'stream_error') void podcastCancel(id).catch(() => {})
      update(ev.type === 'done' ? { status: 'Terminé', busy: false } : { status: ev.code === 'tts_error' || ev.error === 'tts_error' ? 'La synthèse vocale est indisponible. Réessaie dans un moment.' : 'Impossible de créer le podcast. Réessaie.', busy: false, audioFile: null })
    }
  }).close
}
