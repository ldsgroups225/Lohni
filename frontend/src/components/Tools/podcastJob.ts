import { connectPodcastStream, podcastCancel, podcastStart, type PodcastEvent } from '../../lib/api'
import { runTask } from '../../lib/taskRun'

type Segment = { spk: string; md: string; id: number }
type State = { topic: string; busy: boolean; status: string; audioFile: string | null; audioFilename: string; transcript: Segment[] }
const initial: State = { topic: '', busy: false, status: '', audioFile: null, audioFilename: 'podcast.mp3', transcript: [] }
let state = initial
let pid: string | null = null
let task: ReturnType<typeof runTask<PodcastEvent>> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const update = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(listener => { listener() }) }
const cancelFailed = 'Impossible d’annuler la création. Vérifie ta connexion.'
export const podcastJob = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  snapshot: () => state,
  topic: (topic: string) => update({ topic }),
  playbackError: () => update({ status: "Impossible de lire ce podcast." }),
  reset: () => { state = initial; pid = null; listeners.forEach(listener => { listener() }) },
  attach(id: string, topic: string) {
    if (pid === id) return
    if (task) void this.cancel()
    pid = id
    update({ ...initial, topic, busy: true, status: 'Connexion au générateur de podcast…' })
    launch(async () => id)
  },
  async start(topic: string, duration: 'short' | 'long') {
    pid = null
    update({ ...initial, topic, busy: true, status: 'Démarrage…' })
    launch(async () => (await podcastStart({ topic, duration })).pid)
  },
  async cancel() {
    const current = task
    if (!current) return
    clearTimeout(timer); task = null; pid = null
    current.cancel()
    update({ busy: false, status: '', audioFile: null })
  },
}
function launch(start: () => Promise<string>) {
  const mine: typeof task = runTask<PodcastEvent>({
    start,
    connect: connectPodcastStream,
    cancel: podcastCancel,
    streamError: 'Impossible de créer le podcast. Réessaie.',
    onId: id => { pid = id },
    onStartError: () => { task = null; update({ busy: false, status: 'Impossible de créer le podcast. Réessaie.' }) },
    onCancelError: () => { if (!task) update({ status: cancelFailed }) },
    onEvent: (ev: PodcastEvent) => {
      if (ev.type === 'ready' || ev.type === 'phase') update({ status: 'Écriture du script…' })
      if (ev.type === 'script') {
        const segments = (ev.data as { segments?: unknown })?.segments
        update({ transcript: Array.isArray(segments) ? segments.filter(s => typeof s?.md === 'string').map((s, id) => ({ spk: s.spk, md: s.md, id })) : [], status: 'Création de l’audio…' })
      }
      if (ev.type === 'audio') update({ audioFile: ev.file || ev.staticUrl || null, audioFilename: ev.filename || 'podcast.mp3' })
      if (ev.type === 'done' || ev.type === 'error') {
        clearTimeout(timer); task = null
        update(ev.type === 'done' ? { status: 'Terminé', busy: false } : { status: ev.code === 'tts_error' || ev.error === 'tts_error' ? 'La synthèse vocale est indisponible. Réessaie dans un moment.' : 'Impossible de créer le podcast. Réessaie.', busy: false, audioFile: null })
      }
    },
  })
  task = mine
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (task !== mine) return
    void podcastJob.cancel().then(() => update({ status: 'La création prend trop de temps. Réessaie.' }))
  }, 120000)
}
