import { PlanToday } from '../components/Revision/PlanToday'
import { ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { humeurSerie, listDelay } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { FlameIcon } from '../components/ui/NavigationIcons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Card } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import MasteryBadge from '../components/ui/MasteryBadge'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import curriculum from '../data/curriculum-ci.json'
import Onboarding from '../components/Revision/Onboarding'
import MobileHeader from '../components/MobileHeader'
import { revisionAPI, revisionDeviceId, type RevisionHome, type RevisionProgress, type RevisionChapter, type RevisionProfile } from '../lib/api'
import { readFirstName } from '../lib/localFirstName'
import { cachedDevice, currentRevisionCacheVersion, revisionSnapshot } from '../lib/cachedDevice'

let cachedHome: { device: string | null; version: number; day: string; home: RevisionHome | null; progress: RevisionProgress | null; chapters: RevisionChapter[] | null } | null = null

export default function Home() {
  const device = cachedDevice()
  if (cachedHome && (cachedHome.device !== device || cachedHome.day !== new Date().toDateString())) cachedHome = null
  const animateEntry = useRef(!cachedHome).current
  const sharedProfile = revisionSnapshot<RevisionProfile | null>('/profile')
  const sharedHome = revisionSnapshot<RevisionHome | null>('/home')
  const sharedProgress = revisionSnapshot<RevisionProgress>('/progress')
  if (!cachedHome && sharedHome) cachedHome = { device, version: currentRevisionCacheVersion(), day: new Date().toDateString(), home: sharedHome, progress: sharedProgress ?? null, chapters: null }
  const [home, setHome] = useState<RevisionHome | null>(() => {
    const initial = cachedHome?.home ?? sharedHome
    return initial ? { ...initial, profile: sharedProfile ?? initial.profile } : null
  })
  const [progress, setProgress] = useState<RevisionProgress | null>(() => cachedHome?.progress ?? sharedProgress ?? null)
  const [loading, setLoading] = useState(!cachedHome && sharedHome === undefined)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [chapters, setChapters] = useState<RevisionChapter[] | null>(() => cachedHome?.chapters ?? null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Une tentative explicite relance la lecture ; la valeur du cache ne doit pas déclencher de nouvelle requête.
  useEffect(() => {
    let active = true
    async function load() {
      const requestDevice = cachedDevice()
      const version = currentRevisionCacheVersion()
      setError('')
      setProgressError('')
      if (!cachedHome && sharedHome === undefined) setLoading(true)
      try {
        const data = await revisionAPI.home()
        if (!active) return
        if ((requestDevice && requestDevice !== cachedDevice()) || version !== currentRevisionCacheVersion()) {
          if (requestDevice && requestDevice !== cachedDevice()) { cachedHome = null; setHome(null); setProgress(null); setChapters(null) }
          setAttempt(value => value + 1)
          return
        }
        cachedHome = data ? { device: cachedDevice(), version: currentRevisionCacheVersion(), day: new Date().toDateString(), home: data, progress: cachedHome?.progress ?? null, chapters: cachedHome?.chapters ?? null } : null
        setHome(data)
        const responseDevice = cachedDevice()
        if (data) void revisionAPI.chapters().then(value => { if (active && responseDevice === cachedDevice() && version === currentRevisionCacheVersion()) { if (cachedHome) cachedHome.chapters = value; setChapters(value) } }).catch(() => { if (active) setProgressError('Le détail de tes cartes est temporairement indisponible.') })
        if (data) void revisionAPI.progress().then(value => { if (active && responseDevice === cachedDevice() && version === currentRevisionCacheVersion()) { if (cachedHome) cachedHome.progress = value; setProgress(value) } }).catch(cause => {
          if (active && !(cause instanceof Error && cause.message.startsWith('http 404'))) setProgressError('Ta progression est temporairement indisponible.')
        })
      } catch (cause) {
        if (active) {
          if (requestDevice && requestDevice !== cachedDevice()) {
            cachedHome = null; setHome(null); setProgress(null); setChapters(null); setLoading(true); setAttempt(value => value + 1)
            return
          }
          if (cachedHome) setProgressError('La mise à jour de ton accueil est temporairement indisponible.')
          else setError(cause instanceof Error ? cause.message : 'Impossible de charger l’accueil.')
        }
      } finally { if (active && (!requestDevice || requestDevice === cachedDevice())) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [attempt])
  const [streakFrom, setStreakFrom] = useState<number | null>(null)
  useEffect(() => {
    if (!progress) return
    try {
      const key = `lohni-last-streak:${revisionDeviceId()}`
      const previous = localStorage.getItem(key)
      localStorage.setItem(key, String(progress.streak))
      const value = Number(previous)
      setStreakFrom(previous !== null && Number.isFinite(value) && value < progress.streak ? value : null)
    } catch { setStreakFrom(null) }
  }, [progress])

  if (!loading && !error && !home) return <main className="loop-screen min-h-dvh md:pl-28"><Onboarding /></main>

  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7)
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, today: date.toDateString() === today.toDateString() }
  })

  return <main className="loop-screen min-h-dvh px-4 pt-5 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-4">
      {(!home || loading || error) && <MobileHeader />}
      {(!home || loading || error) && <header className="sr-only lg:not-sr-only"><h1 className="text-2xl font-semibold text-foreground">Lohni</h1></header>}
      {loading ? <PendingRead title="Session du jour" label="On prépare ta journée…" /> : error ? <div role="alert" className="space-y-3 rounded-xl border border-danger p-4 text-foreground">
        <Mascotte humeur="désolée" taille={96} /><p>{error}</p><button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>
      </div> : !home ? null : <>
        <header className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-3">
          <span className="row-span-2"><Mascotte humeur={humeurSerie(progress?.streak, progress?.streakStarted, home.state === 'done')} taille={56} /></span>
          <h1 className="line-clamp-2 min-w-0 text-2xl font-extrabold [overflow-wrap:anywhere]">Salut{readFirstName() ? ` ${readFirstName()}` : ''} !</h1>
          {progress && <p className="flex items-center gap-1.5 rounded-full bg-tint px-3 py-2 text-primary"><FlameIcon /><strong><AnimatedNumber value={progress.streak} from={streakFrom} /></strong><span className="sr-only"> jours de série</span></p>}
          <p className="col-start-2 col-end-4 min-w-0 text-sm text-muted [overflow-wrap:anywhere]">{curriculum.find(item => item.schoolClass === home.profile.schoolClass)?.label.split(' · ')[0] ?? home.profile.schoolClass}{home.profile.series ? ` ${home.profile.series}` : ''}{home.daysUntilExam !== null && home.nextExam && <> · <Link to={`/plan#exam-${encodeURIComponent(home.nextExam.id)}`} className="underline">{home.daysUntilExam > 0 ? `${home.nextExam.title} dans ${home.daysUntilExam} jour${home.daysUntilExam > 1 ? 's' : ''}` : `${home.nextExam.title} aujourd’hui`}</Link></>}</p>
        </header>
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex justify-between gap-2 text-sm text-muted"><h2 className="font-semibold">Session du jour</h2>{home.state === 'ready' && <span>environ {home.estimatedMinutes} min</span>}</div>
          {home.state === 'ready' ? <>
            <p className="text-4xl font-bold">{home.cardCount} carte{home.cardCount > 1 ? 's' : ''}</p>
            {(home.reviewCards !== undefined || home.newCards !== undefined) && <div className="flex flex-wrap gap-2 text-sm font-semibold">{home.reviewCards !== undefined && <span className="rounded-xl border border-border bg-background px-3 py-1.5">{home.reviewCards} à revoir</span>}{home.newCards !== undefined && <span className="rounded-xl border border-border bg-background px-3 py-1.5">{home.newCards} nouvelle{home.newCards > 1 ? 's' : ''}</span>}</div>}
            <ButtonLink to="/revision" className="block w-full rounded-2xl p-4 text-lg">{home.started ? 'Continuer' : 'Commencer'}</ButtonLink>
          </> : home.state === 'done' ? <><p className="text-xl font-semibold">Session du jour terminée !</p><p>Ta journée est faite. Reviens demain pour entretenir ce que tu as appris.</p>{home.moreCards && <Link to="/revision" className="block underline">Continuer les cartes restantes</Link>}</> : <><p className="text-xl font-semibold">Aucune carte à réviser</p><p>{home.totalCards === 0 ? 'Importe ton cours pour créer tes cartes ou prépare un premier chapitre.' : "Aucune carte n'est à réviser aujourd'hui."}</p>{home.totalCards === 0 ? <ButtonLink className="block w-full rounded-2xl p-4" to="/revision">Préparer un chapitre</ButtonLink> : <Link to="/courses" className="underline">Voir mes cours</Link>}</>}
        </Card>
        {progress?.completedDates && <fieldset className="flex justify-between gap-1" aria-label="Séances de la semaine">{week.map((day, index) => <div key={day.key} className="flex flex-col items-center gap-2 text-xs text-muted"><span className={day.today ? 'font-bold text-foreground' : ''}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'][index]}</span><span role="img" aria-label={`${day.key} : ${progress.completedDates?.includes(day.key) ? 'séance terminée' : 'aucune séance terminée'}`} className={`size-8 rounded-full border ${progress.completedDates?.includes(day.key) ? 'border-primary bg-primary' : day.today ? 'border-2 border-primary bg-surface' : 'border-border bg-surface'}`} /></div>)}</fieldset>}
        <section style={{ marginBlockStart: 8 }} className="space-y-2"><h2 className="text-xl font-extrabold">Tes chapitres</h2>{chapters?.map((chapter, index) => <article key={chapter.id} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}rounded-2xl border border-border bg-surface px-4 py-2`}><div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-bold">{chapter.title}</h3><p className="text-sm text-muted">{chapter.subject} · {chapter.seenCards} carte{chapter.seenCards > 1 ? 's' : ''} vue{chapter.seenCards > 1 ? 's' : ''} sur {chapter.cards.length}</p></div><MasteryBadge status={chapter.status} /></div><Progress className={`mastery-progress mt-1 w-full ${chapter.status === 'Solide' ? '[&::-webkit-progress-value]:!bg-success [&::-moz-progress-bar]:!bg-success' : ''}`} max={100} value={chapter.mastery ?? 0} aria-label={`Maîtrise de ${chapter.title}`} /></article>)}<Link to="/import" className="flex min-h-12 items-center justify-center rounded-2xl border border-dashed border-primary p-3 font-semibold text-primary">+ Ajouter un chapitre</Link></section>
        <PlanToday />
        {progressError && <p role="status" className="text-sm text-muted">{progressError}</p>}
      </>}
    </div>
  </main>
}
