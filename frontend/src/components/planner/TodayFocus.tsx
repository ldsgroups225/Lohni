import { TargetIcon, PartyIcon } from '../ui/NavigationIcons'
import type { PlannerTask } from "../../lib/api"

function fmtTime(ts: number) {
    const d = new Date(ts)
    return d.toLocaleString('fr-FR', { hour: "2-digit", minute: "2-digit" })
}

interface TodayFocusProps {
    tasks: PlannerTask[]
    onStartSession: (taskId: string) => void
    onCompleteTask: (taskId: string) => void
}

export default function TodayFocus({ tasks, onStartSession, onCompleteTask }: TodayFocusProps) {
    const today = new Date().toISOString().slice(0, 10)

    // Get today's tasks and upcoming urgent tasks
    const todayTasks = tasks.filter(t => {
        const taskDate = new Date(t.dueAt).toISOString().slice(0, 10)
        return taskDate === today && t.status !== 'done'
    })

    const urgentTasks = tasks.filter(t => {
        const hoursUntilDue = (t.dueAt - Date.now()) / (1000 * 60 * 60)
        return hoursUntilDue < 24 && hoursUntilDue > 0 && t.status !== 'done'
    }).slice(0, 3)

    const activeTasks = tasks.filter(t => t.status === 'doing')

    return (
        <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-foreground font-medium mb-3 flex items-center gap-2">
                <TargetIcon />
                Priorités du jour
            </h2>

            <div className="space-y-4">
                {/* Active Sessions */}
                {activeTasks.length > 0 && (
                    <div>
                        <div className="text-foreground text-sm mb-2">En cours :</div>
                        <div className="space-y-2">
                            {activeTasks.map(task => (
                                <div key={task.id} className="bg-tint border border-primary rounded-lg p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-primary font-medium">{task.title}</div>
                                            <div className="text-primary text-xs">
                                                {task.course} • {task.estMins} min • Échéance : {fmtTime(task.dueAt)}
                                            </div>
                                        </div>
                                        <button type="button"
                                            onClick={() => onCompleteTask(task.id)}
                                            className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm text-foreground"
                                        >
                                            Terminer
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Due Today */}
                {todayTasks.length > 0 && (
                    <div>
                        <div className="text-foreground text-sm mb-2">Pour aujourd’hui ({todayTasks.length}):</div>
                        <div className="space-y-2">
                            {todayTasks.slice(0, 3).map(task => (
                                <div key={task.id} className="bg-surface border border-border rounded-lg p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-foreground font-medium">{task.title}</div>
                                            <div className="text-muted text-xs">
                                                {task.course} • {task.estMins} min • Priorité {task.priority}
                                            </div>
                                        </div>
                                        <button type="button"
                                            onClick={() => onStartSession(task.id)}
                                            className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm text-foreground"
                                        >
                                            Commencer
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {todayTasks.length > 3 && (
                                <div className="text-muted text-xs text-center">
                                    +{todayTasks.length - 3} autres tâches pour aujourd’hui
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Urgent (Next 24h) */}
                {urgentTasks.length > 0 && (
                    <div>
                        <div className="text-foreground text-sm mb-2">Urgent (dans les 24 h) :</div>
                        <div className="space-y-2">
                            {urgentTasks.map(task => {
                                const hoursLeft = Math.max(0, (task.dueAt - Date.now()) / (1000 * 60 * 60))
                                return (
                                    <div key={task.id} className="bg-tint border border-border rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-foreground font-medium">{task.title}</div>
                                                <div className="text-foreground text-xs">
                                                    {task.course} • Dans {Math.round(hoursLeft)} h • {task.estMins} min
                                                </div>
                                            </div>
                                            <button type="button"
                                                onClick={() => onStartSession(task.id)}
                                                className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm text-foreground"
                                            >
                                                Commencer
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {todayTasks.length === 0 && urgentTasks.length === 0 && activeTasks.length === 0 && (
                    <div className="flex items-center gap-3 rounded-xl bg-tint p-3 text-muted">
                        <PartyIcon className="size-6 shrink-0" />
                        <p className="text-sm"><span className="font-medium text-foreground">Rien d’urgent aujourd’hui.</span> Continue à ton rythme ou ajoute une tâche.</p>
                    </div>
                )}
            </div>
        </div>
    )
}