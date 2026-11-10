import { Button, ButtonLink } from '../components/ui/Button'
import { confirmDialog } from '../lib/confirm'
import { listDelay } from '../components/ui/revisionPresentation'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import Mascotte from '../components/Mascotte/Mascotte'
import { Progress } from '../components/ui/Progress'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MarkdownView from '../components/Chat/MarkdownView'
import { revisionAPI, revisionPolicy, type RevisionCard, type RevisionCardInput, type RevisionChapter, type RevisionProgress } from '../lib/api'

const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

function CardEditor({ card, busy, onSave, onCancel }: {
  card: RevisionCard; busy: boolean; onSave: (value: RevisionCardInput) => void; onCancel: () => void
}) {
  const [question, setQuestion] = useState(card.question)
  const [answer, setAnswer] = useState(card.answer)
  const [options, setOptions] = useState(card.options ?? [])
  const [correct, setCorrect] = useState(card.correct ?? 1)
  function submit(event: FormEvent) {
    event.preventDefault()
    const content = { question: question.trim(), answer: answer.trim() }
    onSave(card.kind === 'mcq' ? { ...content, kind: 'mcq', options: options.map(option => option.trim()), correct } : { ...content, kind: 'basic' })
  }
  return <form onSubmit={submit}>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="mb-4 font-semibold text-foreground">Modifier la carte</legend>
      <label className="block space-y-2"><span>Question</span><textarea autoFocus className={input} required value={question} onChange={event => setQuestion(event.target.value)} /></label>
      {card.kind === 'mcq' && <>
        {options.map((option, index) => <label key={index} className="block space-y-2"><span>Choix {index + 1}</span>
          <input className={input} required value={option} onChange={event => setOptions(options.map((value, i) => i === index ? event.target.value : value))} />
        </label>)}
        <label className="block space-y-2"><span>Bonne réponse</span><select className={input} value={correct} onChange={event => setCorrect(Number(event.target.value))}>
          {options.map((_, index) => <option key={index} value={index + 1}>Choix {index + 1}</option>)}
        </select></label>
      </>}
      <label className="block space-y-2"><span>{card.kind === 'mcq' ? 'Explication' : 'Réponse'}</span><textarea className={input} required value={answer} onChange={event => setAnswer(event.target.value)} /></label>
      <div className="flex flex-wrap gap-3"><Button type="submit">Enregistrer</Button><button type="button" className="rounded-xl border border-border px-4 py-3 text-foreground" onClick={onCancel}>Annuler</button></div>
    </fieldset>
  </form>
}

export default function Courses() {
  const [chapters, setChapters] = useState<RevisionChapter[]>([])
  const [progress, setProgress] = useState<RevisionProgress | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    const [nextChapters, nextProgress] = await Promise.all([revisionAPI.chapters(), revisionAPI.progress()])
    setChapters(nextChapters)
    setProgress(nextProgress)
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let active = true
    Promise.all([revisionAPI.chapters(), revisionAPI.progress()]).then(([nextChapters, nextProgress]) => {
      if (active) { setChapters(nextChapters); setProgress(nextProgress) }
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger tes cours.')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  return <main className="loop-screen min-h-screen px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Cours</h1>
        <div className="flex flex-wrap gap-3"><ButtonLink to="/import">Importer mon cours</ButtonLink><Link to="/revision" className="rounded-xl border border-border px-4 py-3 text-foreground">Session du jour</Link></div>
      </header>
      {progress && <p className="rounded-2xl border border-border p-4" aria-live="polite">
        <strong className="text-foreground">{progress.xp} XP</strong> · Série : {progress.streak} jour{progress.streak > 1 ? 's' : ''}
      </p>}
      {error && <div role="alert" className="rounded-xl border border-danger p-4 text-foreground"><Mascotte humeur="désolée" taille={96} />{error}
        <button className="ml-3 underline" disabled={busy} onClick={() => void run(load)}>Réessayer</button>
      </div>}
      {busy && <p role="status">Chargement…</p>}
      {!busy && !error && chapters.length === 0 && <section className="space-y-3 rounded-2xl border border-border p-6">
        <Mascotte humeur="au repos" taille={112} />
        <h2 className="text-xl text-foreground">Tes cours apparaîtront ici</h2>
        <p>Prépare ton premier chapitre pour commencer à réviser.</p>
        <Link to="/revision" className="inline-block underline">Commencer ma révision</Link>
      </section>}
      {[...new Set(chapters.map(chapter => chapter.subject))].map((subject, subjectIndex) => {
        const own = chapters.filter(chapter => chapter.subject === subject)
        return <section key={subject} style={{ animationDelay: listDelay(subjectIndex) }} className="motion-list space-y-4" aria-busy={busy}>
          <h2 className="text-xl font-semibold text-foreground">{subject}</h2>
          {own.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className="motion-list space-y-4 rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">{chapter.title}</h3>
              <span className={chapter.status === 'En cours' ? 'text-primary' : 'text-foreground'}>{chapter.status}</span>
            </div>
            <p className="text-sm text-muted">{chapter.origin === 'ai' ? 'Généré par IA · Peut contenir des erreurs' : 'Cours importé'}</p>
            <p>{chapter.mastery === null ? 'Aucune carte vue' : <><AnimatedNumber value={Math.round(chapter.mastery)} /> % de rappel estimé</>} · {chapter.seenCards}/{chapter.cards.length} cartes vues</p>
            <Progress className="mastery-progress w-full" value={chapter.mastery ?? 0} max={100} aria-label={`Maîtrise du chapitre ${chapter.title}`} />
            {chapter.cards.length > 0 && chapter.seenCards < chapter.cards.length * revisionPolicy.minimumSeenRatio && <p className="text-sm text-muted">Révise au moins {Math.round(revisionPolicy.minimumSeenRatio * 100)} % des cartes pour faire évoluer la maîtrise.</p>}
            <details><summary className="cursor-pointer py-2 text-foreground">Relire le résumé</summary><MarkdownView md={chapter.summary} /></details>
            <details><summary className="cursor-pointer py-2 text-foreground">Voir les cartes ({chapter.cards.length})</summary>
              <div className="mt-3 space-y-4">{chapter.cards.map(card => <article key={card.id} className="space-y-3 rounded-xl border border-border p-4">
                {editing === card.id ? <CardEditor key={card.id} card={card} busy={busy} onCancel={() => setEditing(null)} onSave={value => void run(async () => {
                  await revisionAPI.updateCard(card.id, value)
                  setEditing(null)
                  await load()
                })} /> : <>
                  <MarkdownView md={card.question} />
                  {card.kind === 'mcq' && <ol className="list-decimal space-y-1 pl-5">{card.options?.map((option, i) => <li key={i}><MarkdownView md={option} inline />{i + 1 === card.correct && <span className="text-foreground"> — Bonne réponse</span>}</li>)}</ol>}
                  <MarkdownView md={card.answer} />
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={busy} onClick={() => setEditing(card.id)}>Modifier</Button>
                    <button type="button" className="rounded-xl border border-danger px-4 py-3 text-danger disabled:opacity-50" disabled={busy} onClick={() => {
                      void confirmDialog('Supprimer cette carte ? Elle ne sera plus proposée en révision.').then(ok => { if (ok) void run(async () => { await revisionAPI.deleteCard(card.id); await load() }) })
                    }}>Supprimer la carte</button>
                  </div>
                </>}
              </article>)}</div>
            </details>
            <button className="py-2 text-sm text-foreground underline disabled:opacity-50" disabled={busy} onClick={() => {
              void confirmDialog(`Supprimer le chapitre « ${chapter.title} » et toutes ses cartes ? Cette action est définitive.`).then(ok => { if (ok) void run(async () => {
                await revisionAPI.deleteChapter(chapter.id)
                setEditing(null)
                await load()
              }) })
            }}>Supprimer le chapitre</button>
          </article>)}
        </section>
      })}
      <details className="rounded-2xl border border-border p-5">
        <summary className="cursor-pointer font-semibold text-foreground">Plus</summary>
        <nav aria-label="Autres outils" className="mt-4 grid grid-cols-2 gap-3">
          {[['/exam', 'Examen'], ['/debate', 'Débat'], ['/tools', 'Podcast et autres outils'], ['/planner', 'Planning'], ['/quiz', 'Quiz libre']].map(([to, label]) => <ButtonLink key={to} to={to}>{label}</ButtonLink>)}
        </nav>
      </details>
    </div>
  </main>
}
