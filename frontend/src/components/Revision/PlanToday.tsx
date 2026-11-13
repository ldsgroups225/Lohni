import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { revisionAPI, type RevisionPlan } from '../../lib/api'

export const frenchDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

export function PlanToday() {
  const [result, setResult] = useState<{ plan: RevisionPlan; offline: boolean } | null>(null)
  const plan = result?.plan ?? null
  useEffect(() => { let active = true; void revisionAPI.plan().then(value => { if (active) setResult(value) }).catch(() => {}); return () => { active = false } }, [])
  if (!plan) return null
  const warnings = [
    ...plan.exams.filter(exam => exam.overloaded).map(exam => `Plan trop chargé pour ${exam.title}`),
    ...(plan.days[0]?.rest ? ['Repos aujourd’hui'] : []),
    ...(!plan.days[0]?.rest && plan.days[0]?.heavy ? ['Grosse journée de cours'] : []),
    ...(!plan.days[0]?.rest && plan.days[0]?.overloaded ? ['Trop de cartes prévues ce jour'] : []),
  ]
  return <div className="space-y-2 text-sm text-muted">
    {result?.offline && <p>Plan du {frenchDate(plan.today)}</p>}
    {(plan.days[0]?.actions?.length ?? 0) > 0 && <p>Sans chapitre : {plan.days[0]?.actions.map(action => action.subject).join(', ')}</p>}
    {warnings.map(warning => <p key={warning}>{warning}</p>)}
    {!plan.exams.length ? <Link className="underline" to="/me/examens">Ajoute une date d’examen</Link> : <Link className="underline" to="/plan">Voir le plan</Link>}
  </div>
}
