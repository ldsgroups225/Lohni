import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { humeurSerie } from '../components/ui/revisionPresentation'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import Mascotte from '../components/Mascotte/Mascotte'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import curriculum from '../data/curriculum-ci.json'
import { revisionAPI, type RevisionProfile, type RevisionProgress } from '../lib/api'

export default function Profile() {
  const [profile, setProfile] = useState<RevisionProfile | null>(null)
  const [progress, setProgress] = useState<RevisionProgress | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const entry = curriculum.find(item => item.schoolClass === profile?.schoolClass)
  const available = entry ? (entry.series as Record<string, string[] | undefined>)[profile?.series ?? ''] ?? [] : []
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  useEffect(() => {
    let active = true
    Promise.all([revisionAPI.profile(), revisionAPI.progress()]).then(([value, stats]) => {
      if (active) { setProfile(value); setProgress(stats) }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger ton profil.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  function update(values: Partial<RevisionProfile>) {
    setProfile(current => current && { ...current, ...values })
    setSaved(false)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setBusy(true)
    setSaved(false)
    setError('')
    try { setProfile(await revisionAPI.saveProfile(profile)); setSaved(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ton profil.') }
    finally { setBusy(false) }
  }

  return <main className="loop-screen min-h-screen px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Moi</h1>
      {busy && !profile && !progress && <LoadingState />}
      {error && <div role="alert"><Mascotte humeur="désolée" taille={96} /><p>{error}</p></div>}
      {!error && progress && <Mascotte humeur={humeurSerie(progress.streak, progress.streakStarted)} taille={112} />}
      {!error && !busy && !profile && !progress && <Mascotte humeur="au repos" taille={112} />}
      {progress && <dl className="grid grid-cols-3 gap-3 rounded-2xl border border-border p-5 text-center">
        <div><dt>XP</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.xp} /></dd></div>
        <div><dt>Série</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.streak} /></dd></div>
        <div><dt>Cartes</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.learnedCards} /></dd></div>
      </dl>}
      {profile ? <form onSubmit={save} className="space-y-5 rounded-2xl border border-border p-6" aria-busy={busy}>
        <h2 className="text-xl text-foreground">Mon parcours</h2>
        <label className="block space-y-2"><span>Ma classe</span><select className={input} disabled={busy} value={profile.schoolClass} onChange={event => {
          const next = curriculum.find(item => item.schoolClass === event.target.value)!
          const series = Object.keys(next.series)[0]
          update({ schoolClass: next.schoolClass, series: series || undefined, subjects: (next.series as Record<string, string[] | undefined>)[series] ?? [] })
        }}>{curriculum.map(item => <option key={item.schoolClass} value={item.schoolClass}>{item.label}</option>)}</select></label>
        {entry && Object.keys(entry.series)[0] !== '' && <label className="block space-y-2"><span>Ma série</span><select className={input} disabled={busy} value={profile.series ?? ''} onChange={event => {
          const series = event.target.value
          update({ series, subjects: (entry.series as Record<string, string[] | undefined>)[series] ?? [] })
        }}>{Object.keys(entry.series).map(series => <option key={series}>{series}</option>)}</select></label>}
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3">Mes matières</legend>{[...new Set([...available, ...profile.subjects])].map(subject => <label key={subject} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <input type="checkbox" checked={profile.subjects.includes(subject)} onChange={event => update({ subjects: event.target.checked ? [...profile.subjects, subject] : profile.subjects.filter(value => value !== subject) })} />{subject}
        </label>)}</fieldset>
        <p className="text-sm text-muted">Les cours des matières décochées restent dans Cours. Leurs cartes sont mises de côté jusqu’à ce que tu recoches la matière.</p>
        <label className="block space-y-2"><span>Date d’examen (facultative)</span><input className={input} disabled={busy} type="date" value={profile.examDate ?? ''} onChange={event => update({ examDate: event.target.value || undefined })} /></label>
        {!profile.subjects.length && <p role="status">Choisis au moins une matière.</p>}
        <Button type="submit" disabled={busy || !profile.subjects.length}>Enregistrer</Button>
        {saved && <p role="status" className="text-foreground">Ton profil est enregistré.</p>}
      </form> : !busy && !error && <p><Link to="/" className="underline">Commencer mon parcours</Link> pour créer mon profil.</p>}
      <footer className="text-xs text-muted">À propos · Lohni est basé sur <a href="https://github.com/CaviraOSS/PageLM" className="text-primary underline">PageLM</a> de nullure et recabasic, sous licence PageLM Community License.</footer>
    </div>
  </main>
}
