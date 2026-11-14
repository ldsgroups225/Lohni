import { HelpIcon, ClipboardIcon, DebateIcon, HeadphonesIcon } from '../components/ui/NavigationIcons'
import { cachedDevice, revisionSnapshot, revisionSnapshotStale } from '../lib/cachedDevice'
import { Button, ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { confirmDialog } from '../lib/confirm'
import { listDelay } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { Progress } from '../components/ui/Progress'
import MasteryBadge from '../components/ui/MasteryBadge'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useOverlayNavigation } from '../lib/useOverlayNavigation'
import MarkdownContent from '../components/Chat/MarkdownContent'
import { revisionAPI, revisionPolicy, type RevisionCard, type RevisionCardInput, type RevisionChapter, type RevisionProgress } from '../lib/api'

const ChapterSummary = lazy(() => import('../components/Revision/ChapterSummary'))

const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

function CardEditor({ card, busy, onSave, onCancel, onDelete }: {
  card: RevisionCard; busy: boolean; onSave: (value: RevisionCardInput) => void; onCancel: () => void; onDelete: () => void
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
    if (!content.question) return
    onSave(card.kind === 'mcq' ? { ...content, kind: 'mcq', options: options.map(option => option.value.trim()), correct } : { ...content, kind: 'basic' })
  }
  return <form onSubmit={submit} className="flex min-h-[calc(100dvh-3rem)] flex-col">
    <fieldset disabled={busy} className="flex flex-1 flex-col gap-4">
      <legend className="sr-only">Modifier la carte</legend>
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
      <div><span className="mb-2 block text-sm font-semibold text-muted">Aperçu comme en révision</span><div className="rounded-2xl border border-border bg-surface p-4"><MarkdownContent md={answer || 'Ta réponse apparaîtra ici.'} /></div></div>
      <div className="mt-auto space-y-2 pt-4"><Button type="submit" className="w-full" disabled={!question.trim()}>Enregistrer</Button>{busy ? <p className="text-sm text-muted">Mise à jour en cours…</p> : !question.trim() && <p className="text-sm text-muted">Renseigne la question pour enregistrer.</p>}<button type="button" className="min-h-11 w-full text-primary underline" onClick={onDelete}>Supprimer cette carte</button><button type="button" className="min-h-11 w-full text-muted underline" onClick={onCancel}>Annuler</button></div>
    </fieldset>
  </form>
}

export default function Courses() {
  const sharedChapters = revisionSnapshot<RevisionChapter[]>('/chapters')
  const sharedProgress = revisionSnapshot<RevisionProgress>('/progress')
  const animateEntry = useRef(!sharedChapters).current
  const [chapters, setChapters] = useState<RevisionChapter[]>(() => sharedChapters ?? [])
  const [, setProgress] = useState<RevisionProgress | null>(() => sharedProgress ?? null)
  const [stale, setStale] = useState(() => revisionSnapshotStale('/chapters', '/progress'))
  const [editing, setEditing] = useState<string | null>(null)
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useOverlayNavigation('chapter-summary')
  const [busy, setBusy] = useState(!sharedChapters || stale)
  const [error, setError] = useState('')
  const operating = useRef(false)

  const load = useCallback(async function load(isActive: () => boolean = () => true) {
    const requestDevice = cachedDevice()
    let nextChapters: RevisionChapter[], nextProgress: RevisionProgress
    try { [nextChapters, nextProgress] = await Promise.all([revisionAPI.chapters(), revisionAPI.progress()]) }
    catch (cause) {
      if (isActive() && requestDevice && requestDevice !== cachedDevice()) {
        setChapters([]); setProgress(null); setBusy(true); setStale(true)
        return load(isActive)
      }
      throw cause
    }
    if (!isActive()) return
    if (requestDevice && requestDevice !== cachedDevice()) { setChapters([]); setProgress(null); setBusy(true); setStale(true); return load(isActive) }
    setChapters(nextChapters)
    setProgress(nextProgress)
    setStale(false)
  }, [])
  async function run(operation: () => Promise<void>) {
    operating.current = true
    setBusy(true)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.') }
    finally { operating.current = false; setBusy(false) }
  }
  useEffect(() => {
    let active = true
    load(() => active).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.')
    }).finally(() => { if (active && !operating.current) setBusy(false) })
    return () => { active = false }
  }, [load])

  const summaryChapter = chapters.find(chapter => chapter.id === summaryId)
  if (summaryOpen && summaryChapter) return <Suspense fallback={<PendingRead title="Résumé" label="On prépare ton résumé…" />}><ChapterSummary {...summaryChapter} onBack={() => setSummaryOpen(false)} onCards={() => { setSelectedChapter(summaryChapter.id); setSummaryOpen(false) }} /></Suspense>
  const selected = chapters.find(chapter => chapter.id === selectedChapter)
  const selectedCard = selected?.cards.find(card => card.id === editing)
  if (selected) return <main className="loop-screen min-h-dvh px-4 pt-5 pb-36 md:pl-28"><div className="mx-auto max-w-2xl space-y-4">
    <header className="flex items-center gap-3"><button type="button" className="grid size-11 place-items-center text-2xl" aria-label={selectedCard ? 'Annuler la modification' : 'Retour à Cours'} onClick={() => selectedCard ? setEditing(null) : setSelectedChapter(null)}>{selectedCard ? '×' : '‹'}</button>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-extrabold text-foreground">{selectedCard ? 'Modifier la carte' : selected.title}</h1>{!selectedCard && <p className="text-sm text-muted">{selected.subject} · {selected.cards.length} carte{selected.cards.length === 1 ? '' : 's'}</p>}</div>{!selectedCard && <MasteryBadge status={selected.status} />}</header>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {selectedCard ? <CardEditor key={selectedCard.id} card={selectedCard} busy={busy || stale} onCancel={() => setEditing(null)} onSave={value => void run(async () => { await revisionAPI.updateCard(selectedCard.id, value); setEditing(null); await load() })} onDelete={() => { void confirmDialog('Supprimer cette carte ? Elle ne sera plus proposée en révision.').then(ok => { if (ok) void run(async () => { await revisionAPI.deleteCard(selectedCard.id); setEditing(null); await load() }) }) }} /> : <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">{selected.cards.map(card => <button key={card.id} type="button" aria-label={`Modifier : ${card.question}`} disabled={busy || stale} onClick={() => setEditing(card.id)} className="flex min-h-[72px] w-full items-center gap-2 border-b border-border px-4 py-3 text-left last:border-b-0 disabled:opacity-50"><span className="min-w-0 flex-1"><span className="block font-bold"><MarkdownContent md={card.question} inline /></span><span className="block text-sm text-muted"><MarkdownContent md={card.answer} inline /></span></span><span aria-hidden="true" className="grid size-11 place-items-center text-xl text-muted">›</span></button>)}</div>
      <div className="space-y-2">{selected.cards.length ? <ButtonLink className="w-full" to={`/revision?chapter=${encodeURIComponent(selected.id)}`}>Réviser ce chapitre</ButtonLink> : <Button className="w-full" disabled>Réviser ce chapitre</Button>}<button type="button" disabled className="min-h-12 w-full rounded-xl border border-primary font-semibold text-primary opacity-60">+ Ajouter une carte</button><p className="text-sm text-muted">{selected.cards.length ? 'Ajouter une carte à la main n’est pas encore disponible.' : 'Ce chapitre n’a pas encore de cartes à réviser. Ajouter une carte à la main n’est pas encore disponible.'}</p></div>
    </>}
  </div></main>

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
            <button type="button" className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 font-semibold text-foreground" onClick={() => { setSummaryId(chapter.id); setSummaryOpen(true) }}>Résumé</button>
            <button type="button" className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 font-semibold text-foreground" onClick={() => setSelectedChapter(chapter.id)}>{chapter.cards.length} carte{chapter.cards.length === 1 ? '' : 's'}</button>
            </div>
          </article>)}
        </section>
      })}
      <Link to="/planner" className="inline-flex min-h-11 items-center text-sm text-muted underline">Planning des devoirs</Link>
    </div>
  </main>
}
