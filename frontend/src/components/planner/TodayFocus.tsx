import { useState, useEffect } from "react"
import { plannerList, type PlannerTask, type PlannerSlot } from "../../lib/api"

function fmtTime(ts: number) {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })
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
            <div className="text-foreground font-medium mb-4 flex items-center gap-2">
                <span>🎯</span>
                Priorités du jour
            </div>

            <div className="space-y-4">
                {/* Active Sessions */}
                {activeTasks.length > 0 && (
                    <div>
                        <div className="text-foreground text-sm mb-2">En cours :</div>
                        <div className="space-y-2">
                            {activeTasks.map(task => (
                                <div key={task.id} className="bg-tint border border-primary rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-primary font-medium">{task.title}</div>
                                            <div className="text-primary text-xs">
                                                {task.course} • {task.estMins} mins • Échéance : {fmtTime(task.dueAt)}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onCompleteTask(task.id)}
                                            className="px-3 py-1 rounded bg-secondary text-on-secondary text-xs hover:bg-secondary"
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
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-foreground font-medium">{task.title}</div>
                                            <div className="text-muted text-xs">
                                                {task.course} • {task.estMins} mins • P{task.priority}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onStartSession(task.id)}
                                            className="px-3 py-1 rounded bg-primary text-on-primary text-xs hover:bg-primary"
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
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-foreground font-medium">{task.title}</div>
                                                <div className="text-foreground text-xs">
                                                    {task.course} • Dans {Math.round(hoursLeft)}h • {task.estMins} min
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onStartSession(task.id)}
                                                className="px-3 py-1 rounded bg-primary text-on-primary text-xs hover:bg-primary"
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
                    <div className="text-center py-8 text-muted">
                        <div className="text-2xl mb-2">🎉</div>
                        <div className="text-sm">Rien d’urgent aujourd’hui !</div>
                        <div className="text-xs text-muted">Continue à avancer à ton rythme.</div>
                    </div>
                )}
            </div>
        </div>
    )
}