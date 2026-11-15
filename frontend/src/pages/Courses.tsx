import { ChevronRightIcon, ClipboardIcon, DebateIcon, HeadphonesIcon, HelpIcon, MoreIcon, PlusIcon } from '../components/ui/NavigationIcons'
import { Button, ButtonLink } from '../components/ui/Button'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { PendingRead } from '../components/ui/PendingRead'
import { confirmDialog } from '../lib/confirm'
import { listDelay } from '../components/ui/revisionPresentation'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { EmptyState } from '../components/ui/EmptyState'
import { Progress } from '../components/ui/Progress'
import MasteryBadge from '../components/ui/MasteryBadge'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRevisionRead } from '../lib/useRevisionRead'
import { useOverlayNavigation } from '../lib/useOverlayNavigation'
import { useSecondaryScreen } from '../components/Sidebar'
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
      <div><span className="mb-2 block text-sm font-semibold text-muted">Aperçu comme en révision</span><div className="p-4 ui-card"><MarkdownContent md={answer || 'Ta réponse apparaîtra ici.'} /></div></div>
      <div className="mt-auto space-y-2 pt-4"><Button type="submit" className="w-full" disabled={!question.trim()}>Enregistrer</Button>{busy ? <p className="text-sm text-muted">Mise à jour en cours…</p> : !question.trim() && <p className="text-sm text-muted">Renseigne la question pour enregistrer.</p>}<Button variant="secondary" className="w-full text-danger" onClick={onDelete}>Supprimer cette carte</Button><Button variant="ghost" className="w-full" onClick={onCancel}>Annuler</Button></div>
    </fieldset>
  </form>
}

export default function Courses() {
  const sharedChapters = revisionAPI.cached.chapters()
  const sharedProgress = revisionAPI.cached.progress()
  const animateEntry = useRef(!sharedChapters).current
  const [chapters, setChapters] = useState<RevisionChapter[]>(() => sharedChapters ?? [])
  const [, setProgress] = useState<RevisionProgress | null>(() => sharedProgress ?? null)
  const [stale, setStale] = useState(() => revisionAPI.cached.stale('chapters', 'progress'))
  const [editing, setEditing] = useState<string | null>(null)
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useOverlayNavigation('chapter-summary')
  const [busy, setBusy] = useState(!sharedChapters || stale)
  const [error, setError] = useState('')
  const operating = useRef(false)

  const load = useRevisionRead(() => Promise.all([revisionAPI.chapters(), revisionAPI.progress()]), {
    accept: ([nextChapters, nextProgress]) => { setChapters(nextChapters); setProgress(nextProgress); setStale(false) },
    onChanged: () => { setChapters([]); setProgress(null); setBusy(true); setStale(true) },
    fail: error => setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.'),
    settled: () => { if (!operating.current) setBusy(false) },
  })
  async function run(operation: () => Promise<void>) {
    operating.current = true
    setBusy(true)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.') }
    finally { operating.current = false; setBusy(false) }
  }

  const summaryChapter = chapters.find(chapter => chapter.id === summaryId)
  useSecondaryScreen(!!(summaryOpen && summaryChapter) || chapters.some(chapter => chapter.id === selectedChapter))
  if (summaryOpen && summaryChapter) return <Suspense fallback={<PendingRead title="Résumé" label="On prépare ton résumé…" />}><ChapterSummary {...summaryChapter} onBack={() => setSummaryOpen(false)} onCards={() => { setSelectedChapter(summaryChapter.id); setSummaryOpen(false) }} /></Suspense>
  const selected = chapters.find(chapter => chapter.id === selectedChapter)
  const selectedCard = selected?.cards.find(card => card.id === editing)
  if (selected) return <main className="loop-screen ui-page"><div className="ui-page-body space-y-4">
    <ScreenHeader back={() => selectedCard ? setEditing(null) : setSelectedChapter(null)} backLabel={selectedCard ? 'Annuler la modification' : 'Retour à Cours'} title={selectedCard ? 'Modifier la carte' : selected.title} fullTitle subtitle={!selectedCard && `${selected.subject} · ${selected.cards.length} carte${selected.cards.length === 1 ? '' : 's'}`}>{!selectedCard && <MasteryBadge status={selected.status} />}</ScreenHeader>
    {error && <ErrorNotice message={error} />}
    {selectedCard ? <CardEditor key={selectedCard.id} card={selectedCard} busy={busy || stale} onCancel={() => setEditing(null)} onSave={value => void run(async () => { await revisionAPI.updateCard(selectedCard.id, value); setEditing(null); await load() })} onDelete={() => { void confirmDialog('Supprimer cette carte ? Elle ne sera plus proposée en révision.').then(ok => { if (ok) void run(async () => { await revisionAPI.deleteCard(selectedCard.id); setEditing(null); await load() }) }) }} /> : <>
      <div className="overflow-hidden ui-card">{selected.cards.map(card => <button key={card.id} type="button" aria-label={`Modifier : ${card.question}`} disabled={busy || stale} onClick={() => setEditing(card.id)} className="flex min-h-[72px] w-full items-center gap-2 border-b border-border px-4 py-3 text-left last:border-b-0 disabled:opacity-50"><span className="min-w-0 flex-1"><span className="block font-bold"><MarkdownContent md={card.question} inline /></span><span className="block text-sm text-muted"><MarkdownContent md={card.answer} inline /></span></span><span aria-hidden="true" className="grid size-11 place-items-center text-muted"><ChevronRightIcon /></span></button>)}</div>
      <div className="space-y-2">{selected.cards.length ? <ButtonLink className="w-full" to={`/revision?chapter=${encodeURIComponent(selected.id)}`}>Réviser ce chapitre</ButtonLink> : <Button className="w-full" disabled>Réviser ce chapitre</Button>}{!selected.cards.length && <p className="text-sm text-muted">Ce chapitre n’a pas encore de cartes à réviser.</p>}</div>
    </>}
  </div></main>

  return <main className="loop-screen ui-page">
    <div className="ui-page-body space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="ui-title">Cours</h1>
        <ButtonLink to="/import" aria-label="Importer mon cours" className="min-h-11 gap-1.5 px-4 py-2"><PlusIcon className="size-5" /> Importer</ButtonLink>
      </header>
      <nav aria-label="S’entraîner" className="space-y-2">
        <h2 className="ui-label">S’entraîner</h2>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['/exam', ClipboardIcon, 'Examens'],
            ['/quiz', HelpIcon, 'Quiz'],
            ['/debate', DebateIcon, 'Débat'],
            ['/tools', HeadphonesIcon, 'Outils'],
          ] satisfies [string, () => ReactNode, string][]).map(([to, Icon, label]) => <Link key={to} to={to} className="flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-1 py-3 text-sm text-foreground">
            <span aria-hidden="true" className="text-primary"><Icon /></span>
            <span className="font-semibold">{label}</span>
          </Link>)}
        </div>
      </nav>
      {error && <ErrorNotice message={error} busy={busy} onRetry={() => void run(load)} />}
      {busy && chapters.length === 0 && <PendingRead title="Mes cours" label="On prépare tes cours…" />}
      {!busy && !error && chapters.length === 0 && <EmptyState title="Tes cours apparaîtront ici">
        <p>Prépare ton premier chapitre pour commencer à réviser.</p>
        <ButtonLink to="/revision" className="w-full">Commencer ma révision</ButtonLink>
      </EmptyState>}
      {[...new Set(chapters.map(chapter => chapter.subject))].map((subject, subjectIndex) => {
        const own = chapters.filter(chapter => chapter.subject === subject)
        return <section key={subject} style={{ animationDelay: listDelay(subjectIndex), marginBlockStart: 8 }} className={`${animateEntry ? 'motion-list ' : ''}space-y-2`} aria-busy={busy}>
          <h2 className="ui-label">{subject}</h2>
          {own.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}space-y-1 rounded-2xl border border-border bg-surface p-4`}>
            <div className="flex items-start gap-2">
              <h3 className="ui-card-title min-w-0 flex-1">{chapter.title}</h3>
              <MasteryBadge status={chapter.status} />
              <details className="relative">
                <summary aria-label={`Options du chapitre ${chapter.title}`} className="course-summary grid size-11 cursor-pointer list-none place-items-center rounded-xl text-muted focus-visible:outline-2 focus-visible:outline-primary"><MoreIcon className="size-5 rotate-90" /></summary>
                <div className="absolute right-0 z-10 w-max p-2 shadow-lg ui-card">
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
            <p className="text-sm text-muted">{chapter.seenCards} carte{chapter.seenCards === 1 ? '' : 's'} vue{chapter.seenCards === 1 ? '' : 's'} sur {chapter.cards.length}{chapter.mastery !== null && ` · maîtrise estimée ${Math.round(chapter.mastery)} %`}
              {chapter.cards.length > 0 && chapter.seenCards < chapter.cards.length * revisionPolicy.minimumSeenRatio && ` · encore ${Math.ceil(chapter.cards.length * revisionPolicy.minimumSeenRatio) - chapter.seenCards} pour faire évoluer la maîtrise`}</p>
            <div className="grid grid-cols-2 gap-2">
            <button type="button" className="ui-button-secondary" onClick={() => { setSummaryId(chapter.id); setSummaryOpen(true) }}>Résumé</button>
            <button type="button" className="ui-button-secondary" onClick={() => setSelectedChapter(chapter.id)}>{chapter.cards.length === 1 ? 'Voir la carte' : `Voir les ${chapter.cards.length} cartes`}</button>
            </div>
          </article>)}
        </section>
      })}
      <ButtonLink variant="secondary" to="/planner" className="w-full">Planning des devoirs</ButtonLink>
    </div>
  </main>
}
