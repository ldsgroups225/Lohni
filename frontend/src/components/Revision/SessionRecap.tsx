import { ButtonLink } from '../ui/Button'
import Mascotte from '../Mascotte/Mascotte'
import { FlameIcon } from '../ui/NavigationIcons'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import MarkdownView from '../Chat/MarkdownView'
import MasteryBadge from '../ui/MasteryBadge'
import type { RevisionChapter, RevisionProgress, RevisionSession } from '../../lib/api'

type Props = {
  session: RevisionSession
  progress: RevisionProgress | null
  chapters: RevisionChapter[]
  pending: number
  moreCards: boolean
  busy: boolean
  online: boolean
  error?: boolean
  onExplain: (cardId: string) => void
  onContinue: () => void
  onReviewMissed: () => void
}

function motivation(s: NonNullable<RevisionSession['summary']>, streak?: number) {
  if (s.quiz.total > 0 && s.quiz.correct === s.quiz.total) return 'Sans faute au quiz, bravo !'
  if (s.missed.length >= 3) return 'Les erreurs font progresser : reprends les points ci-dessous.'
  if (streak === 1) return 'Première session, belle série qui démarre !'
  return 'À demain pour la suite.'
}

export function SessionRecap({ session, progress, chapters, pending, moreCards, busy, online, error, onExplain, onContinue, onReviewMissed }: Props) {
  const { summary, position, earnedXP } = session
  const showStats = !pending && progress
  const missed = summary?.missed.slice(0, 3) ?? []
  const cardsSeen = new Set(session.cards.slice(0, position).map(card => card.id)).size
  const reviewedChapters = chapters.filter(chapter => session.cards.some(card => card.chapterId === chapter.id))
  const date = new Date(`${session.localDate}T00:00:00Z`)
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000
  const block = 'rounded-2xl border border-border bg-surface p-4 text-left'
  return (
    <section className="flex flex-col items-center gap-4 text-center" aria-live="polite">
      {!error && <span className="motion-celebrate"><Mascotte humeur="en fête" taille={160} /></span>}
      <h1 className="text-3xl font-extrabold">Session terminée</h1>
      <p className="text-muted">Tu as revu {cardsSeen} carte{cardsSeen > 1 ? 's' : ''} en {session.elapsedMs < 60000 ? 'moins d’une minute' : `${Math.ceil(session.elapsedMs / 60000)} minutes`}.</p>
      {summary && <div className={`${block} grid w-full grid-cols-3 gap-2 text-center`}><div><strong className="block text-3xl text-success">{summary.quiz.correct + summary.flashcards.knew}</strong><span className="text-sm text-muted">je savais</span></div><div><strong className="block text-3xl text-primary">{summary.missed.length}</strong><span className="text-sm text-muted">à revoir</span></div><div><strong className="block text-3xl">+{earnedXP}</strong><span className="text-sm text-muted">XP</span></div></div>}
      {showStats && <div className="flex w-full items-center gap-3 rounded-3xl bg-tint p-4 font-extrabold text-primary"><FlameIcon />{progress.streak} jour{progress.streak > 1 ? 's' : ''} de suite</div>}
      {showStats && progress.completedDates && Number.isFinite(monday) && <fieldset className="flex w-full justify-between px-1" aria-label="Séances de la semaine">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => { const key = new Date(monday + index * 86400000).toISOString().slice(0, 10); const done = progress.completedDates?.includes(key); return <div key={key} className="flex flex-col items-center gap-1 text-sm text-muted"><span role="img" aria-label={`${key} : ${done ? 'séance terminée' : 'aucune séance terminée'}`} className={`grid size-8 place-items-center rounded-full border ${done ? 'border-primary bg-primary text-white' : 'border-border bg-surface'}`}>{done && key === session.localDate ? '✓' : ''}</span>{label}</div> })}</fieldset>}
      {showStats && reviewedChapters.length > 0 && <div className={`${block} w-full divide-y divide-border`}>{reviewedChapters.map(chapter => { const count = summary?.missed.filter(item => session.cards.some(card => card.id === item.cardId && card.chapterId === chapter.id)).length ?? 0; return <div key={chapter.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div><h2 className="font-bold">{chapter.title}</h2>{summary && <p className="text-sm text-muted">{count} carte{count > 1 ? 's' : ''} à revoir</p>}</div><MasteryBadge status={chapter.status} /></div> })}</div>}
      {summary ? <p>{motivation(summary, showStats ? progress.streak : undefined)}</p>
        : <p>{position} réponses enregistrées{pending ? ' sur cet appareil' : ''}. À demain pour la suite.</p>}
      {summary && (summary.quiz.total > 0 || summary.flashcards.total > 0) && <div className="w-full space-y-3">
        {summary.quiz.total > 0 && <div className={block}>
          <h2 className="text-sm font-semibold text-muted">Quiz</h2>
          <p><strong className="text-2xl">{summary.quiz.correct}/{summary.quiz.total}</strong> bonnes réponses · {Math.round(100 * summary.quiz.correct / summary.quiz.total)} %</p>
        </div>}
        {summary.flashcards.total > 0 && <div className={block}>
          <h2 className="text-sm font-semibold text-muted">Flashcards <span className="font-normal">(auto-évaluation)</span></h2>
          <p><strong className="text-2xl">{summary.flashcards.knew}</strong> maîtrisée{summary.flashcards.knew > 1 ? 's' : ''}, <strong className="text-2xl">{summary.flashcards.total - summary.flashcards.knew}</strong> à revoir</p>
        </div>}
      </div>}
      {missed.length > 0 && summary && <div className={`${block} w-full space-y-3`}>
        <h2 className="text-sm font-semibold text-muted">À revoir</h2>
        {(!online || busy) && <p className="text-sm text-muted">{!online ? 'Connecte-toi pour demander une explication.' : 'Patiente avant de demander une explication.'}</p>}
        <ul className="space-y-3">
          {missed.map(m => <li key={m.cardId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1"><MarkdownView md={m.question} inline /></span>
            <button type="button" className="min-h-11 shrink-0 rounded-xl border border-border px-3 py-2 text-sm text-primary disabled:opacity-50" disabled={busy || !online} onClick={() => onExplain(m.cardId)}>Explique-moi</button>
          </li>)}
        </ul>
        {summary.missed.length > 3 && <p className="text-sm text-muted">+{summary.missed.length - 3} autre{summary.missed.length > 4 ? 's' : ''}</p>}
      </div>}
      {!summary && <div className="motion-enter flex gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4"><strong className="block text-3xl"><AnimatedNumber value={earnedXP} prefix="+" /></strong><span>XP gagnés</span></div>
        {showStats && <div className="rounded-2xl bg-tint p-4"><span className="flex items-center justify-center gap-2"><FlameIcon /><strong className="text-3xl"><AnimatedNumber value={progress.streak} /></strong></span><span>jour{progress.streak > 1 ? 's' : ''} de série</span></div>}
      </div>}
      {showStats && <p><AnimatedNumber value={progress.xp} /> XP au total</p>}
      <ButtonLink className="w-full" to="/">Retour à l’accueil</ButtonLink>
      {!!summary?.missed.length && <><button type="button" disabled={busy || !online || pending > 0} aria-describedby={busy || !online || pending > 0 ? 'review-unavailable' : undefined} onClick={onReviewMissed} className="min-h-14 w-full rounded-2xl border-2 border-primary bg-surface px-4 font-bold text-primary disabled:opacity-60">{summary.missed.length === 1 ? 'Revoir la carte maintenant' : `Revoir les ${summary.missed.length} cartes maintenant`}</button>{(busy || !online || pending > 0) && <p id="review-unavailable" className="text-sm text-muted">{!online ? 'Connecte-toi pour revoir ces cartes.' : pending > 0 ? 'Synchronise tes réponses pour revoir ces cartes.' : 'Patiente avant de revoir ces cartes.'}</p>}</>}
      {moreCards && (busy || !online || pending > 0) && <p className="text-sm text-muted">{!online ? 'Connecte-toi pour continuer.' : pending > 0 ? 'Synchronise tes réponses pour continuer.' : 'Patiente avant de continuer.'}</p>}
      {moreCards && <button type="button" className="min-h-11 text-primary underline disabled:opacity-50" disabled={busy || !online || pending > 0} onClick={onContinue}>Continuer avec les cartes restantes</button>}
    </section>
  )
}
