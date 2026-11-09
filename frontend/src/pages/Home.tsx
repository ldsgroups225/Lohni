import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Onboarding from '../components/Revision/Onboarding'
import { revisionAPI, type RevisionHome, type RevisionProgress } from '../lib/api'

export default function Home() {
  const [home, setHome] = useState<RevisionHome | null>(null)
  const [progress, setProgress] = useState<RevisionProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setError('')
      setProgressError('')
      setLoading(true)
      try {
        const data = await revisionAPI.home()
        if (!active) return
        setHome(data)
        if (data) void revisionAPI.progress().then(value => { if (active) setProgress(value) }).catch(cause => {
          if (active && !(cause instanceof Error && cause.message.startsWith('http 404'))) setProgressError('Ta progression est temporairement indisponible.')
        })
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger l’accueil.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [attempt])
  const button = 'block w-full rounded-2xl bg-sky-600 p-5 text-center text-xl font-semibold text-white hover:bg-sky-500'

  return <main className="min-h-screen px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-white">Lohni</h1><Link to="/tutor" className="underline">Tuteur</Link></header>
      {loading ? <p role="status">Chargement de ta journée…</p> : error ? <div role="alert" className="space-y-3 rounded-xl border border-red-800 p-4 text-red-200">
        <p>{error}</p><button className="underline" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>
      </div> : !home ? <Onboarding /> : <>
        <p>{home.profile.schoolClass}{home.profile.series ? ` · Série ${home.profile.series}` : ''}</p>
        <div className="flex flex-wrap gap-4">
          {progress && <p className="rounded-xl border border-stone-800 px-4 py-3">Série : <strong className="text-white">{progress.streak} jour{progress.streak > 1 ? 's' : ''}</strong></p>}
          {home.daysUntilExam !== null && <p className="rounded-xl border border-stone-800 px-4 py-3">{home.daysUntilExam > 0 ? `Examen dans ${home.daysUntilExam} jour${home.daysUntilExam > 1 ? 's' : ''}` : 'Date d’examen atteinte'}</p>}
        </div>
        <section className="space-y-5 rounded-2xl border border-stone-800 bg-stone-950 p-6">
          <h2 className="text-2xl font-semibold text-white">{home.state === 'done' ? 'Session du jour terminée !' : home.state === 'empty' ? 'Aucune carte à réviser' : 'Prêt pour ta session du jour ?'}</h2>
          {home.state === 'ready' ? <>
            <p>{home.cardCount} carte{home.cardCount > 1 ? 's' : ''} · environ {home.estimatedMinutes} min</p>
            <Link to="/revision" className={button}>Session du jour</Link>
          </> : home.state === 'done' ? <>
            <p>Ta journée est faite. Reviens demain pour entretenir ce que tu as appris.</p>
            <Link to="/revision" className="block underline">Continuer les cartes restantes</Link>
          </> : <p>{home.totalCards === 0 ? 'Importe ton cours pour créer tes cartes ou prépare un premier chapitre.' : 'Tes prochaines cartes arriveront demain. Tu peux importer un autre cours en attendant.'}</p>}
          {home.totalCards === 0 && <Link className={button} to="/revision">Préparer un chapitre</Link>}
          <Link to="/import" className="block text-sky-300 underline">Importer mon cours</Link>
        </section>
        {progress && <section className="space-y-4" aria-label="Maîtrise par matière"><h2 className="text-xl font-semibold text-white">Tes matières</h2>{progress.subjects.map(subject => <article key={subject.subjectId} className="rounded-xl border border-stone-800 p-4">
          <div className="mb-3 flex justify-between gap-3"><h3>{subject.name}</h3><span>{subject.mastery === null ? 'Pas encore révisée' : `${subject.status} · ${Math.round(subject.mastery)} %`}</span></div>
          <progress className="w-full" max={100} value={subject.mastery ?? 0} aria-label={`Maîtrise en ${subject.name}`} />
        </article>)}</section>}
        {progressError && <p role="status" className="text-sm text-stone-400">{progressError}</p>}
      </>}
      <footer className="text-xs text-stone-500">Lohni, basé sur <a href="https://github.com/CaviraOSS/PageLM" className="underline">PageLM</a></footer>
    </div>
  </main>
}
