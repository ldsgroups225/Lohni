import { ExamButton } from '../components/Revision/ExamButton'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { frenchDate } from '../components/Revision/PlanToday'
import { ToolPage } from '../components/ui/ToolPage'
import { revisionAPI, type RevisionPlan } from '../lib/api'

export default function Plan() {
  const { hash } = useLocation()
  const [result, setResult] = useState<{ plan: RevisionPlan; offline: boolean } | null>(null)
  const plan = result?.plan ?? null
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void revisionAPI.plan().then(value => { if (active) setResult(value) }).catch(() => { if (active) setError('Impossible de charger ton plan.') }); return () => { active = false } }, [])
  useEffect(() => { if (plan && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.() }, [plan, hash])
  const missing = [...new Set(plan?.days.flatMap(day => day.actions.map(action => action.subject)))]
  return <ToolPage title="Mon plan" back="/" beta={false}>
    {error && <p role="alert">{error}</p>}
    {!error && !plan && <p>Chargement du plan…</p>}
    {plan && <>
      {result?.offline && <p>Plan du {frenchDate(plan.today)}</p>}
      <h2 className="text-xl font-semibold">Examens à venir</h2>
      {!plan.exams.length && <Link to="/me" className="underline">Ajoute une date d’examen</Link>}
      {plan.exams.map(exam => <article id={`exam-${exam.id}`} key={exam.id} className="rounded-xl border border-border p-4"><h3 className="font-semibold">{exam.title}</h3><p>{frenchDate(exam.date)}</p>{exam.overloaded && <p>Plan trop chargé pour {exam.title}</p>}<ExamButton id={exam.id} date={exam.date} /></article>)}
      {missing.length > 0 && <p>Sans chapitre : {missing.join(', ')}. <Link className="underline" to="/import">Ajouter un chapitre</Link></p>}
      {plan.days.map(day => <section key={day.date} className="rounded-xl border border-border p-4"><h2 className="font-semibold">{frenchDate(day.date)}</h2>
        {day.rest && <p>Repos</p>}
        {!day.rest && day.heavy && <p>Grosse journée de cours</p>}
        {!day.rest && day.overloaded && <p>Trop de cartes prévues ce jour</p>}
        {day.items.map(item => <p key={item.chapterId}><strong>{item.subject}</strong> · {item.chapterTitle} : {item.dueCards > 0 && <>{item.dueCards} carte{item.dueCards > 1 ? 's' : ''} à revoir, </>}{item.newCards} nouvelle{item.newCards > 1 ? 's' : ''} · {item.minutes.toLocaleString('fr-FR')} min</p>)}
      </section>)}
    </>}
  </ToolPage>
}
