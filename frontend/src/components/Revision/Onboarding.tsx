import Mascotte from '../Mascotte/Mascotte'
import { Button } from '../ui/Button'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import curriculum from '../../data/curriculum-ci.json'
import { revisionAPI, revisionPolicy } from '../../lib/api'

export default function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useSearchParams()
  const depth = typeof location.state?.onboardingDepth === 'number' ? location.state.onboardingDepth : 0
  const requestedStep = Number(search.get('etape'))
  const requested = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 4 ? requestedStep : 1
  const setStep = (next: number) => { const params = new URLSearchParams(search); params.set('etape', String(next)); setSearch(params, { state: { ...location.state, onboardingDepth: depth + 1 } }) }
  const [saved] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lohni-onboarding') ?? '{}') ?? {} } catch { return {} }
  })
  const [schoolClass, setSchoolClass] = useState(() => curriculum.some(item => item.schoolClass === saved.schoolClass) ? saved.schoolClass as string : '3e')
  const [series, setSeries] = useState(() => {
    const choices = (curriculum.find(item => item.schoolClass === schoolClass) ?? curriculum[0]).series
    return typeof saved.series === 'string' && saved.series in choices ? saved.series as string : ''
  })
  const [seriesConfirmed, setSeriesConfirmed] = useState(() => saved.seriesConfirmed === true)
  const entry = curriculum.find(item => item.schoolClass === schoolClass) ?? curriculum[0]
  const available = (entry.series as Record<string, string[] | undefined>)[series] ?? []
  const [subjects, setSubjects] = useState<string[]>(() => Array.isArray(saved.subjects) ? saved.subjects.filter((name: unknown): name is string => typeof name === 'string' && available.includes(name)) : available)
  const [examDate, setExamDate] = useState(() => typeof saved.examDate === 'string' ? saved.examDate as string : '')
  const [subject, setSubject] = useState(() => typeof saved.subject === 'string' && subjects.includes(saved.subject) ? saved.subject as string : subjects[0] ?? '')
  const selectedSubject = subjects.includes(subject) ? subject : subjects[0] ?? ''
  const needsSeries = !('' in entry.series)
  const step = needsSeries && (!series || !seriesConfirmed) ? 1 : requested > 2 && !subjects.length ? 2 : requested
  useEffect(() => {
    if (step !== requested) { const params = new URLSearchParams(search); params.set('etape', String(step)); setSearch(params, { replace: true, state: location.state }) }
  }, [step, requested, search, setSearch, location.state])
  const [title, setTitle] = useState(() => typeof saved.title === 'string' ? saved.title as string : '')
  useEffect(() => {
    try { sessionStorage.setItem('lohni-onboarding', JSON.stringify({ schoolClass, series, seriesConfirmed, subjects, examDate, subject: selectedSubject, title })) } catch { /* Storage is optional. */ }
  }, [schoolClass, series, seriesConfirmed, subjects, examDate, selectedSubject, title])
  const finishing = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reprendre la navigation après chaque changement d'entrée dans l'historique.
  useEffect(() => {
    if (!finishing.current || depth) return
    finishing.current = false
    void (async () => { await navigate('/', { replace: true }); await navigate('/revision') })()
  }, [location.key, depth, navigate])
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  // Masque la navigation principale (index.css) tant que l'élève n'a pas de profil.
  useEffect(() => { document.body.dataset.onboarding = ''; return () => { delete document.body.dataset.onboarding } }, [])
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || (needsSeries && (!series || !seriesConfirmed)) || (step > 1 && !subjects.length)) return
    if (step < 4) {
      setStep(step + 1)
      return
    }
    if (!selectedSubject || !title.trim()) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await revisionAPI.saveProfile({ schoolClass, series: series || undefined, subjects, examDate: examDate || undefined })
      await revisionAPI.generateChapter({ subject: selectedSubject, title: title.trim() })
      try { sessionStorage.removeItem('lohni-onboarding') } catch { /* Storage is optional. */ }
      finishing.current = true
      if (depth) void navigate(-depth)
      else void navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de préparer tes cartes. Réessaie.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <form onSubmit={submit} className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background px-4 pt-6 text-foreground" aria-busy={busy}>
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden="true">{[1, 2, 3, 4].map(index => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`} />)}</div>
      <span className="text-sm font-semibold text-muted">Étape {step} sur 4</span>
    </div>
    <div className="mt-6 flex items-center gap-4">
      <span className="shrink-0"><Mascotte humeur={error ? "désolée" : busy ? "pensive" : "au repos"} taille={70} /></span>
      <div><h2 className="text-2xl font-bold leading-tight text-foreground">{['Dans quelle classe es-tu ?', 'Quelles matières révises-tu ?', 'Quand passes-tu ton examen ?', 'Tu étudies quoi en ce moment ?'][step - 1]}</h2>
      {step === 1 && <p className="mt-2 text-sm text-muted">La connaissance, un peu chaque jour. Programme de Côte d’Ivoire. Aucun compte à créer.</p>}</div>
    </div>
    <div key={step} className="motion-enter mt-5 flex-1 space-y-4">
    {step === 1 && <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Pays<select className={input} value="ci" onChange={() => {}}><option value="ci">Côte d’Ivoire</option></select></label>
        <label className="block text-sm">Langue<select className={input} value="fr" onChange={() => {}}><option value="fr">Français</option></select></label>
      </div>
      {[[curriculum.slice(0, 4), 'Collège'], [curriculum.slice(4), 'Lycée']].map(([items, label]) => <fieldset key={label as string}><legend className="mb-2 font-semibold">{label as string}</legend><div className={`grid gap-2 ${label === 'Collège' ? 'grid-cols-4' : 'grid-cols-3'}`}>{(items as typeof curriculum).map(item => <button key={item.schoolClass} type="button" aria-pressed={schoolClass === item.schoolClass} className={`min-h-13 rounded-2xl border px-1 font-semibold ${schoolClass === item.schoolClass ? 'border-primary bg-tint text-primary' : 'border-border bg-surface'}`} onClick={() => {
        if (schoolClass === item.schoolClass) return
        setSchoolClass(item.schoolClass)
        setSeries('')
        setSeriesConfirmed(false)
        setSubjects((item.series as Record<string, string[] | undefined>)[''] ?? [])
      }}>{item.schoolClass === 'terminale' ? 'Terminale' : item.label}</button>)}</div></fieldset>)}
      {needsSeries && <fieldset className="rounded-2xl border border-border bg-surface p-4"><legend className="px-2 font-semibold">Ta série</legend><div className="flex flex-wrap gap-2">{Object.keys(entry.series).map(name => <button key={name} type="button" aria-pressed={seriesConfirmed && series === name} className={`min-h-12 min-w-11 flex-1 rounded-xl border px-3 font-semibold ${seriesConfirmed && series === name ? 'border-primary bg-tint text-primary' : 'border-border bg-background'}`} onClick={() => { if (series !== name) { setSeries(name); setSubjects((entry.series as Record<string, string[] | undefined>)[name] ?? []) } setSeriesConfirmed(true) }}>{name}</button>)}</div><p className="mt-3 text-sm text-muted">Tu peux changer ta série dans Moi.</p></fieldset>}
    </>}
    {step === 2 && <>
      <p>Décoche celles que tu ne suis pas, y compris la langue que tu n’étudies pas.</p>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Tes matières</legend>{available.map(name => <label key={name} className="flex items-center gap-3 rounded-xl border border-border p-3">
        <input type="checkbox" checked={subjects.includes(name)} onChange={event => setSubjects(event.target.checked ? [...subjects, name] : subjects.filter(item => item !== name))} />{name}
      </label>)}</fieldset>
      {subjects.length === 0 && <p role="status">Choisis au moins une matière.</p>}
    </>}
    {step === 3 && <>
      <p>Cette date aide à répartir tes révisions. Tu peux la renseigner plus tard.</p>
      <label className="block space-y-2"><span>Date d’examen (facultative)</span><input className={input} type="date" value={examDate} onChange={event => setExamDate(event.target.value)} /></label>
      <button type="button" className="block underline" onClick={() => { setExamDate(''); setStep(4) }}>Je ne connais pas encore la date</button>
    </>}
    {step === 4 && <>
      <label className="block space-y-2"><span>Matière</span><select className={input} value={selectedSubject} onChange={event => setSubject(event.target.value)}>{subjects.map(name => <option key={name}>{name}</option>)}</select></label>
      <label className="block space-y-2"><span>Chapitre étudié</span><input className={input} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. : Les fractions" /></label>
      <p className="text-sm text-muted">{revisionPolicy.generatedBasicCards + revisionPolicy.generatedMCQCards} cartes générées par IA pour démarrer, puis quelques cartes par jour. Elles peuvent contenir des erreurs : tu peux les supprimer pendant ta session.</p>
    </>}
    </div>
    {error && <p role="alert" className="text-foreground">{error}</p>}
    {busy && <p role="status">Préparation de tes {revisionPolicy.generatedBasicCards + revisionPolicy.generatedMCQCards} cartes… Cela peut prendre un instant.</p>}
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center gap-3 bg-background px-4 py-4">
      {step > 1 && <button type="button" disabled={busy} className="rounded-xl border border-border px-4 py-3" onClick={() => depth ? navigate(-1) : setSearch({ etape: String(step - 1) }, { replace: true })}>Retour</button>}
      <Button className="min-h-14 flex-1" type="submit" disabled={busy || (needsSeries && (!series || !seriesConfirmed)) || (step === 2 && !subjects.length) || (step === 4 && !title.trim())}>{step === 4 ? 'Créer mes cartes et commencer' : 'Continuer'}</Button>
    </div>
  </form>
}
