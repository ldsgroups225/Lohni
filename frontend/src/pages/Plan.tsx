import { REVISION_POLICY as policy } from '../../../backend/src/services/revision/policy'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { frenchDate } from '../components/Revision/PlanToday'
import { ToolPage } from '../components/ui/ToolPage'
import { revisionAPI, type RevisionPlan } from '../lib/api'

export default function Plan() {
  const [result, setResult] = useState<{ plan: RevisionPlan; offline: boolean } | null>(null)
  const plan = result?.plan ?? null
  const [dailyMinutes, setDailyMinutes] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void revisionAPI.plan().then(value => { if (active) setResult(value) }).catch(() => { if (active) setError('Impossible de charger ton plan.') }); return () => { active = false } }, [])
  useEffect(() => { let active = true; void revisionAPI.settings().then(value => { if (active) setDailyMinutes(value.dailyMinutes) }).catch(() => {}); return () => { active = false } }, [])
  return <ToolPage title="Mon plan" back="/" beta={false}>
    {error && <p role="alert">{error}</p>}
    {!error && !plan && <p>Chargement du plan…</p>}
    {plan && <>
      {result?.offline && <p>Plan du {frenchDate(plan.today)}</p>}
      <h2 className="text-xl font-semibold">Examens à venir</h2>
      {!plan.exams.length && <Link to="/me" className="underline">Ajoute une date d’examen</Link>}
      {plan.exams.map(exam => <article key={exam.id} className="rounded-xl border border-border p-4"><h3 className="font-semibold">{exam.title}</h3><p>{frenchDate(exam.date)}</p>{exam.overloaded && <p>Plan trop chargé pour {exam.title}</p>}</article>)}
      {plan.days.map(day => <section key={day.date} className="rounded-xl border border-border p-4"><h2 className="font-semibold">{frenchDate(day.date)}</h2>
        {day.rest && <p>Repos</p>}
        {!day.rest && dailyMinutes !== null && day.capacityCards < Math.floor(dailyMinutes * policy.sessionCards / policy.sessionMinutes) && <p>Journée chargée</p>}
        {day.items.map(item => <p key={item.chapterId}><strong>{item.subject}</strong> · {item.chapterTitle} : {item.dueCards} carte{item.dueCards > 1 ? 's' : ''} à revoir, {item.newCards} nouvelle{item.newCards > 1 ? 's' : ''} · {item.minutes.toLocaleString('fr-FR')} min</p>)}
        {day.actions.map(action => <Link key={action.subject} className="block underline" to="/import">Ajoute un chapitre de {action.subject}</Link>)}
      </section>)}
    </>}
  </ToolPage>
}
