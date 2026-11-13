import { ExamButton } from '../components/Revision/ExamButton'
import Timetable from '../components/Revision/Timetable'
import { Button } from '../components/ui/Button'
import { PendingRead } from '../components/ui/PendingRead'
import { humeurSerie } from '../components/ui/revisionPresentation'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import Mascotte from '../components/Mascotte/Mascotte'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import curriculum from '../data/curriculum-ci.json'
import { REVISION_POLICY as policy } from '../../../backend/src/services/revision/policy'
import { revisionAPI, type RevisionProfile, type RevisionProgress, type RevisionExam, type RevisionChapter, type RevisionSettings } from '../lib/api'
import { cachedDevice, currentRevisionCacheVersion, revisionSnapshot } from '../lib/cachedDevice'

let cachedProfile: { device: string | null; version: number; day: string; profile: RevisionProfile | null; progress: RevisionProgress } | null = null

let profileSave: Promise<RevisionProfile> | null = null

export default function Profile() {
  const device = cachedDevice()
  if (cachedProfile && (cachedProfile.device !== device || cachedProfile.day !== new Date().toDateString())) cachedProfile = null
  const sharedProfile = revisionSnapshot<RevisionProfile | null>('/profile')
  const sharedProgress = revisionSnapshot<RevisionProgress>('/progress')
  const [profile, setProfile] = useState<RevisionProfile | null>(() => sharedProfile ?? cachedProfile?.profile ?? null)
  const [progress, setProgress] = useState<RevisionProgress | null>(() => cachedProfile?.progress ?? sharedProgress ?? null)
  const [busy, setBusy] = useState((!cachedProfile && sharedProfile === undefined) || !!profileSave)
  const dirty = useRef(false)
  const edits = useRef(0)
  const saving = useRef(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [exams, setExams] = useState<RevisionExam[]>([])
  const [examsLoaded, setExamsLoaded] = useState(false)
  const [chapters, setChapters] = useState<RevisionChapter[]>([])
  const [exam, setExam] = useState<(Omit<RevisionExam, 'id'> & { id?: string }) | null>(null)
  const [settings, setSettings] = useState<RevisionSettings | null>(null)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const entry = curriculum.find(item => item.schoolClass === profile?.schoolClass)
  const available = entry ? (entry.series as Record<string, string[] | undefined>)[profile?.series ?? ''] ?? [] : []
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      const pending = profileSave
      if (pending) await pending.catch(() => {})
      if (!active) return
      const requestDevice = cachedDevice()
      const version = currentRevisionCacheVersion()
      const requestEdits = edits.current
      let value: RevisionProfile | null, stats: RevisionProgress
      try { [value, stats] = await Promise.all([revisionAPI.profile(), revisionAPI.progress()]) }
      catch (cause) {
        if (active && requestDevice !== cachedDevice()) {
          cachedProfile = null; setProfile(null); setProgress(null); dirty.current = false; setBusy(true)
          return load()
        }
        throw cause
      }
      if (!active) return
      if (requestDevice !== cachedDevice() || version !== currentRevisionCacheVersion()) {
        cachedProfile = null
        if (requestDevice !== cachedDevice()) { setProfile(null); setProgress(null); dirty.current = false; setBusy(true) }
        return load()
      }
      if (requestEdits === edits.current && !saving.current) {
        cachedProfile = { device: requestDevice, version, day: new Date().toDateString(), profile: value, progress: stats }
        if (!dirty.current) setProfile(value)
      }
      setProgress(stats)
    }
    const requestDevice = cachedDevice()
    void revisionAPI.exams().then(value => { if (active && requestDevice === cachedDevice()) { setExams(value); setExamsLoaded(true) } }).catch(cause => { if (active && requestDevice === cachedDevice()) setError(cause instanceof Error ? cause.message : 'Impossible de charger tes examens.') })
    void revisionAPI.chapters().then(value => { if (active && requestDevice === cachedDevice()) setChapters(value) }).catch(() => {})
    load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger ton profil.') })
      .finally(() => { if (active && !saving.current) setBusy(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const device = cachedDevice()
    async function load() {
      try {
        const value = await revisionAPI.settings()
        if (active && device === cachedDevice()) setSettings(value)
      } catch {
        if (active) setSettingsError('Impossible de charger tes réglages de révision.')
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!settings || settingsBusy) return
    setSettingsBusy(true); setSettingsError(''); setSettingsSaved(false)
    try {
      setSettings(await revisionAPI.saveSettings(settings))
      setSettingsSaved(true)
    } catch (cause) { setSettingsError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer tes réglages.') }
    finally { setSettingsBusy(false) }
  }

  function update(values: Partial<RevisionProfile>) {
    edits.current++
    dirty.current = true
    setProfile(current => current && { ...current, ...values })
    setSaved(false)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile || profileSave) return
    saving.current = true
    setBusy(true)
    setSaved(false)
    setError('')
    const requestDevice = cachedDevice()
    try {
      const promise = revisionAPI.saveProfile({ ...profile, examDate: undefined })
      profileSave = promise
      const value = await promise
      if (requestDevice !== cachedDevice()) {
        cachedProfile = null; setProfile(null); setProgress(null)
        throw new Error('L’appareil a changé. Recharge la page avant de continuer.')
      }
      setProfile(value)
      dirty.current = false
      cachedProfile = progress ? { device: cachedDevice(), version: currentRevisionCacheVersion(), day: new Date().toDateString(), profile: value, progress } : null
      setSaved(true)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ton profil.') }
    finally { profileSave = null; saving.current = false; setBusy(false) }
  }

  return <main className="loop-screen min-h-dvh px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Moi</h1>
        {!error && progress && <Mascotte humeur={humeurSerie(progress.streak, progress.streakStarted)} taille={64} />}
        {!error && !busy && !profile && !progress && <Mascotte humeur="au repos" taille={64} />}
      </header>
      {busy && !profile && <PendingRead title="Mon parcours" label="On récupère ton parcours…" />}
      {error && <div role="alert"><Mascotte humeur="désolée" taille={96} /><p>{error}</p></div>}
      {progress && <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-border p-3 text-center text-sm">
        <div><dt>XP</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.xp} /></dd></div>
        <div><dt>Série</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.streak} /></dd></div>
        <div><dt>Cartes</dt><dd className="text-xl text-foreground"><AnimatedNumber value={progress.learnedCards} /></dd></div>
      </dl>}
      {profile ? <form onSubmit={save} className="space-y-5 rounded-2xl border border-border p-6" aria-busy={busy}>
        <h2 className="text-xl text-foreground">Mon parcours</h2>
        <label className="block space-y-2"><span>Ma classe</span><select className={input} disabled={busy} value={profile.schoolClass} onChange={event => {
          const next = curriculum.find(item => item.schoolClass === event.target.value)
          if (!next) return
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
        {!profile.subjects.length && <p role="status">Choisis au moins une matière.</p>}
        <Button type="submit" disabled={busy || !profile.subjects.length}>Enregistrer</Button>
        {saved && <p role="status" className="text-foreground">Ton profil est enregistré.</p>}
      </form> : !busy && !error && <p><Link to="/" className="underline">Commencer mon parcours</Link> pour créer mon profil.</p>}
      {profile && <section className="space-y-4 rounded-2xl border border-border p-6">
        <h2 className="text-xl text-foreground">Examens</h2>
        {exams.map(item => <div key={item.id} className="space-y-2 border-b border-border pb-3"><p>{item.title} · {item.date}</p><p>{item.subjects.join(', ')}</p><ExamButton id={item.id} date={item.date} /><div className="flex gap-3"><Button type="button" onClick={() => setExam(item)}>Modifier</Button><Button type="button" onClick={async () => { try { await revisionAPI.deleteExam(item.id); setExams(current => current.filter(value => value.id !== item.id)); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible.') } }}>Supprimer</Button></div></div>)}
        {!exam && <Button type="button" disabled={!examsLoaded || exams.length >= policy.maxExams} onClick={() => setExam({ title: '', date: '', subjects: [], chapterIds: [] })}>Ajouter un examen</Button>}
        {exam && <form className="space-y-4" onSubmit={async event => { event.preventDefault(); try { const value = await revisionAPI.saveExam(exam); setExams(current => [...current.filter(item => item.id !== value.id), value]); setExam(null); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.') } }}>
          <label className="block space-y-2">Intitulé<input className={input} required maxLength={policy.maxTitleChars} value={exam.title} onChange={event => setExam({ ...exam, title: event.target.value })} /></label>
          <label className="block space-y-2">Date<input className={input} required type="date" value={exam.date} onChange={event => setExam({ ...exam, date: event.target.value })} /></label>
          <fieldset><legend>Matières</legend>{profile.subjects.map(subject => <label key={subject} className="flex gap-2 p-2"><input type="checkbox" checked={exam.subjects.includes(subject)} onChange={event => { const subjects = event.target.checked ? [...exam.subjects, subject] : exam.subjects.filter(value => value !== subject); setExam({ ...exam, subjects, chapterIds: exam.chapterIds.filter(id => chapters.some(chapter => chapter.id === id && subjects.includes(chapter.subject))) }) }} />{subject}</label>)}</fieldset>
          {chapters.some(chapter => exam.subjects.includes(chapter.subject)) && <fieldset><legend>Chapitres (facultatif)</legend><p className="text-sm text-muted">Sans sélection, tous les chapitres des matières sont inclus.</p>{chapters.filter(chapter => exam.subjects.includes(chapter.subject)).map(chapter => <label key={chapter.id} className="flex gap-2 p-2"><input type="checkbox" checked={exam.chapterIds.includes(chapter.id)} onChange={event => setExam({ ...exam, chapterIds: event.target.checked ? [...exam.chapterIds, chapter.id] : exam.chapterIds.filter(id => id !== chapter.id) })} />{chapter.subject} · {chapter.title}</label>)}</fieldset>}
          <div className="flex gap-3"><Button type="submit" disabled={!exam.subjects.length}>Enregistrer l’examen</Button><Button type="button" onClick={() => setExam(null)}>Annuler</Button></div>
        </form>}
      </section>}
      {profile && <Timetable profile={profile} onProfile={setProfile} />}
      <section className="space-y-4 rounded-2xl border border-border p-6">
        <h2 className="text-xl text-foreground">Réglages de révision</h2>
        {settingsError && <p role="alert">{settingsError}</p>}
        {settings && <form onSubmit={saveSettings} className="space-y-4" aria-busy={settingsBusy}>
          <fieldset disabled={settingsBusy} className="space-y-2"><legend>Minutes par jour</legend>
            {policy.dailyMinutesChoices.map(minutes => <label key={minutes} className="mr-4 inline-flex items-center gap-2"><input type="radio" name="dailyMinutes" checked={settings.dailyMinutes === minutes} onChange={() => { setSettings({ ...settings, dailyMinutes: minutes }); setSettingsSaved(false) }} />{minutes} min</label>)}
          </fieldset>
          <fieldset disabled={settingsBusy} className="grid grid-cols-2 gap-2"><legend>Jours de repos</legend>
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, index) => {
              const value = (index + 1) % 7
              const checked = settings.restDays.includes(value)
              return <label key={day} className="flex items-center gap-2"><input type="checkbox" checked={checked} disabled={!checked && settings.restDays.length === 6} onChange={() => { setSettings({ ...settings, restDays: checked ? settings.restDays.filter(item => item !== value) : [...settings.restDays, value] }); setSettingsSaved(false) }} />{day}</label>
            })}
          </fieldset>
          <Button type="submit" disabled={settingsBusy}>Enregistrer les réglages</Button>
          {settingsSaved && <p role="status">Tes réglages sont enregistrés.</p>}
        </form>}
      </section>
      <footer className="text-xs text-muted">À propos · Lohni est basé sur <a href="https://github.com/CaviraOSS/PageLM" className="text-primary underline">PageLM</a> de nullure et recabasic, sous licence PageLM Community License.</footer>
    </div>
  </main>
}
