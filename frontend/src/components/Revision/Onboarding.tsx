import Mascotte from '../Mascotte/Mascotte'
import { Button } from '../ui/Button'
import { Progress } from '../ui/Progress'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import curriculum from '../../data/curriculum-ci.json'
import { revisionAPI, revisionPolicy } from '../../lib/api'

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [schoolClass, setSchoolClass] = useState('3e')
  const [series, setSeries] = useState('')
  const entry = curriculum.find(item => item.schoolClass === schoolClass)!
  const available = (entry.series as Record<string, string[] | undefined>)[series] ?? []
  const [subjects, setSubjects] = useState<string[]>(available)
  const [examDate, setExamDate] = useState('')
  const [subject, setSubject] = useState('Mathématiques')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 4) {
      if (step === 1) setSubjects(available)
      if (step === 2 && !subjects.includes(subject)) setSubject(subjects[0])
      setStep(step + 1)
      return
    }
    setBusy(true)
    setError('')
    try {
      await revisionAPI.saveProfile({ schoolClass, series: series || undefined, subjects, examDate: examDate || undefined })
      await revisionAPI.generateChapter({ subject, title: title.trim() })
      navigate('/revision', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de préparer tes cartes. Réessaie.')
    } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-surface p-6" aria-busy={busy}>
    <Mascotte humeur={error ? "désolée" : busy ? "pensive" : "au repos"} taille={120} />
    {step === 1 && <p>La connaissance, un peu chaque jour.</p>}
    <p className="text-sm text-primary">Bienvenue sur Lohni · Étape {step} sur 4</p>
    <Progress className="w-full" value={step} max={4} aria-label="Progression du parcours d’arrivée" />
    <div key={step} className="motion-enter space-y-4">
    {step === 1 && <>
      <h2 className="text-2xl font-semibold text-foreground">Dans quelle classe es-tu ?</h2>
      <p>Programme de Côte d’Ivoire. Aucun compte à créer.</p>
      <label className="block space-y-2"><span>Ta classe</span><select className={input} value={schoolClass} onChange={event => {
        setSchoolClass(event.target.value)
        const next = curriculum.find(item => item.schoolClass === event.target.value)!
        setSeries(Object.keys(next.series)[0])
      }}>{curriculum.map(item => <option key={item.schoolClass} value={item.schoolClass}>{item.label}</option>)}</select></label>
      {Object.keys(entry.series)[0] !== '' && <label className="block space-y-2"><span>Ta série</span><select className={input} value={series} onChange={event => setSeries(event.target.value)}>
        {Object.keys(entry.series).map(name => <option key={name}>{name}</option>)}
      </select></label>}
    </>}
    {step === 2 && <>
      <h2 className="text-2xl font-semibold text-foreground">Quelles matières révises-tu ?</h2>
      <p>Décoche celles que tu ne suis pas, y compris la langue que tu n’étudies pas.</p>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Tes matières</legend>{available.map(name => <label key={name} className="flex items-center gap-3 rounded-xl border border-border p-3">
        <input type="checkbox" checked={subjects.includes(name)} onChange={event => setSubjects(event.target.checked ? [...subjects, name] : subjects.filter(item => item !== name))} />{name}
      </label>)}</fieldset>
      {subjects.length === 0 && <p role="status">Choisis au moins une matière.</p>}
    </>}
    {step === 3 && <>
      <h2 className="text-2xl font-semibold text-foreground">Quand passes-tu ton examen ?</h2>
      <p>Cette date aide à répartir tes révisions. Tu peux la renseigner plus tard.</p>
      <label className="block space-y-2"><span>Date d’examen (facultative)</span><input className={input} type="date" value={examDate} onChange={event => setExamDate(event.target.value)} /></label>
      <button type="button" className="block underline" onClick={() => { setExamDate(''); setStep(4) }}>Je ne connais pas encore la date</button>
    </>}
    {step === 4 && <>
      <h2 className="text-2xl font-semibold text-foreground">Tu étudies quoi en ce moment ?</h2>
      <label className="block space-y-2"><span>Matière</span><select className={input} value={subject} onChange={event => setSubject(event.target.value)}>{subjects.map(name => <option key={name}>{name}</option>)}</select></label>
      <label className="block space-y-2"><span>Chapitre étudié</span><input className={input} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. : Les fractions" /></label>
      <p className="text-sm text-muted">{revisionPolicy.generatedBasicCards + revisionPolicy.generatedMCQCards} cartes générées par IA pour démarrer, puis quelques cartes par jour. Elles peuvent contenir des erreurs : tu peux les supprimer pendant ta session.</p>
    </>}
    </div>
    {error && <p role="alert" className="text-foreground">{error}</p>}
    {busy && <p role="status">Préparation de tes {revisionPolicy.generatedBasicCards + revisionPolicy.generatedMCQCards} cartes… Cela peut prendre un instant.</p>}
    <div className="flex flex-wrap items-center gap-4">
      {step > 1 && <button type="button" disabled={busy} className="rounded-xl border border-border px-4 py-3" onClick={() => setStep(step - 1)}>Retour</button>}
      <Button type="submit" disabled={busy || (step === 2 && !subjects.length) || (step === 4 && !title.trim())}>{step === 4 ? 'Créer mes cartes et commencer' : 'Continuer'}</Button>
    </div>
  </form>
}
