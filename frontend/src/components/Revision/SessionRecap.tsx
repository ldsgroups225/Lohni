import { ButtonLink } from '../ui/Button'
import Mascotte from '../Mascotte/Mascotte'
import { FlameIcon } from '../ui/NavigationIcons'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import MarkdownView from '../Chat/MarkdownView'
import type { RevisionProgress, RevisionSession } from '../../lib/api'

type Props = {
  session: RevisionSession
  progress: RevisionProgress | null
  pending: number
  moreCards: boolean
  busy: boolean
  online: boolean
  error?: boolean
  onExplain: (cardId: string) => void
  onContinue: () => void
}

function motivation(s: NonNullable<RevisionSession['summary']>, streak?: number) {
  if (s.quiz.total > 0 && s.quiz.correct === s.quiz.total) return 'Sans faute au quiz, bravo !'
  if (s.missed.length >= 3) return 'Les erreurs font progresser : reprends les points ci-dessous.'
  if (streak === 1) return 'Première session, belle série qui démarre !'
  return 'À demain pour la suite.'
}

export function SessionRecap({ session, progress, pending, moreCards, busy, online, error, onExplain, onContinue }: Props) {
  const { summary, position, earnedXP } = session
  const showStats = !pending && progress
  const missed = summary?.missed.slice(0, 3) ?? []
  const block = 'rounded-2xl border border-border bg-surface p-4 text-left'
  return (
    <section className="flex flex-col items-center gap-4 text-center" aria-live="polite">
      {!error && <span className="motion-celebrate"><Mascotte humeur="en fête" taille={160} /></span>}
      <h2 className="text-2xl font-bold">Session terminée !</h2>
      {summary ? <p>{motivation(summary, showStats ? progress.streak : undefined)}</p>
        : <p>{position} réponses enregistrées{pending ? ' sur cet appareil' : ''}. À demain pour la suite.</p>}
      {summary && (summary.quiz.total > 0 || summary.flashcards.total > 0) && <div className="w-full space-y-3">
        {summary.quiz.total > 0 && <div className={block}>
          <h3 className="text-sm font-semibold text-muted">Quiz</h3>
          <p><strong className="text-2xl">{summary.quiz.correct}/{summary.quiz.total}</strong> bonnes réponses · {Math.round(100 * summary.quiz.correct / summary.quiz.total)} %</p>
        </div>}
        {summary.flashcards.total > 0 && <div className={block}>
          <h3 className="text-sm font-semibold text-muted">Flashcards <span className="font-normal">(auto-évaluation)</span></h3>
          <p><strong className="text-2xl">{summary.flashcards.knew}</strong> maîtrisée{summary.flashcards.knew > 1 ? 's' : ''}, <strong className="text-2xl">{summary.flashcards.total - summary.flashcards.knew}</strong> à revoir</p>
        </div>}
      </div>}
      {missed.length > 0 && summary && <div className={`${block} w-full space-y-3`}>
        <h3 className="text-sm font-semibold text-muted">À revoir</h3>
        <ul className="space-y-3">
          {missed.map(m => <li key={m.cardId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1"><MarkdownView md={m.question} inline /></span>
            <button className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm text-primary disabled:opacity-50" disabled={busy || !online} onClick={() => onExplain(m.cardId)}>Explique-moi</button>
          </li>)}
        </ul>
        {summary.missed.length > 3 && <p className="text-sm text-muted">+{summary.missed.length - 3} autre{summary.missed.length > 4 ? 's' : ''}</p>}
      </div>}
      <div className="motion-enter flex gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4"><strong className="block text-3xl"><AnimatedNumber value={earnedXP} prefix="+" /></strong><span>XP gagnés</span></div>
        {showStats && <div className="rounded-2xl bg-tint p-4"><span className="flex items-center justify-center gap-2"><FlameIcon /><strong className="text-3xl"><AnimatedNumber value={progress.streak} /></strong></span><span>jour{progress.streak > 1 ? 's' : ''} de série</span></div>}
      </div>
      {showStats && <p><AnimatedNumber value={progress.xp} /> XP au total</p>}
      <ButtonLink className="w-full" to="/">Revenir à l’accueil</ButtonLink>
      {moreCards && <button className="text-primary underline disabled:opacity-50" disabled={busy || !online || pending > 0} onClick={onContinue}>Continuer avec les cartes restantes</button>}
    </section>
  )
}
