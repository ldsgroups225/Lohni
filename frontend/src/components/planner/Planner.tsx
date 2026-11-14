import { priorityLabel } from "../../lib/priorityLabel"
import MarkdownView from "../Chat/MarkdownView"
import { confirmDialog } from "../../lib/confirm"
import { withOccurrenceKeys } from "../../lib/occurrenceKeys"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import PlannerMindmap from "./PlannerMindmap"
import TodayFocus from "./TodayFocus"
import QuickAdd from "./QuickAdd"
import { connectPlannerStream, plannerDelete, plannerIngest, plannerList, plannerMaterials, plannerPlan, plannerUpdate, plannerWeekly, plannerCreateWithFiles, plannerUploadFiles, plannerDeleteFile, type PlannerEvent, type PlannerSlot, type PlannerTask, type WeeklyPlan } from "../../lib/api"

function fmtTime(ts: number) {
    const d = new Date(ts)
    return d.toLocaleString('fr-FR', { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function DaySlots({ date, slots, tasks }: { date: string; slots: PlannerSlot[]; tasks: Record<string, PlannerTask> }) {
    return (
        <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-muted mb-2">{new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="space-y-2">
                {slots.length === 0 && <div className="text-muted text-sm">Aucun créneau</div>}
                {slots.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm text-foreground">
                        <div className="truncate">
                            <span className="px-1.5 py-0.5 rounded bg-tint text-[10px] mr-2">{{ focus: 'Concentration', review: 'Révision', buffer: 'Pause' }[s.kind]}</span>
                            <span className="font-medium">{tasks[s.taskId]?.title || s.taskId}</span>
                        </div>
                        <div className="text-muted text-xs">{fmtTime(s.start)} → {new Date(s.end).toLocaleTimeString('fr-FR', { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function Planner() {
    const [loading, setLoading] = useState(false)
    const [taskTab, setTaskTab] = useState<"todo" | "done">("todo")
    const [undo, setUndo] = useState<{ id: string; status: PlannerTask["status"] } | null>(null)
    const [statusError, setStatusError] = useState("")
    const [addError, setAddError] = useState("")
    const [tasks, setTasks] = useState<PlannerTask[]>([])
    const [plan, setPlan] = useState<WeeklyPlan | null>(null)
    const [materials, setMaterials] = useState<Record<string, any>>({})
    const wsRef = useRef<ReturnType<typeof connectPlannerStream> | null>(null)
    const [view, setView] = useState<"today" | "list" | "mindmap">("today")
    const [notifications, setNotifications] = useState<Array<{ id: string; type: string; message: string; at: number }>>([])

    const addNotification = useCallback((type: string, message: string) => {
        const id = Math.random().toString(36).slice(2)
        setNotifications(n => [{ id, type, message, at: Date.now() }, ...n.slice(0, 4)])
        setTimeout(() => {
            setNotifications(n => n.filter(x => x.id !== id))
        }, 5000)
    }, [])

    const taskIndex = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks])
    const slotsByTask = useMemo(() => {
        const m: Record<string, PlannerSlot[]> = {}
        for (const d of plan?.days || []) for (const s of d.slots) {
            if (!m[s.taskId]) m[s.taskId] = []
            m[s.taskId].push(s)
        }
        for (const k of Object.keys(m)) m[k].sort((a, b) => a.start - b.start)
        return m
    }, [plan])

    useEffect(() => {
        wsRef.current = connectPlannerStream((ev: PlannerEvent) => {
            if (ev.type === "plan.update") {
                setTasks(t => t.map(x => x.id === ev.taskId ? { ...x, plan: { ...(x as any).plan, slots: ev.slots } } as any : x))
                plannerWeekly(false).then(wp => setPlan(wp.plan)).catch(() => { })
            }
            if (ev.type === "task.created") {
                setTasks(t => [ev.task, ...t.filter(x => x.id !== ev.task.id)])
                addNotification("success", `Tâche « ${ev.task.title} » créée`)
            }
            if (ev.type === "task.updated") {
                setTasks(t => t.map(x => x.id === ev.task.id ? ev.task : x))
            }
            if (ev.type === "task.deleted") {
                setTasks(t => t.filter(x => x.id !== ev.taskId))
                addNotification("info", "Tâche supprimée")
            }
            if (ev.type === "task.files.added") {
                setTasks(t => t.map(x => x.id === ev.taskId ? { ...x, files: [...(x.files || []), ...ev.files] } : x))
                addNotification("success", `${ev.files.length} fichier(s) ajouté(s)`)
            }
            if (ev.type === "task.file.removed") {
                setTasks(t => t.map(x => x.id === ev.taskId ? { ...x, files: (x.files || []).filter(f => f.id !== ev.fileId) } : x))
            }
            if (ev.type === "daily.digest") {
                addNotification("info", ev.message)
            }
            if (ev.type === "reminder") {
                addNotification("reminder", ev.text)
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification("Rappel de devoir", { body: ev.text })
                }
            }
            if (ev.type === "break.reminder") {
                addNotification("break", ev.text)
            }
            if (ev.type === "evening.review") {
                addNotification("info", ev.message)
            }
            if (ev.type === "session.started") {
                addNotification("success", "Session de travail démarrée")
            }
            if (ev.type === "session.ended") {
                addNotification("success", `Session terminée : ${ev.session.minutesWorked} minutes`)
            }
            if (ev.type === "materials.chunk") {
                setMaterials(m => ({ ...m, _chunks: [...(m._chunks || []), ev] }))
            }
            if (ev.type === "materials.done") { }
        })
        return () => { try { wsRef.current?.close() } catch { } }
    }, [addNotification])

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    const reload = useCallback(async () => {
        const res = await plannerList()
        setTasks(res.tasks)
        const wp = await plannerWeekly(false)
        setPlan(wp.plan)
    }, [])

    useEffect(() => { void reload() }, [reload])

    const add = async (data: { text?: string; files?: File[] }): Promise<boolean> => {
        const taskText = data.text || ""
        const taskFiles = data.files || []

        if (!taskText.trim() && taskFiles.length === 0) return false
        setLoading(true)
        setAddError("")
        try {
            if (taskFiles.length > 0) {
                const { task } = await plannerCreateWithFiles({ text: taskText, files: taskFiles })
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            } else {
                const { task } = await plannerIngest(taskText)
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            }
            return true
        } catch (error) {
            const message = error instanceof Error ? error.message : ""
            // Server messages are French; raw network or HTTP errors are not shown as is.
            setAddError(message && !/^http \d|failed to fetch|abort|load failed/i.test(message) ? message
                : "La tâche n’a pas pu être ajoutée. Vérifie ta connexion et réessaie ; ton texte est conservé.")
            void reload().catch(() => { }) // the task may have been created even if the answer was lost
            return false
        } finally {
            setLoading(false)
        }
    }

    const planTask = async (id: string) => {
        try {
            const result = await plannerPlan(id, false)
            const { task } = result
            setTasks(t => t.map(x => x.id === id ? task as any : x))
            const wp = await plannerWeekly(false)
            setPlan(wp.plan)
            addNotification("success", "Tâche planifiée")
        } catch (error) {
            console.error('Plan task error:', error)
            addNotification("error", `Impossible de planifier la tâche : ${(error as any)?.message}`)
        }
    }

    const gen = async (id: string, kind: "summary" | "studyGuide" | "flashcards" | "quiz") => {
        const { data } = await plannerMaterials(id, kind)
        setMaterials(m => ({ ...m, [id]: { ...(m[id] || {}), [kind]: data } }))
    }

    const onUpload = async (id: string, file: File) => {
        try {
            await plannerUploadFiles(id, [file])
            // Files will be updated via WebSocket event
        } catch {
            addNotification("error", "Impossible d’ajouter le fichier")
        }
    }

    const deleteFile = async (taskId: string, fileId: string) => {
        try {
            await plannerDeleteFile(taskId, fileId)
            // File removal will be updated via WebSocket event
        } catch {
            addNotification("error", "Impossible de supprimer le fichier")
        }
    }

    const del = async (id: string) => {
        await plannerDelete(id)
        setTasks(t => t.filter(x => x.id !== id))
    }

    const mark = async (id: string, status: PlannerTask["status"]) => {
        const { task } = await plannerUpdate(id, { status })
        setTasks(t => t.map(x => x.id === id ? task : x))
    }

    const toggleTask = async (task: PlannerTask) => {
        try {
            await mark(task.id, task.status === "done" ? "todo" : "done")
            setStatusError("")
            setUndo(task.status === "done" ? null : { id: task.id, status: task.status })
        } catch { setStatusError("Impossible de modifier la tâche. Réessaie.") }
    }

    const startNow = async (id: string) => {
        // Mark as doing and ensure it has a plan
        await mark(id, "doing")
        if (!slotsByTask[id]?.length) await planTask(id)
    }

    const updateNotes = async (id: string, notes: string) => {
        const { task } = await plannerUpdate(id, { notes })
        setTasks(t => t.map(x => x.id === id ? task : x))
    }

    const views = [["today", "Aujourd’hui", "Aujourd’hui"], ["list", "Liste", "Liste"], ["mindmap", "Carte", "Carte mentale"]] as const
    const onTabKey = (e: React.KeyboardEvent) => {
        const i = views.findIndex(v => v[0] === view)
        const next = e.key === "ArrowRight" ? (i + 1) % views.length : e.key === "ArrowLeft" ? (i + views.length - 1) % views.length : -1
        if (next < 0) return
        e.preventDefault()
        setView(views[next][0])
        ;(e.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus()
    }

    return (
        <div className="space-y-4">
            <QuickAdd onAdd={add} loading={loading} error={addError} />
            <div role="tablist" aria-label="Tâches" className="grid grid-cols-2 gap-1 rounded-2xl bg-tint p-1" onKeyDown={e => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                const next = taskTab === 'todo' ? 'done' : 'todo'
                setTaskTab(next)
                ;(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next === 'todo' ? 0 : 1])?.focus()
            }}>
                {([['todo', 'À faire'], ['done', 'Faites']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={taskTab === id} tabIndex={taskTab === id ? 0 : -1} onClick={() => setTaskTab(id)} className={`min-h-11 rounded-xl text-sm font-bold ${taskTab === id ? 'bg-surface text-foreground' : 'text-muted'}`}>{label} · {tasks.filter(t => (t.status === 'done') === (id === 'done')).length}</button>)}
            </div>
            <div role="tabpanel" className="overflow-hidden rounded-card border border-border bg-surface">
                {tasks.filter(t => (t.status === 'done') === (taskTab === 'done')).map(task => <div key={task.id} className="flex items-center gap-1 border-b border-border px-1 last:border-b-0">
                    <button type="button" aria-label={`${task.status === 'done' ? 'Remettre à faire' : 'Marquer'} ${task.title}${task.status === 'done' ? '' : ' comme faite'}`} onClick={() => void toggleTask(task)} className="grid size-12 shrink-0 place-items-center"><span className={`grid size-7 place-items-center rounded-lg border-2 ${task.status === 'done' ? 'border-success bg-success text-on-primary' : 'border-primary'}`}>{task.status === 'done' && '✓'}</span></button>
                    <div className="min-w-0 py-3"><div className={`font-bold ${task.status === 'done' ? 'text-muted line-through' : 'text-foreground'}`}>{task.title}</div><div className="text-sm text-muted">{new Date(task.dueAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · {task.estMins} min</div></div>
                </div>)}
                {tasks.filter(t => (t.status === 'done') === (taskTab === 'done')).length === 0 && <p className="p-6 text-center text-sm text-muted">{taskTab === 'todo' ? 'Rien à préparer. Profites-en !' : 'Aucune tâche terminée pour l’instant.'}</p>}
            </div>
            {statusError && <p role="alert" className="text-sm text-danger">{statusError}</p>}
            {undo && <div role="status" className="fixed inset-x-4 bottom-24 z-30 flex items-center gap-2 rounded-2xl bg-foreground p-2 pl-4 text-sm font-semibold text-surface"><span className="flex-1">Tâche terminée, bravo</span><button type="button" className="min-h-11 px-3 underline" onClick={() => { void mark(undo.id, undo.status).then(() => { setUndo(null); setStatusError('') }).catch(() => setStatusError('Impossible d’annuler. Réessaie.')) }}>Annuler</button></div>}
            <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-muted">Options avancées</summary>
            <div className="space-y-4"><div className="flex items-center gap-2">
                <div role="tablist" aria-label="Vue du planning" onKeyDown={onTabKey} className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
                    {views.map(([id, label, full]) => (
                        <button type="button" key={id} role="tab" aria-selected={view === id} aria-label={full} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}
                            className={`min-h-11 rounded-lg px-2 text-sm font-medium ${view === id ? 'bg-tint text-foreground font-bold' : 'text-foreground'}`}>{label}</button>
                    ))}
                </div>
                <button type="button" onClick={reload} aria-label="Actualiser" title="Actualiser" className="press-icon grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M20.5 9.5A8.25 8.25 0 0 0 5.4 7.4M7.977 14.652H2.985v4.992M3.5 14.5a8.25 8.25 0 0 0 15.1 2.1" /></svg>
                </button>
            </div>

            <div role="tabpanel" className="space-y-4">
                {/* Notifications */}
                {notifications.length > 0 && (
                    <div className="space-y-2">
                        {notifications.map(n => (
                            <div key={n.id} className={`px-3 py-2 rounded-lg text-sm ${n.type === 'error' ? 'bg-tint border border-primary text-foreground' :
                                n.type === 'success' ? 'bg-tint border border-secondary text-foreground' :
                                    n.type === 'reminder' ? 'bg-tint border border-border text-foreground' :
                                        n.type === 'break' ? 'bg-tint border border-border text-foreground' :
                                            'bg-tint border border-primary text-foreground'
                                }`}>
                                {n.message}
                            </div>
                        ))}
                    </div>
                )}

                {view === 'today' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="order-2 lg:order-1 lg:col-span-2">
                            <TodayFocus
                                tasks={tasks}
                                onStartSession={startNow}
                                onCompleteTask={(id) => mark(id, "done")}
                            />
                        </div>

                    </div>
                ) : view === 'mindmap' ? (
                    <div className="rounded-xl border border-border overflow-hidden h-[75vh]">
                        <PlannerMindmap
                            tasks={tasks}
                            plan={plan}
                            onPlan={planTask}
                            onAssist={(id, kind) => gen(id, kind)}
                            onUpdateStatus={mark}
                            onUpload={onUpload}
                            onDelete={del}
                            onUpdateNotes={updateNotes}
                        />
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {tasks.length === 0 && <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">Aucune tâche pour le moment. Ajoute-en une depuis « Aujourd’hui ».</p>}
                        {tasks.map(t => (
                            <div key={t.id} className="rounded-xl border border-border bg-surface p-3">
                                <div className="min-w-0">
                                    <div className="text-foreground font-medium">{t.title}</div>
                                    <div className="text-muted text-xs">
                                        Échéance : {fmtTime(t.dueAt)} · {t.estMins} min · {priorityLabel(t.priority)}
                                        {t.files && t.files.length > 0 && ` · ${t.files.length} fichier(s)`}
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <select value={t.status} onChange={e => mark(t.id, e.target.value as any)} aria-label={`Statut de ${t.title}`} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-sm text-foreground">
                                        <option value="todo">À faire</option>
                                        <option value="doing">En cours</option>
                                        <option value="done">Terminé</option>
                                        <option value="blocked">Bloqué</option>
                                    </select>
                                    <button type="button" onClick={() => planTask(t.id)} className="min-h-11 rounded-lg bg-tint px-3 text-sm text-foreground">Planifier</button>
                                    <button type="button" onClick={() => gen(t.id, "summary")} className="min-h-11 rounded-lg bg-tint px-3 text-sm text-foreground">Résumé</button>
                                    <button type="button" onClick={() => gen(t.id, "flashcards")} className="min-h-11 rounded-lg bg-tint px-3 text-sm text-foreground">Cartes</button>
                                    <button type="button" onClick={() => { void confirmDialog(`Supprimer la tâche « ${t.title} » ?`).then(ok => { if (ok) void del(t.id) }) }} className="ml-auto min-h-11 rounded-lg border border-danger px-3 text-sm text-danger">Supprimer</button>
                                </div>

                                {/* Task Files */}
                                {t.files && t.files.length > 0 && (
                                    <div className="mt-3 border-t border-border pt-3">
                                        <div className="text-foreground text-xs mb-2">Fichiers joints :</div>
                                        <div className="flex flex-wrap gap-2">
                                            {t.files.map(file => (
                                                <div key={file.id} className="flex items-center gap-1 px-2 py-1 bg-tint rounded text-xs text-foreground">
                                                    <span className="truncate max-w-32" title={file.originalName}>{file.originalName}</span>
                                                    <span className="text-muted">({Math.round(file.size / 1024)}KB)</span>
                                                    <button type="button"
                                                        onClick={() => deleteFile(t.id, file.id)}
                                                        className="grid size-11 place-items-center text-muted hover:text-foreground" aria-label={`Supprimer ${file.originalName}`}
                                                        title="Supprimer le fichier"
                                                    >×</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {materials[t.id]?.summary && (
                                    <div className="mt-3 text-sm text-foreground"><MarkdownView md={materials[t.id].summary.answer || materials[t.id].summary} /></div>
                                )}
                                {Array.isArray(materials[t.id]?.flashcards?.flashcards) && (
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {withOccurrenceKeys(materials[t.id].flashcards.flashcards as Array<{ q: string; a: string }>, c => JSON.stringify([c.q, c.a])).map(({ value: c, key }) => (
                                            <div key={key} className="border border-border rounded-lg p-2">
                                                <div className="text-foreground text-sm font-medium">Q: <MarkdownView md={c.q} inline /></div>
                                                <div className="text-muted text-sm">A: <MarkdownView md={c.a} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {view === 'list' && (
                    <div>
                        <div className="text-foreground text-sm mb-2">Planning de la semaine</div>
                        {plan ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {plan.days.map(d => (
                                    <DaySlots key={d.date} date={d.date} slots={d.slots} tasks={taskIndex} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-muted text-sm">Aucun planning pour le moment</div>
                        )}
                    </div>
                )}
            </div></div></details>
        </div>
    )
}
