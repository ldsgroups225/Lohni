import { PlanToday } from '../components/Revision/PlanToday'
import { ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { humeurSerie, listDelay } from '../components/ui/revisionPresentation'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import Mascotte from '../components/Mascotte/Mascotte'
import { FlameIcon, PlusIcon } from '../components/ui/NavigationIcons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Card } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import MasteryBadge from '../components/ui/MasteryBadge'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import curriculum from '../data/curriculum-ci.json'
import Onboarding from '../components/Revision/Onboarding'
import MobileHeader from '../components/MobileHeader'
import { useRevisionRead } from '../lib/useRevisionRead'
import { revisionAPI, type RevisionHome, type RevisionProgress, type RevisionChapter } from '../lib/api'
import { readFirstName } from '../lib/localFirstName'
import { addDays, localDay, mondayOf } from '../../../backend/src/services/revision/day'

export default function Home() {
  const sharedProfile = revisionAPI.cached.profile()
  const sharedHome = revisionAPI.cached.home()
  const animateEntry = useRef(!sharedHome).current
  const shown = useRef(!!sharedHome)
  const [home, setHome] = useState<RevisionHome | null>(() => sharedHome ? { ...sharedHome, profile: sharedProfile ?? sharedHome.profile } : null)
  const [progress, setProgress] = useState<RevisionProgress | null>(() => revisionAPI.cached.progress() ?? null)
  const [loading, setLoading] = useState(sharedHome === undefined)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [chapters, setChapters] = useState<RevisionChapter[] | null>(() => revisionAPI.cached.chapters() ?? null)
  // Les trois lectures partent ensemble et l’accueil change d’un seul coup, sans état intermédiaire.
  useRevisionRead(async () => {
    setError('')
    setProgressError('')
    if (!shown.current) setLoading(true)
    const details = () => [revisionAPI.chapters().then(value => ({ value }), error => ({ error })), revisionAPI.progress().then(value => ({ value }), error => ({ error }))] as const
    const [chaptersRead, progressRead] = details()
    const data = await revisionAPI.home()
    const [chaptersResult, progressResult] = data ? await Promise.all([chaptersRead, progressRead]) : []
    return { data, chaptersResult, progressResult }
  }, {
    accept: ({ data, chaptersResult, progressResult }) => {
      shown.current = !!data
      setHome(data)
      if (chaptersResult) 'value' in chaptersResult ? setChapters(chaptersResult.value) : setProgressError('Le détail de tes cartes est temporairement indisponible.')
      if (progressResult) {
        if ('value' in progressResult) setProgress(progressResult.value)
        else if ((progressResult.error as { status?: number } | null)?.status !== 404) setProgressError('Ta progression est temporairement indisponible.')
      }
    },
    onChanged: () => { shown.current = false; setHome(null); setProgress(null); setChapters(null); setLoading(true) },
    fail: cause => {
      if (shown.current) setProgressError('La mise à jour de ton accueil est temporairement indisponible.')
      else setError(cause instanceof Error ? cause.message : 'Impossible de charger l’accueil.')
    },
    settled: () => setLoading(false),
  }, [attempt])
  // L’écran de démarrage d’index.html couvre l’accueil jusqu’à ce qu’il soit prêt (ou en erreur, ou à l’accueil d’inscription).
  useLayoutEffect(() => { if (!loading) document.getElementById('splash')?.remove() }, [loading])
  const [streakFrom, setStreakFrom] = useState<number | null>(null)
  useEffect(() => {
    if (!progress) return
    try {
      setStreakFrom(revisionAPI.lastStreak(progress.streak))
    } catch { setStreakFrom(null) }
  }, [progress])

  if (!loading && !error && !home) return <main className="loop-screen min-h-dvh md:pl-28"><Onboarding /></main>

  const today = localDay()
  const monday = mondayOf(today)
  const week = Array.from({ length: 7 }, (_, index) => {
    const key = addDays(monday, index)
    return { key, today: key === today }
  })

  return <main className="loop-screen ui-page">
    <div className="ui-page-body space-y-4">
      {(!home || loading || error) && <MobileHeader />}
      {(!home || loading || error) && <header className="sr-only lg:not-sr-only"><h1 className="ui-title">Lohni</h1></header>}
      {loading ? <PendingRead title="Session du jour" label="On prépare ta journée…" /> : error ? <ErrorNotice message={error} onRetry={() => setAttempt(value => value + 1)} /> : !home ? null : <>
        <header className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-3">
          <span className="row-span-2"><Mascotte humeur={humeurSerie(progress?.streak, progress?.streakStarted, home.state === 'done')} taille={56} /></span>
          <h1 className="ui-title line-clamp-2 min-w-0">Salut{readFirstName() ? ` ${readFirstName()}` : ''} !</h1>
          {progress && <p className="flex items-center gap-1.5 rounded-full bg-tint px-3 py-2 text-primary"><FlameIcon /><strong><AnimatedNumber value={progress.streak} from={streakFrom} /></strong><span className="sr-only"> jours de série</span></p>}
          <p className="col-start-2 col-end-4 min-w-0 text-sm text-muted [overflow-wrap:anywhere]">{curriculum.find(item => item.schoolClass === home.profile.schoolClass)?.label.split(' · ')[0] ?? home.profile.schoolClass}{home.profile.series ? ` ${home.profile.series}` : ''}{home.daysUntilExam !== null && home.nextExam && <> · <Link to={`/plan#exam-${encodeURIComponent(home.nextExam.id)}`} className="font-semibold text-primary">{home.daysUntilExam > 0 ? `${home.nextExam.title} dans ${home.daysUntilExam} jour${home.daysUntilExam > 1 ? 's' : ''}` : `${home.nextExam.title} aujourd’hui`}</Link></>}</p>
        </header>
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex justify-between gap-2 text-sm text-muted"><h2 className="ui-label">Session du jour</h2>{home.state === 'ready' && <span>environ {home.estimatedMinutes} min</span>}</div>
          {home.state === 'ready' ? <>
            <p className="text-4xl font-bold">{home.cardCount} carte{home.cardCount > 1 ? 's' : ''}</p>
            {(home.reviewCards !== undefined || home.newCards !== undefined) && <div className="flex flex-wrap gap-2 text-sm font-semibold">{home.reviewCards !== undefined && <span className="rounded-xl border border-border bg-background px-3 py-1.5">{home.reviewCards} à revoir</span>}{home.newCards !== undefined && <span className="rounded-xl border border-border bg-background px-3 py-1.5">{home.newCards} nouvelle{home.newCards > 1 ? 's' : ''}</span>}</div>}
            <ButtonLink to="/revision" className="block w-full rounded-2xl p-4 text-lg">{home.started ? 'Continuer' : 'Commencer'}</ButtonLink>
          </> : home.state === 'done' ? <><p className="ui-section-title">Session du jour terminée !</p><p>Ta journée est faite. Reviens demain pour entretenir ce que tu as appris.</p>{home.moreCards && <ButtonLink variant="secondary" to="/revision" state={{ continue: true }} className="w-full">Continuer les cartes restantes</ButtonLink>}</> : <><p className="ui-section-title">Aucune carte à réviser</p><p>{home.totalCards === 0 ? 'Importe ton cours pour créer tes cartes ou prépare un premier chapitre.' : 'Aucune carte n’est à réviser aujourd’hui.'}</p>{home.totalCards === 0 ? <ButtonLink className="block w-full rounded-2xl p-4" to="/revision">Préparer un chapitre</ButtonLink> : <ButtonLink variant="secondary" to="/courses" className="w-full">Voir mes cours</ButtonLink>}</>}
        </Card>
        {progress?.completedDates && <fieldset className="flex justify-between gap-1" aria-label="Séances de la semaine">{week.map((day, index) => <div key={day.key} className="flex flex-col items-center gap-2 text-xs text-muted"><span className={day.today ? 'font-bold text-foreground' : ''}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'][index]}</span><span role="img" aria-label={`${day.key} : ${progress.completedDates?.includes(day.key) ? 'séance terminée' : 'aucune séance terminée'}`} className={`size-8 rounded-full border ${progress.completedDates?.includes(day.key) ? 'border-primary bg-primary' : day.today ? 'border-2 border-primary bg-surface' : 'border-border bg-surface'}`} /></div>)}</fieldset>}
        <section style={{ marginBlockStart: 8 }} className="space-y-2"><h2 className="ui-section-title">Tes chapitres</h2>{chapters?.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}rounded-2xl border border-border bg-surface px-4 py-2`}><div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="ui-card-title">{chapter.title}</h3><p className="text-sm text-muted">{chapter.subject} · {chapter.seenCards} carte{chapter.seenCards > 1 ? 's' : ''} vue{chapter.seenCards > 1 ? 's' : ''} sur {chapter.cards.length}</p></div><MasteryBadge status={chapter.status} /></div><Progress className={`mastery-progress mt-1 w-full ${chapter.status === 'Solide' ? '[&::-webkit-progress-value]:!bg-success [&::-moz-progress-bar]:!bg-success' : ''}`} max={100} value={chapter.mastery ?? 0} aria-label={`Maîtrise de ${chapter.title}`} /></article>)}<Link to="/import" className="flex min-h-12 items-center justify-center rounded-2xl border border-dashed border-primary p-3 font-semibold text-primary"><PlusIcon className="mr-1.5 size-5" />Ajouter un chapitre</Link></section>
        <PlanToday />
        {progressError && <p role="status" className="text-sm text-muted">{progressError}</p>}
      </>}
    </div>
  </main>
}
