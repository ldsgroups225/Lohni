import type { PlannerSlot, PlannerTask } from '../../lib/api'

const kindLabel: Record<PlannerSlot['kind'], string> = { focus: 'Concentration', review: 'Révision', buffer: 'Pause' }
const hour = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Un jour du planning : la date est en tête, chaque créneau ne montre donc que ses heures, avec son type. */
export default function DaySlots({ date, slots, tasks }: { date: string; slots: PlannerSlot[]; tasks: Record<string, PlannerTask> }) {
    return (
        <section className="p-3 ui-card">
            <h3 className="ui-label mb-2">{new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {slots.length === 0 ? <p className="text-muted text-sm">Aucun créneau</p> : <ul className="divide-y divide-border">
                {slots.map(s => (
                    <li key={s.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
                        <span data-slot-kind className="inline-block rounded bg-tint px-2 py-0.5 text-xs font-semibold text-primary">
                            {kindLabel[s.kind]} · <time dateTime={new Date(s.start).toISOString()}>{hour(s.start)}</time> – <time dateTime={new Date(s.end).toISOString()}>{hour(s.end)}</time>
                        </span>
                        <p className="line-clamp-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{tasks[s.taskId]?.title || s.taskId}</p>
                    </li>
                ))}
            </ul>}
        </section>
    )
}
