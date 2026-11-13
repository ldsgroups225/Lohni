import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { revisionAPI, type RevisionPlan } from '../../lib/api'
import { Card } from '../ui/Card'

export const frenchDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

export function PlanToday() {
  const [result, setResult] = useState<{ plan: RevisionPlan; offline: boolean } | null>(null)
  const plan = result?.plan ?? null
  useEffect(() => { let active = true; void revisionAPI.plan().then(value => { if (active) setResult(value) }).catch(() => {}); return () => { active = false } }, [])
  if (!plan) return null
  const missing = (plan.days[0]?.actions ?? []).map(action => action.subject)
  return <Card className="space-y-3 p-5"><h2 className="text-xl font-semibold">Aujourd’hui</h2>
    {result?.offline && <p className="text-sm text-muted">Plan du {frenchDate(plan.today)}</p>}
    {!plan.exams.length ? <Link className="underline" to="/me">Ajoute une date d’examen</Link> : <>
      {plan.exams.filter(exam => exam.overloaded).map(exam => <p key={exam.id}>Plan trop chargé pour {exam.title}</p>)}
      {plan.days[0]?.rest && <p>Repos</p>}
      {!plan.days[0]?.rest && plan.days[0]?.heavy && <p>Grosse journée de cours</p>}
      {!plan.days[0]?.rest && plan.days[0]?.overloaded && <p>Trop de cartes prévues ce jour</p>}
      {plan.days[0]?.items.map(item => <p key={item.chapterId}><strong>{item.subject}</strong> · {item.chapterTitle} : {item.dueCards > 0 && <>{item.dueCards} carte{item.dueCards > 1 ? 's' : ''} à revoir, </>}{item.newCards} nouvelle{item.newCards > 1 ? 's' : ''} · {item.minutes.toLocaleString('fr-FR')} min</p>)}
      {missing.length > 0 && <p>Sans chapitre : {missing.join(', ')}. <Link className="underline" to="/import">Ajouter un chapitre</Link></p>}
      <Link className="block underline" to="/plan">Voir le plan</Link>
    </>}
  </Card>
}
