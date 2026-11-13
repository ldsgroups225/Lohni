import { HelpIcon, ClipboardIcon, DebateIcon, HeadphonesIcon } from '../components/ui/NavigationIcons'
import { withOccurrenceKeys } from '../lib/occurrenceKeys'
import { cachedDevice, currentRevisionCacheVersion, revisionSnapshot } from '../lib/cachedDevice'
import { Button, ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { confirmDialog } from '../lib/confirm'
import { listDelay } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { Progress } from '../components/ui/Progress'
import MasteryBadge from '../components/ui/MasteryBadge'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MarkdownView from '../components/Chat/MarkdownView'
import { revisionAPI, revisionPolicy, type RevisionCard, type RevisionCardInput, type RevisionChapter, type RevisionProgress } from '../lib/api'

let cachedCourses: { device: string | null; version: number; day: string; chapters: RevisionChapter[]; progress: RevisionProgress } | null = null

const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

function DeferredDetails({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  return <details className="min-w-0 open:col-span-2" onToggle={event => { if (event.currentTarget.open) setOpened(true) }}>
    <summary className="course-summary flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-center font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-primary">{summary}</summary>
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
  const [, setProgress] = useState<RevisionProgress | null>(() => cachedCourses?.progress ?? sharedProgress ?? null)
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

  return <main className="loop-screen min-h-dvh px-4 pt-5 pb-36 md:pl-28">
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-foreground">Cours</h1>
        <ButtonLink to="/import" aria-label="Importer mon cours" className="min-h-11 px-4 py-2">＋ Importer</ButtonLink>
      </header>
      <nav aria-label="S’entraîner" className="space-y-2">
        <h2 className="font-semibold text-muted">S’entraîner</h2>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['/exam', ClipboardIcon, 'Examens'],
            ['/quiz', HelpIcon, 'Quiz'],
            ['/debate', DebateIcon, 'Débat'],
            ['/tools', HeadphonesIcon, 'Podcast'],
          ] satisfies [string, () => ReactNode, string][]).map(([to, Icon, label]) => <Link key={to} to={to} className="flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-1 py-3 text-sm text-foreground">
            <span aria-hidden="true" className="text-primary"><Icon /></span>
            <span className="font-semibold">{label}</span>
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
        return <section key={subject} style={{ animationDelay: listDelay(subjectIndex), marginBlockStart: 8 }} className={`${animateEntry ? 'motion-list ' : ''}space-y-2`} aria-busy={busy}>
          <h2 className="text-sm font-semibold text-muted">{subject}</h2>
          {own.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}space-y-1 rounded-2xl border border-border bg-surface p-4`}>
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 break-words text-lg font-extrabold text-foreground">{chapter.title}</h3>
              <MasteryBadge status={chapter.status} />
              <details className="relative">
                <summary aria-label={`Options du chapitre ${chapter.title}`} className="course-summary grid size-11 cursor-pointer list-none place-items-center rounded-xl text-xl text-muted focus-visible:outline-2 focus-visible:outline-primary">⋮</summary>
                <div className="absolute right-0 z-10 w-max rounded-xl border border-border bg-surface p-2 shadow-lg">
                  <button type="button" className="min-h-11 px-3 text-sm text-danger disabled:opacity-50" disabled={busy || stale} onClick={() => {
                    void confirmDialog(`Supprimer le chapitre « ${chapter.title} » et toutes ses cartes ? Cette action est définitive.`).then(ok => { if (ok) void run(async () => {
                      await revisionAPI.deleteChapter(chapter.id)
                      setEditing(null)
                      await load()
                    }) })
                  }}>Supprimer le chapitre</button>
                </div>
              </details>
            </div>
            <Progress className={`mastery-progress w-full ${chapter.status === 'Solide' ? '[&::-webkit-progress-value]:!bg-success [&::-moz-progress-bar]:!bg-success' : ''}`} value={chapter.cards.length ? chapter.seenCards / chapter.cards.length : 0} max={1} aria-label={`Cartes vues du chapitre ${chapter.title}`} />
            <p className="text-sm text-muted">{chapter.seenCards} carte{chapter.seenCards === 1 ? '' : 's'} vue{chapter.seenCards === 1 ? '' : 's'} sur {chapter.cards.length}{chapter.mastery !== null && ` · rappel estimé ${Math.round(chapter.mastery)} %`}
              {chapter.cards.length > 0 && chapter.seenCards < chapter.cards.length * revisionPolicy.minimumSeenRatio && ` · encore ${Math.ceil(chapter.cards.length * revisionPolicy.minimumSeenRatio) - chapter.seenCards} pour faire évoluer la maîtrise`}</p>
            <div className="grid grid-cols-2 gap-2">
            <DeferredDetails summary="Résumé"><MarkdownView md={chapter.summary} /></DeferredDetails>
            <DeferredDetails summary={`${chapter.cards.length} carte${chapter.cards.length === 1 ? '' : 's'}`}>
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
            </div>
          </article>)}
        </section>
      })}
      <Link to="/planner" className="inline-flex min-h-11 items-center text-sm text-muted underline">Planning des devoirs</Link>
    </div>
  </main>
}
