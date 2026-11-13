import { PlanToday } from '../components/Revision/PlanToday'
import { ButtonLink } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { humeurSerie, listDelay } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { FlameIcon } from '../components/ui/NavigationIcons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Card } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import curriculum from '../data/curriculum-ci.json'
import Onboarding from '../components/Revision/Onboarding'
import MobileHeader from '../components/MobileHeader'
import { revisionAPI, revisionDeviceId, type RevisionHome, type RevisionProgress, type RevisionChapter, type RevisionProfile } from '../lib/api'
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

  return <main className="loop-screen min-h-dvh px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-6">
      {(!home || loading || error) && <MobileHeader />}
      {(!home || loading || error) && <header className="sr-only lg:not-sr-only"><h1 className="text-2xl font-semibold text-foreground">Lohni</h1></header>}
      {loading ? <PendingRead title="Session du jour" label="On prépare ta journée…" /> : error ? <div role="alert" className="space-y-3 rounded-xl border border-danger p-4 text-foreground">
        <Mascotte humeur="désolée" taille={96} /><p>{error}</p><button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>
      </div> : !home ? <Onboarding /> : <>
        <header className="flex items-center gap-3">
          <Mascotte humeur={humeurSerie(progress?.streak, progress?.streakStarted, home.state === 'done')} taille={72} />
          <div><h1 className="text-2xl font-bold">Salut !</h1><p className="text-muted">{home.cardCount} carte{home.cardCount > 1 ? 's' : ''} t’attend{home.cardCount > 1 ? 'ent' : ''} aujourd’hui.</p></div>
        </header>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p className="rounded-full border border-border px-3 py-1.5">{curriculum.find(item => item.schoolClass === home.profile.schoolClass)?.label ?? home.profile.schoolClass}{home.profile.series ? ` · Série ${home.profile.series}` : ''}</p>
          {progress && <p className="flex items-center gap-1.5 rounded-full bg-tint px-3 py-1.5"><span className="text-primary"><FlameIcon /></span><strong className="text-base"><AnimatedNumber value={progress.streak} from={streakFrom} /></strong> jour{progress.streak > 1 ? 's' : ''} de série</p>}
          {home.daysUntilExam !== null && <p className="rounded-full border border-border px-3 py-1.5">{home.daysUntilExam > 0 ? `${home.nextExam?.title ?? "Examen"} dans ${home.daysUntilExam} jour${home.daysUntilExam > 1 ? 's' : ''}` : `${home.nextExam?.title ?? 'Examen'} aujourd’hui`}</p>}
        </div>
        <Card className="space-y-4 p-5">
          <h2 className="text-2xl font-semibold text-foreground">{home.state === 'done' ? 'Session du jour terminée !' : home.state === 'empty' ? 'Aucune carte à réviser' : 'Session du jour'}</h2>
          {home.state === 'ready' ? <>
            <p>{home.cardCount} carte{home.cardCount > 1 ? 's' : ''} · environ {home.estimatedMinutes} min</p>
            <ButtonLink to="/revision" className="block w-full rounded-2xl p-5 text-xl">{home.started ? 'Continuer' : 'Commencer'}</ButtonLink>
          </> : home.state === 'done' ? <>
            <p>Ta journée est faite. Reviens demain pour entretenir ce que tu as appris.</p>
            {home.moreCards && <Link to="/revision" className="block underline">Continuer les cartes restantes</Link>}
          </> : <p>{home.totalCards === 0 ? 'Importe ton cours pour créer tes cartes ou prépare un premier chapitre.' : "Aucune carte n'est à réviser aujourd'hui."}</p>}
          {home.state === 'empty' && home.totalCards > 0 && <Link to="/courses" className="block underline">Voir mes cours</Link>}
          {home.totalCards === 0 && <ButtonLink className="block w-full rounded-2xl p-5 text-xl" to="/revision">Préparer un chapitre</ButtonLink>}
          <Link to="/import" className="block text-primary underline">Importer mon cours</Link>
        </Card>
        <PlanToday />
        {progress && <section className="space-y-4" aria-label="Maîtrise par matière"><h2 className="text-xl font-semibold text-foreground">Tes matières</h2>{progress.subjects.map((subject, index) => {
          const own = chapters?.filter(chapter => chapter.subjectId === subject.subjectId)
          const seen = own?.reduce((sum, chapter) => sum + chapter.seenCards, 0)
          const total = own?.reduce((sum, chapter) => sum + chapter.cards.length, 0)
          return <article key={subject.subjectId} style={{ animationDelay: listDelay(index) }} className={`${animateEntry ? 'motion-list ' : ''}rounded-xl border border-border p-4`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3>{subject.name}</h3><span className="whitespace-nowrap">{subject.mastery === null ? 'Pas encore révisée' : <>{subject.status} · <AnimatedNumber value={Math.round(subject.mastery)} /> %</>}</span></div>
          {seen !== undefined && <p className="mb-2 text-sm text-muted">{seen} carte{seen > 1 ? 's' : ''} vue{seen > 1 ? 's' : ''} sur {total}</p>}
          <Progress className="mastery-progress w-full" max={100} value={subject.mastery ?? 0} aria-label={`Maîtrise en ${subject.name}`} />
        </article>})}</section>}
        {progressError && <p role="status" className="text-sm text-muted">{progressError}</p>}
      </>}
    </div>
  </main>
}
