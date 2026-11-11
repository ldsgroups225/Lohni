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
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function DaySlots({ date, slots, tasks }: { date: string; slots: PlannerSlot[]; tasks: Record<string, PlannerTask> }) {
    return (
        <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-muted mb-2">{date}</div>
            <div className="space-y-2">
                {slots.length === 0 && <div className="text-muted text-sm">Aucun créneau</div>}
                {slots.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm text-foreground">
                        <div className="truncate">
                            <span className="px-1.5 py-0.5 rounded bg-tint text-[10px] mr-2">{s.kind}</span>
                            <span className="font-medium">{tasks[s.taskId]?.title || s.taskId}</span>
                        </div>
                        <div className="text-muted text-xs">{fmtTime(s.start)} → {new Date(s.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function Planner() {
    const [loading, setLoading] = useState(false)
    const [tasks, setTasks] = useState<PlannerTask[]>([])
    const [sid] = useState(() => Math.random().toString(36).slice(2, 10))
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
        wsRef.current = connectPlannerStream(sid, (ev: PlannerEvent) => {
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
    }, [sid, addNotification])

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

    const add = async (data: { text?: string; files?: File[] }) => {
        const taskText = data.text || ""
        const taskFiles = data.files || []

        if (!taskText.trim() && taskFiles.length === 0) return
        setLoading(true)
        try {
            if (taskFiles.length > 0) {
                const { task } = await plannerCreateWithFiles({ text: taskText, files: taskFiles })
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            } else {
                const { task } = await plannerIngest(taskText)
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            }
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
            addNotification("error", "Impossible de planifier la tâche : " + (error as any)?.message)
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
            <div className="flex items-center gap-2">
                <div role="tablist" aria-label="Vue du planning" onKeyDown={onTabKey} className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
                    {views.map(([id, label, full]) => (
                        <button type="button" key={id} role="tab" aria-selected={view === id} aria-label={full} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}
                            className={`min-h-10 rounded-lg px-2 text-sm font-medium ${view === id ? 'bg-primary text-on-primary' : 'text-foreground'}`}>{label}</button>
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
                        <div className="order-1 lg:order-2">
                            <QuickAdd onAdd={add} loading={loading} />
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
                                        Échéance : {fmtTime(t.dueAt)} · {t.estMins} mins · P{t.priority}
                                        {t.files && t.files.length > 0 && ` · ${t.files.length} fichier(s)`}
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <select value={t.status} onChange={e => mark(t.id, e.target.value as any)} aria-label={`Statut de ${t.title}`} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground">
                                        <option value="todo">À faire</option>
                                        <option value="doing">En cours</option>
                                        <option value="done">Terminé</option>
                                        <option value="blocked">Bloqué</option>
                                    </select>
                                    <button type="button" onClick={() => planTask(t.id)} className="min-h-10 rounded-lg bg-tint px-3 text-sm text-foreground">Planifier</button>
                                    <button type="button" onClick={() => gen(t.id, "summary")} className="min-h-10 rounded-lg bg-tint px-3 text-sm text-foreground">Résumé</button>
                                    <button type="button" onClick={() => gen(t.id, "flashcards")} className="min-h-10 rounded-lg bg-tint px-3 text-sm text-foreground">Cartes</button>
                                    <button type="button" onClick={() => { void confirmDialog(`Supprimer la tâche « ${t.title} » ?`).then(ok => { if (ok) void del(t.id) }) }} className="ml-auto min-h-10 rounded-lg border border-danger px-3 text-sm text-danger">Supprimer</button>
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
                                                        className="text-muted hover:text-foreground ml-1"
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
            </div>
        </div>
    )
}
