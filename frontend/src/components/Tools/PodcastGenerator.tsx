import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { useLocation } from "react-router-dom"
import { revisionAPI, type RevisionChapter } from "../../lib/api"
import { podcastJob } from "./podcastJob"

export default function PodcastGenerator() {
  const location = useLocation()
  const { topic, busy, status, audioFile, audioFilename, transcript } = useSyncExternalStore(podcastJob.subscribe, podcastJob.snapshot)
  const [duration, setDuration] = useState<'short' | 'long'>('short')
  const [chapters, setChapters] = useState<RevisionChapter[]>([])
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [total, setTotal] = useState(0)
  const [rate, setRate] = useState(1)
  const transcriptId = useId()
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    let active = true
    revisionAPI.chapters().then(value => { if (active) setChapters(value) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (location.state?.podcastPid) podcastJob.attach(location.state.podcastPid, location.state.podcastTopic || '')
  }, [location.state])

  function reset() { podcastJob.reset(); setElapsed(0); setTotal(0); setPlaying(false); setRate(1) }
  function time(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` }
  const chip = 'min-h-11 rounded-xl border border-border bg-surface px-4 font-semibold text-foreground'

  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold text-foreground">Podcast</h2>
      {!busy && !audioFile && <>
        <p className="text-muted">Écoute ton cours comme une conversation, où tu veux.</p>
        <div>
          <label htmlFor="podcast-topic" className="mb-2 block text-sm font-semibold text-foreground">Sujet ou notes</label>
          <textarea id="podcast-topic" value={topic} onChange={e => podcastJob.topic(e.target.value)} placeholder="Ex. : la photosynthèse, ou colle tes notes" className="h-28 w-full resize-none rounded-2xl border border-border bg-surface p-4 text-foreground" />
          <div className="mt-2 flex flex-wrap gap-2">{chapters.map(chapter => <button key={chapter.id} type="button" className={chip} onClick={() => podcastJob.topic(chapter.summary || chapter.title)}>Depuis {chapter.title}</button>)}</div>
        </div>
        <fieldset><legend className="mb-2 text-sm font-semibold text-foreground">Durée</legend><div className="flex gap-2">{(['short', 'long'] as const).map(value => <button key={value} type="button" aria-pressed={duration === value} onClick={() => setDuration(value)} className={`${chip} flex-1 ${duration === value ? 'border-primary bg-tint text-primary' : ''}`}>{value === 'short' ? 'Court' : 'Détaillé'}</button>)}</div></fieldset>
        {status && <p role="alert" className="text-foreground">{status}</p>}
        <button type="button" onClick={() => void podcastJob.start(topic, duration)} disabled={!topic.trim()} className="ui-button min-h-14 w-full disabled:opacity-50">Créer le podcast</button>
        <p className="text-center text-sm text-muted">{topic.trim() ? 'Environ une minute de création' : 'Écris un sujet pour continuer'}</p>
      </>}
      {busy && <div className="space-y-5 py-12 text-center"><div role="status"><p className="text-xl font-bold">{status}</p><p className="mt-2 text-muted">Ça peut prendre une minute. Tu peux quitter l’écran.</p></div><progress aria-label="Création du podcast" className="w-full" /><button type="button" onClick={() => void podcastJob.cancel()} className="min-h-11 px-4 font-semibold text-primary underline">Annuler</button></div>}
      {!busy && audioFile && <>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Podcast prêt</p><h2 className="mt-1 text-xl font-bold text-foreground">{topic}</h2>
          {/* biome-ignore lint/a11y/useMediaCaption: La transcription est disponible ci-dessous, sans minutage audio fiable. */}
          <audio ref={audio} src={audioFile} aria-describedby={transcript.length ? transcriptId : undefined} onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)} onLoadedMetadata={e => setTotal(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          <div className="mt-5 flex items-center gap-4"><button type="button" aria-label={playing ? 'Mettre en pause' : 'Lire le podcast'} onClick={() => { if (audio.current?.paused) void audio.current.play().catch(podcastJob.playbackError); else audio.current?.pause() }} className="h-16 w-16 shrink-0 rounded-full bg-primary text-2xl text-on-primary">{playing ? '❚❚' : '▶'}</button><div className="flex-1"><progress aria-label="Progression de lecture" value={elapsed} max={total || 1} className="w-full" /><div className="flex justify-between text-sm text-muted"><span>{time(elapsed)}</span><span>{time(total)}</span></div></div></div>
          <div className="mt-3 flex gap-2"><button type="button" className={`${chip} flex-1`} aria-label="Reculer de 15 secondes" onClick={() => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 15) }}>−15 s</button><button type="button" className={`${chip} flex-1`} aria-label="Avancer de 15 secondes" onClick={() => { if (audio.current) audio.current.currentTime = Math.min(audio.current.duration || 0, audio.current.currentTime + 15) }}>+15 s</button><button type="button" className={`${chip} flex-1`} aria-label="Vitesse de lecture" onClick={() => { const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1; setRate(next); if (audio.current) audio.current.playbackRate = next }}>{String(rate).replace('.', ',')}×</button></div>
        </div>
        {status && status !== 'Terminé' && <p role="alert">{status}</p>}
        {transcript.length > 0 && <details id={transcriptId} className="rounded-2xl border border-border bg-surface px-4"><summary className="min-h-14 cursor-pointer py-4 font-semibold">Lire la transcription</summary><div className="space-y-3 pb-4">{transcript.map((segment) => <p key={segment.id}><strong>Intervenant {segment.spk === 'B' ? 'B' : 'A'} : </strong>{segment.md}</p>)}</div></details>}
        <a href={audioFile} download={audioFilename} className="ui-button flex min-h-14 w-full items-center justify-center">Télécharger</a><button type="button" onClick={reset} className="min-h-14 w-full rounded-2xl border-2 border-primary bg-surface font-bold text-primary">Créer un autre podcast</button>
      </>}
    </section>
  )
}
