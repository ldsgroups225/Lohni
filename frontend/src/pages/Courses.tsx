import { HelpIcon, ClipboardIcon, DebateIcon, HeadphonesIcon, CalendarIcon } from '../components/ui/NavigationIcons'
import { withOccurrenceKeys } from '../lib/occurrenceKeys'
import { cachedDevice, currentRevisionCacheVersion, revisionSnapshot } from '../lib/cachedDevice'
import { Button, ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { confirmDialog } from '../lib/confirm'
import { listDelay } from '../components/ui/revisionPresentation'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import Mascotte from '../components/Mascotte/Mascotte'
import { Progress } from '../components/ui/Progress'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MarkdownView from '../components/Chat/MarkdownView'
import { revisionAPI, revisionPolicy, type RevisionCard, type RevisionCardInput, type RevisionChapter, type RevisionProgress } from '../lib/api'

let cachedCourses: { device: string | null; version: number; day: string; chapters: RevisionChapter[]; progress: RevisionProgress } | null = null

const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

function DeferredDetails({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  return <details onToggle={event => { if (event.currentTarget.open) setOpened(true) }}>
    <summary className="cursor-pointer py-2 text-foreground">{summary}</summary>
    {opened && children}
  </details>
}

function CardEditor({ card, busy, onSave, onCancel }: {
  card: RevisionCard; busy: boolean; onSave: (value: RevisionCardInput) => void; onCancel: () => void
}) {
  const [question, setQuestion] = useState(card.question)
  const [answer, setAnswer] = useState(card.answer)
  const [options, setOptions] = useState(() => (card.options ?? []).map((value, index) => ({ id: String(index), value })))
  const [correct, setCorrect] = useState(card.correct ?? 1)
  const questionInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { questionInput.current?.focus() }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    const content = { question: question.trim(), answer: answer.trim() }
    onSave(card.kind === 'mcq' ? { ...content, kind: 'mcq', options: options.map(option => option.value.trim()), correct } : { ...content, kind: 'basic' })
  }
  return <form onSubmit={submit}>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="mb-4 font-semibold text-foreground">Modifier la carte</legend>
      <label className="block space-y-2"><span>Question</span><textarea ref={questionInput} className={input} required value={question} onChange={event => setQuestion(event.target.value)} /></label>
      {card.kind === 'mcq' && <>
        {options.map((option, index) => <label key={option.id} className="block space-y-2"><span>Choix {index + 1}</span>
          <input className={input} required value={option.value} onChange={event => setOptions(options.map(item => item.id === option.id ? { ...item, value: event.target.value } : item))} />
        </label>)}
        <label className="block space-y-2"><span>Bonne réponse</span><select className={input} value={correct} onChange={event => setCorrect(Number(event.target.value))}>
          {options.map((option, index) => <option key={option.id} value={index + 1}>Choix {index + 1}</option>)}
        </select></label>
      </>}
      <label className="block space-y-2"><span>{card.kind === 'mcq' ? 'Explication' : 'Réponse'}</span><textarea className={input} required value={answer} onChange={event => setAnswer(event.target.value)} /></label>
      <div className="flex flex-wrap gap-3"><Button type="submit">Enregistrer</Button><button type="button" className="rounded-xl border border-border px-4 py-3 text-foreground" onClick={onCancel}>Annuler</button></div>
    </fieldset>
  </form>
}

export default function Courses() {
  const device = cachedDevice()
  if (cachedCourses && (cachedCourses.device !== device || cachedCourses.day !== new Date().toDateString())) cachedCourses = null
  const sharedChapters = revisionSnapshot<RevisionChapter[]>('/chapters')
  const sharedProgress = revisionSnapshot<RevisionProgress>('/progress')
  const animateEntry = useRef(!cachedCourses).current
  const [chapters, setChapters] = useState<RevisionChapter[]>(() => cachedCourses?.chapters ?? sharedChapters ?? [])
  const [progress, setProgress] = useState<RevisionProgress | null>(() => cachedCourses?.progress ?? sharedProgress ?? null)
  const [editing, setEditing] = useState<string | null>(null)
  const [stale, setStale] = useState(!!cachedCourses && cachedCourses.version !== currentRevisionCacheVersion())
  const [busy, setBusy] = useState((!cachedCourses && !sharedChapters) || stale)
  const [error, setError] = useState('')

  const load = useCallback(async function load(isActive: () => boolean = () => true) {
    const requestDevice = cachedDevice()
    const version = currentRevisionCacheVersion()
    let nextChapters: RevisionChapter[], nextProgress: RevisionProgress
    try { [nextChapters, nextProgress] = await Promise.all([revisionAPI.chapters(), revisionAPI.progress()]) }
    catch (cause) {
      if (isActive() && requestDevice && requestDevice !== cachedDevice()) {
        cachedCourses = null; setChapters([]); setProgress(null); setBusy(true); setStale(true)
        return load(isActive)
      }
      throw cause
    }
    if (!isActive()) return
    if ((requestDevice && requestDevice !== cachedDevice()) || version !== currentRevisionCacheVersion()) {
      if (requestDevice && requestDevice !== cachedDevice()) { cachedCourses = null; setChapters([]); setProgress(null); setBusy(true); setStale(true) }
      return load(isActive)
    }
    cachedCourses = { device: cachedDevice(), version: currentRevisionCacheVersion(), day: new Date().toDateString(), chapters: nextChapters, progress: nextProgress }
    setChapters(nextChapters)
    setProgress(nextProgress)
    setStale(false)
  }, [])
  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let active = true
    load(() => active).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [load])

  return <main className="loop-screen min-h-dvh px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Cours</h1>
          {progress && <p aria-live="polite" className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-tint px-3 py-1 font-semibold text-foreground">{progress.xp} XP</span>
            <span className="rounded-full border border-border px-3 py-1 text-foreground">Série : {progress.streak} j</span>
          </p>}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <ButtonLink to="/import" aria-label="Importer mon cours" className="py-2.5">Importer</ButtonLink>
          <Link to="/revision" className="flex items-center justify-center whitespace-nowrap rounded-xl border border-border px-4 py-2.5 text-center text-foreground">Session du jour</Link>
        </div>
      </header>
      <nav aria-label="S’entraîner" className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">S’entraîner</h2>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['/exam', ClipboardIcon, 'Examens'],
            ['/quiz', HelpIcon, 'Quiz'],
            ['/debate', DebateIcon, 'Débat'],
            ['/tools', HeadphonesIcon, 'Podcast'],
            ['/planner', CalendarIcon, 'Planning'],
          ] satisfies [string, () => ReactNode, string][]).map(([to, Icon, label]) => <Link key={to} to={to} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-0.5 py-2 text-xs text-foreground">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-tint text-lg"><Icon /></span>
            <span className="whitespace-nowrap font-semibold">{label}</span>
          </Link>)}
        </div>
      </nav>
      {error && <div role="alert" className="rounded-xl border border-danger p-4 text-foreground"><Mascotte humeur="désolée" taille={96} />{error}
        <button type="button" className="ml-3 underline" disabled={busy} onClick={() => void run(load)}>Réessayer</button>
      </div>}
      {busy && chapters.length === 0 && <PendingRead title="Mes cours" label="On prépare tes cours…" />}
      {!busy && !error && chapters.length === 0 && <section className="space-y-3 rounded-2xl border border-border p-6">
        <Mascotte humeur="au repos" taille={112} />
        <h2 className="text-xl text-foreground">Tes cours apparaîtront ici</h2>
        <p>Prépare ton premier chapitre pour commencer à réviser.</p>
        <Link to="/revision" className="inline-block underline">Commencer ma révision</Link>
      </section>}
      {[...new Set(chapters.map(chapter => chapter.subject))].map((subject, subjectIndex) => {
        const own = chapters.filter(chapter => chapter.subject === subject)
        return <section key={subject} style={{ animationDelay: listDelay(subjectIndex) }} className={`${animateEntry ? 'motion-list ' : ''}space-y-4`} aria-busy={busy}>
          <h2 className="text-xl font-semibold text-foreground">{subject}</h2>
          {own.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}space-y-4 rounded-2xl border border-border bg-surface p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">{chapter.title}</h3>
              <span className={chapter.status === 'En cours' ? 'text-primary' : 'text-foreground'}>{chapter.status}</span>
            </div>
            <p className="text-sm text-muted">{chapter.origin === 'ai' ? 'Généré par IA · Peut contenir des erreurs' : 'Cours importé'}</p>
            <p>{chapter.mastery === null ? 'Aucune carte vue' : <><AnimatedNumber value={Math.round(chapter.mastery)} /> % de rappel estimé</>} · {chapter.seenCards}/{chapter.cards.length} cartes vues</p>
            <Progress className="mastery-progress w-full" value={chapter.mastery ?? 0} max={100} aria-label={`Maîtrise du chapitre ${chapter.title}`} />
            {chapter.cards.length > 0 && chapter.seenCards < chapter.cards.length * revisionPolicy.minimumSeenRatio && <p className="text-sm text-muted">Révise au moins {Math.round(revisionPolicy.minimumSeenRatio * 100)} % des cartes pour faire évoluer la maîtrise.</p>}
            <DeferredDetails summary="Relire le résumé"><MarkdownView md={chapter.summary} /></DeferredDetails>
            <DeferredDetails summary={`Voir les cartes (${chapter.cards.length})`}>
              <div className="mt-3 space-y-4">{chapter.cards.map(card => <article key={card.id} className="space-y-3 rounded-xl border border-border p-4">
                {editing === card.id ? <CardEditor key={card.id} card={card} busy={busy || stale} onCancel={() => setEditing(null)} onSave={value => void run(async () => {
                  await revisionAPI.updateCard(card.id, value)
                  setEditing(null)
                  await load()
                })} /> : <>
                  <MarkdownView md={card.question} />
                  {card.kind === 'mcq' && <ol className="list-decimal space-y-1 pl-5">{withOccurrenceKeys(card.options ?? [], option => option).map(({ value: option, key }, i) => <li key={key}><MarkdownView md={option} inline />{i + 1 === card.correct && <span className="text-foreground"> — Bonne réponse</span>}</li>)}</ol>}
                  <MarkdownView md={card.answer} />
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={busy || stale} onClick={() => setEditing(card.id)}>Modifier</Button>
                    <button type="button" className="rounded-xl border border-danger px-4 py-3 text-danger disabled:opacity-50" disabled={busy || stale} onClick={() => {
                      void confirmDialog('Supprimer cette carte ? Elle ne sera plus proposée en révision.').then(ok => { if (ok) void run(async () => { await revisionAPI.deleteCard(card.id); await load() }) })
                    }}>Supprimer la carte</button>
                  </div>
                </>}
              </article>)}</div>
            </DeferredDetails>
            <button type="button" className="min-h-11 py-2 text-sm text-foreground underline disabled:opacity-50" disabled={busy || stale} onClick={() => {
              void confirmDialog(`Supprimer le chapitre « ${chapter.title} » et toutes ses cartes ? Cette action est définitive.`).then(ok => { if (ok) void run(async () => {
                await revisionAPI.deleteChapter(chapter.id)
                setEditing(null)
                await load()
              }) })
            }}>Supprimer le chapitre</button>
          </article>)}
        </section>
      })}
    </div>
  </main>
}
