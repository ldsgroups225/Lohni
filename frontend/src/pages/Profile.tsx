import { ExamButton } from '../components/Revision/ExamButton'
import Timetable from '../components/Revision/Timetable'
import { Button, ButtonLink } from '../components/ui/Button'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { PendingRead } from '../components/ui/PendingRead'
import { humeurSerie } from '../components/ui/revisionPresentation'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import Mascotte from '../components/Mascotte/Mascotte'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { confirmDialog } from '../lib/confirm'
import curriculum from '../data/curriculum-ci.json'
import { REVISION_POLICY as policy } from '../../../backend/src/services/revision/policy'
import { DEVICE_CHANGED, revisionAPI, type RevisionProfile, type RevisionProgress, type RevisionExam, type RevisionChapter, type RevisionSettings } from '../lib/api'
import { useRevisionRead } from '../lib/useRevisionRead'
import { readFirstName, writeFirstName } from '../lib/localFirstName'

let profileSave: Promise<RevisionProfile> | null = null

export default function Profile() {
  const page = useLocation().pathname.split('/')[2] ?? ''
  const sharedProfile = revisionAPI.cached.profile()
  const sharedProgress = revisionAPI.cached.progress()
  const [profile, setProfile] = useState<RevisionProfile | null>(() => sharedProfile ?? null)
  const [progress, setProgress] = useState<RevisionProgress | null>(() => sharedProgress ?? null)
  const [busy, setBusy] = useState(sharedProfile === undefined || !!profileSave)
  const dirty = useRef(false)
  const edits = useRef(0)
  const saving = useRef(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [firstName, setFirstName] = useState(() => readFirstName())
  const nameDevice = useRef(revisionAPI.deviceGuard())
  const [exams, setExams] = useState<RevisionExam[]>([])
  const [examsLoaded, setExamsLoaded] = useState(false)
  const [timetableCount, setTimetableCount] = useState<number | null>(null)
  const [timetableError, setTimetableError] = useState(false)
  const [chapters, setChapters] = useState<RevisionChapter[]>([])
  const [exam, setExam] = useState<(Omit<RevisionExam, 'id'> & { id?: string }) | null>(null)
  const [settings, setSettings] = useState<RevisionSettings | null>(null)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [resourceVersion, setResourceVersion] = useState(0)
  const entry = curriculum.find(item => item.schoolClass === profile?.schoolClass)
  const available = entry ? (entry.series as Record<string, string[] | undefined>)[profile?.series ?? ''] ?? [] : []
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  const reload = useRevisionRead(async () => {
    const pending = profileSave
    if (pending) await pending.catch(() => {})
    const requestEdits = edits.current
    if (nameDevice.current.changed()) { nameDevice.current = revisionAPI.deviceGuard(); setFirstName(readFirstName()) }
    const [value, stats] = await Promise.all([revisionAPI.profile(), revisionAPI.progress()])
    return { value, stats, requestEdits }
  }, {
    accept: ({ value, stats, requestEdits }) => {
      if (requestEdits === edits.current && !saving.current && !dirty.current) setProfile(value)
      setProgress(stats)
    },
    onChanged: () => { setProfile(null); setProgress(null); setExams([]); setExamsLoaded(false); setChapters([]); setSettings(null); setTimetableCount(null); dirty.current = false; setBusy(true); setResourceVersion(value => value + 1) },
    fail: cause => setError(cause instanceof Error ? cause.message : 'Impossible de charger ton profil.'),
    settled: () => { if (!saving.current) setBusy(false) },
  })

  useRevisionRead(revisionAPI.timetable, { accept: value => { setTimetableCount(value.length); setTimetableError(false) }, fail: () => setTimetableError(true) }, [resourceVersion])
  useRevisionRead(revisionAPI.exams, { accept: value => { setExams(value); setExamsLoaded(true) }, fail: cause => setError(cause instanceof Error ? cause.message : 'Impossible de charger tes examens.') }, [resourceVersion])
  useRevisionRead(revisionAPI.chapters, { accept: setChapters }, [resourceVersion])
  useRevisionRead(revisionAPI.settings, { accept: value => { setSettings(value); setSettingsError('') }, fail: () => setSettingsError('Impossible de charger tes réglages de révision.') }, [resourceVersion])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!settings || settingsBusy) return
    setSettingsBusy(true); setSettingsError(''); setSettingsSaved(false)
    const guard = revisionAPI.deviceGuard()
    try {
      const value = await revisionAPI.saveSettings(settings)
      if (guard.changed()) setSettings(null)
      guard.assert()
      setSettings(value)
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
    if (page === 'profil' && nameDevice.current.changed()) { setError(DEVICE_CHANGED); return }
    saving.current = true
    setBusy(true)
    setSaved(false)
    setError('')
    const guard = revisionAPI.deviceGuard()
    try {
      const promise = revisionAPI.saveProfile({ ...profile, examDate: undefined })
      profileSave = promise
      const value = await promise
      if (guard.changed()) { setProfile(null); setProgress(null) }
      guard.assert()
      if (page === 'profil' && !writeFirstName(firstName.trim())) setError('Impossible d’enregistrer ton prénom sur cet appareil.')
      setProfile(value)
      dirty.current = false
      setSaved(true)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ton profil.') }
    finally { profileSave = null; saving.current = false; setBusy(false) }
  }

  function retry() {
    setError('')
    setBusy(true)
    setResourceVersion(value => value + 1)
    reload().catch(cause => setError(cause instanceof Error ? cause.message : 'Impossible de charger ton profil.')).finally(() => setBusy(false))
  }

  return <main className="loop-screen min-h-dvh px-4 pt-4 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-4">
      {page ? <ScreenHeader back="/me" backLabel="Retour à Moi" title={({ profil: 'Mon profil', examens: 'Examens', matieres: 'Matières', 'emploi-du-temps': 'Emploi du temps', rythme: 'Rythme de révision' } as Record<string, string>)[page] ?? 'Moi'} /> : <header className="flex items-center gap-3">
        {!error && progress && <span className="shrink-0"><Mascotte humeur={humeurSerie(progress.streak, progress.streakStarted)} taille={56} /></span>}
        {!error && !busy && !profile && !progress && <span className="shrink-0"><Mascotte humeur="au repos" taille={56} /></span>}
        <div className="min-w-0 flex-1"><h1 className="text-[26px] font-extrabold text-foreground">Moi</h1>
        {profile && <p className="text-sm text-muted">{entry?.label.split(' · ')[0] ?? profile.schoolClass}{profile.series ? ` · Série ${profile.series}` : ''}</p>}</div>
        {profile && <ButtonLink variant="secondary" to="/me/profil">Modifier</ButtonLink>}
      </header>}
      {busy && !profile && <PendingRead title="Mon parcours" label="On récupère ton parcours…" />}
      {error && <div role="alert" className="space-y-3 rounded-xl border border-danger p-4 text-foreground"><Mascotte humeur="désolée" taille={96} /><p>{error}</p><Button variant="secondary" disabled={busy} onClick={retry}>Réessayer</Button></div>}
      {!page && progress && <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3"><dt className="order-2 text-muted">XP</dt><dd className="order-1 text-2xl font-bold text-foreground"><AnimatedNumber value={progress.xp} /></dd></div>
        <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3"><dt className="order-2 text-muted">de série</dt><dd className="order-1 text-2xl font-bold text-foreground"><AnimatedNumber value={progress.streak} /> j</dd></div>
        <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3"><dt className="order-2 text-muted">cartes</dt><dd className="order-1 text-2xl font-bold text-foreground"><AnimatedNumber value={progress.learnedCards} /></dd></div>
      </dl>}
      {!page && profile && <>
        <h2 className="font-semibold text-muted">Mon organisation</h2>
        <section aria-label="Mon organisation" style={{ marginBlockStart: 4 }} className="overflow-hidden rounded-2xl border border-border bg-surface">
          {[
            ['/me/examens', 'Examens', examsLoaded ? (exams.length ? exams.map(item => `${item.title} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`).join(', ') : 'Aucun examen ajouté') : 'Chargement…'],
            ['/me/matieres', 'Matières', `${profile.subjects.length} matière${profile.subjects.length > 1 ? 's' : ''}`],
            ['/me/emploi-du-temps', 'Emploi du temps', timetableError ? 'Chargement impossible' : timetableCount === null ? 'Chargement…' : timetableCount ? `${timetableCount} cours ajouté${timetableCount > 1 ? 's' : ''}` : 'Aucun cours ajouté'],
            ['/me/rythme', 'Rythme de révision', settings ? `${settings.dailyMinutes} min par jour · ${settings.restDays.length} jour${settings.restDays.length > 1 ? 's' : ''} de repos` : settingsError ? 'Chargement impossible' : 'Chargement…'],
            ['/plan', 'Mon plan', !examsLoaded ? 'Voir mon plan de révision' : exams.length ? 'Voir mon plan de révision' : 'Ajoute un examen pour préparer ton plan'],
          ].map(([to, title, detail]) => <Link key={to} to={to} className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0"><span><strong className="block text-foreground">{title}</strong><span className="text-sm text-muted">{detail}</span></span><span aria-hidden="true">›</span></Link>)}
        </section>
      </>}
      {profile && (page === 'profil' || page === 'matieres') ? <form onSubmit={save} className="space-y-5 rounded-2xl border border-border p-6" aria-busy={busy}>
        {page === 'profil' && <><label className="block space-y-2"><span>Prénom (facultatif)</span><input className={input} autoComplete="given-name" disabled={busy} value={firstName} onChange={event => { setFirstName(event.target.value); setSaved(false) }} /><small className="block text-muted">Ton prénom reste sur cet appareil.</small></label><label className="block space-y-2"><span>Ma classe</span><select className={input} disabled={busy} value={profile.schoolClass} onChange={event => {
          const next = curriculum.find(item => item.schoolClass === event.target.value)
          if (!next) return
          const series = Object.keys(next.series)[0]
          update({ schoolClass: next.schoolClass, series: series || undefined })
        }}>{curriculum.map(item => <option key={item.schoolClass} value={item.schoolClass}>{item.label}</option>)}</select></label>
        {entry && Object.keys(entry.series)[0] !== '' && <label className="block space-y-2"><span>Ma série</span><select className={input} disabled={busy} value={profile.series ?? ''} onChange={event => {
          const series = event.target.value
          update({ series })
        }}>{Object.keys(entry.series).map(series => <option key={series}>{series}</option>)}</select></label>}
        </>}
        {page === 'matieres' && <><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3">Mes matières</legend>{[...new Set([...available, ...profile.subjects])].map(subject => <label key={subject} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <input type="checkbox" checked={profile.subjects.includes(subject)} onChange={event => update({ subjects: event.target.checked ? [...profile.subjects, subject] : profile.subjects.filter(value => value !== subject) })} />{subject}
        </label>)}</fieldset>
        <p className="text-sm text-muted">Les cours des matières décochées restent dans Cours. Leurs cartes sont mises de côté jusqu’à ce que tu recoches la matière.</p>
        {!profile.subjects.length && <p role="status">Choisis au moins une matière.</p>}</>}
        <Button type="submit" disabled={busy || !profile.subjects.length}>Enregistrer</Button>
        {saved && <p role="status" className="text-foreground">Ton profil est enregistré.</p>}
      </form> : !profile && !busy && !error && <div className="space-y-3"><p>Crée ton profil pour suivre ton parcours.</p><ButtonLink to="/" className="w-full">Commencer mon parcours</ButtonLink></div>}
      {profile && page === 'examens' && <section className="space-y-4 rounded-2xl border border-border p-6">
        {exams.map(item => <div key={item.id} className="space-y-2 border-b border-border pb-3"><p>{item.title} · {new Date(`${item.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p><p>{item.subjects.join(', ')}</p><ExamButton id={item.id} date={item.date} /><div className="flex gap-3"><Button className="!bg-surface !text-foreground border border-border" type="button" onClick={() => setExam(item)}>Modifier</Button><Button className="!bg-surface !text-foreground border border-border" type="button" onClick={async () => { if (!await confirmDialog('Supprimer cet examen ? Il ne sera plus pris en compte dans ton plan.')) return; try { await revisionAPI.deleteExam(item.id); setExams(current => current.filter(value => value.id !== item.id)); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible.') } }}>Supprimer</Button></div></div>)}
        {!exam && <Button type="button" disabled={!examsLoaded || exams.length >= policy.maxExams} onClick={() => setExam({ title: '', date: '', subjects: [], chapterIds: [] })}>Ajouter un examen</Button>}
        {exam && <form className="space-y-4" onSubmit={async event => { event.preventDefault(); try { const value = await revisionAPI.saveExam(exam); setExams(current => [...current.filter(item => item.id !== value.id), value]); setExam(null); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.') } }}>
          <label className="block space-y-2">Intitulé<input className={input} required maxLength={policy.maxTitleChars} value={exam.title} onChange={event => setExam({ ...exam, title: event.target.value })} /></label>
          <label className="block space-y-2">Date<input className={input} required type="date" value={exam.date} onChange={event => setExam({ ...exam, date: event.target.value })} /></label>
          <fieldset><legend>Matières</legend>{profile.subjects.map(subject => <label key={subject} className="flex min-h-11 items-center gap-2 p-2"><input type="checkbox" checked={exam.subjects.includes(subject)} onChange={event => { const subjects = event.target.checked ? [...exam.subjects, subject] : exam.subjects.filter(value => value !== subject); setExam({ ...exam, subjects, chapterIds: exam.chapterIds.filter(id => chapters.some(chapter => chapter.id === id && subjects.includes(chapter.subject))) }) }} />{subject}</label>)}</fieldset>
          {chapters.some(chapter => exam.subjects.includes(chapter.subject)) && <fieldset><legend>Chapitres (facultatif)</legend><p className="text-sm text-muted">Sans sélection, tous les chapitres des matières sont inclus.</p>{chapters.filter(chapter => exam.subjects.includes(chapter.subject)).map(chapter => <label key={chapter.id} className="flex min-h-11 items-center gap-2 p-2"><input type="checkbox" checked={exam.chapterIds.includes(chapter.id)} onChange={event => setExam({ ...exam, chapterIds: event.target.checked ? [...exam.chapterIds, chapter.id] : exam.chapterIds.filter(id => id !== chapter.id) })} />{chapter.subject} · {chapter.title}</label>)}</fieldset>}
          <div className="flex gap-3"><Button type="submit" disabled={!exam.subjects.length}>Enregistrer l’examen</Button><Button variant="secondary" type="button" onClick={() => setExam(null)}>Annuler</Button></div>
        </form>}
      </section>}
      {profile && page === 'emploi-du-temps' && <Timetable profile={profile} onProfile={setProfile} />}
      {page === 'rythme' && <section className="space-y-4 rounded-2xl border border-border p-6">
        {settingsError && <p role="alert">{settingsError}</p>}
        {settings && <form onSubmit={saveSettings} className="space-y-4" aria-busy={settingsBusy}>
          <fieldset disabled={settingsBusy} className="space-y-2"><legend>Minutes par jour</legend>
            {policy.dailyMinutesChoices.map(minutes => <label key={minutes} className="mr-4 inline-flex min-h-11 items-center gap-2"><input type="radio" name="dailyMinutes" checked={settings.dailyMinutes === minutes} onChange={() => { setSettings({ ...settings, dailyMinutes: minutes }); setSettingsSaved(false) }} />{minutes} min</label>)}
          </fieldset>
          <fieldset disabled={settingsBusy} className="grid grid-cols-2 gap-2"><legend>Jours de repos</legend>
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, index) => {
              const value = (index + 1) % 7
              const checked = settings.restDays.includes(value)
              return <label key={day} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} disabled={!checked && settings.restDays.length === 6} onChange={() => { setSettings({ ...settings, restDays: checked ? settings.restDays.filter(item => item !== value) : [...settings.restDays, value] }); setSettingsSaved(false) }} />{day}</label>
            })}
          </fieldset>
          <Button type="submit" disabled={settingsBusy}>Enregistrer les réglages</Button>
          {settingsSaved && <p role="status">Tes réglages sont enregistrés.</p>}
        </form>}
      </section>}
      {!page && <footer className="text-center text-xs text-muted">À propos · Lohni est basé sur <a href="https://github.com/CaviraOSS/PageLM" className="inline-flex min-h-11 items-center font-semibold text-primary">PageLM</a> de nullure et recabasic, sous licence PageLM Community License.</footer>}
    </div>
  </main>
}
