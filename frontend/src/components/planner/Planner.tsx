import MarkdownView from "../Chat/MarkdownView"
import { useEffect, useMemo, useRef, useState } from "react"
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
    const [text, setText] = useState("")
    const [loading, setLoading] = useState(false)
    const [tasks, setTasks] = useState<PlannerTask[]>([])
    const [sid] = useState(() => Math.random().toString(36).slice(2, 10))
    const [plan, setPlan] = useState<WeeklyPlan | null>(null)
    const [materials, setMaterials] = useState<Record<string, any>>({})
    const [loadingStates, setLoadingStates] = useState<Record<string, { plan?: boolean; summary?: boolean; flashcards?: boolean }>>({})
    const wsRef = useRef<ReturnType<typeof connectPlannerStream> | null>(null)
    const [view, setView] = useState<"today" | "list" | "mindmap">("today")
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [notifications, setNotifications] = useState<Array<{ id: string; type: string; message: string; at: number }>>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const taskIndex = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks])
    const slotsByTask = useMemo(() => {
        const m: Record<string, PlannerSlot[]> = {}
        for (const d of plan?.days || []) for (const s of d.slots) (m[s.taskId] ||= []).push(s)
        for (const k of Object.keys(m)) m[k].sort((a, b) => a.start - b.start)
        return m
    }, [plan])

    const suggestions = useMemo(() => {
        const now = Date.now()
        type Sug = { task: PlannerTask; score: number; nextSlot?: PlannerSlot }
        const out: Sug[] = []
        for (const t of tasks) {
            if (t.status === "done") continue
            const hoursLeft = Math.max(0.1, (t.dueAt - now) / 3600000)
            const planned = slotsByTask[t.id]?.length || 0
            const nextSlot = (slotsByTask[t.id] || []).find(s => s.start >= now) || (slotsByTask[t.id] || [])[0]
            let score = (t.priority || 3) * (1 / hoursLeft) + (t.estMins || 60) * 0.002
            if (!planned) score += 0.5
            if (t.status === "blocked") score -= 2
            if (t.status === "doing") score += 0.2
            out.push({ task: t, score, nextSlot })
        }
        return out.sort((a, b) => b.score - a.score).slice(0, 3)
    }, [tasks, slotsByTask])

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
    }, [sid])

    const addNotification = (type: string, message: string) => {
        const id = Math.random().toString(36).slice(2)
        setNotifications(n => [{ id, type, message, at: Date.now() }, ...n.slice(0, 4)])
        setTimeout(() => {
            setNotifications(n => n.filter(x => x.id !== id))
        }, 5000)
    }

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    const reload = async () => {
        const res = await plannerList()
        setTasks(res.tasks)
        const wp = await plannerWeekly(false)
        setPlan(wp.plan)
    }

    useEffect(() => { reload() }, [])

    const add = async (data?: { text?: string; files?: File[] }) => {
        const taskText = data?.text || text
        const taskFiles = data?.files || selectedFiles

        if (!taskText.trim() && taskFiles.length === 0) return
        setLoading(true)
        try {
            if (taskFiles.length > 0) {
                const { task } = await plannerCreateWithFiles({ text: taskText, files: taskFiles })
                if (!data) {
                    setText("")
                    setSelectedFiles([])
                }
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            } else {
                const { task } = await plannerIngest(taskText)
                if (!data) {
                    setText("")
                }
                setTasks(t => [task, ...t.filter(x => x.id !== task.id)])
            }
        } finally {
            setLoading(false)
        }
    }

    const handleFileSelect = (files: FileList | null) => {
        if (!files) return
        const newFiles = Array.from(files).filter(f =>
            f.size <= 10 * 1024 * 1024 && // 10MB limit
            (f.type.includes('pdf') || f.type.includes('image') || f.type.includes('text') || f.type.includes('document'))
        )
        setSelectedFiles(prev => [...prev, ...newFiles])
    }

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    }

    const planTask = async (id: string) => {
        setLoadingStates(prev => ({ ...prev, [id]: { ...prev[id], plan: true } }))
        try {
            console.log('Planning task:', id)
            const result = await plannerPlan(id, false)
            console.log('Plan result:', result)
            const { task } = result
            setTasks(t => t.map(x => x.id === id ? task as any : x))
            const wp = await plannerWeekly(false)
            setPlan(wp.plan)
            addNotification("success", "Tâche planifiée")
        } catch (error) {
            console.error('Plan task error:', error)
            addNotification("error", "Impossible de planifier la tâche : " + (error as any)?.message)
        } finally {
            setLoadingStates(prev => ({ ...prev, [id]: { ...prev[id], plan: false } }))
        }
    }

    const gen = async (id: string, kind: "summary" | "studyGuide" | "flashcards" | "quiz") => {
        setLoadingStates(prev => ({ ...prev, [id]: { ...prev[id], [kind]: true } }))
        try {
            const { data } = await plannerMaterials(id, kind)
            setMaterials(m => ({ ...m, [id]: { ...(m[id] || {}), [kind]: data } }))
        } finally {
            setLoadingStates(prev => ({ ...prev, [id]: { ...prev[id], [kind]: false } }))
        }
    }

    const onUpload = async (id: string, file: File) => {
        try {
            await plannerUploadFiles(id, [file])
            // Files will be updated via WebSocket event
        } catch (e) {
            addNotification("error", "Impossible d’ajouter le fichier")
        }
    }

    const deleteFile = async (taskId: string, fileId: string) => {
        try {
            await plannerDeleteFile(taskId, fileId)
            // File removal will be updated via WebSocket event
        } catch (e) {
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

    const fmtRel = (ts: number) => {
        const d = ts - Date.now()
        const sign = d < 0 ? "ago" : "in"
        const v = Math.abs(d)
        const h = Math.round(v / 3600000)
        if (h < 1) {
            const m = Math.max(1, Math.round(v / 60000))
            return `${sign} ${m}m`
        }
        return `${sign} ${h}h`
    }

    return (
        <div className="rounded-2xl border border-border bg-surface">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-foreground font-medium">Planning des devoirs</div>
                <div className="flex items-center gap-2">
                    <div className="text-xs bg-zinc-900 border border-border rounded overflow-hidden">
                        <button onClick={() => setView("today")} className={`px-2 py-1 ${view === 'today' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`}>Aujourd’hui</button>
                        <button onClick={() => setView("list")} className={`px-2 py-1 ${view === 'list' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`}>Liste</button>
                        <button onClick={() => setView("mindmap")} className={`px-2 py-1 ${view === 'mindmap' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`}>Carte mentale</button>
                    </div>
                    <button onClick={reload} className="text-xs px-2 py-1 rounded bg-tint text-foreground">Actualiser</button>
                </div>
            </div>

            <div className="p-4 space-y-6">
                {/* Notifications */}
                {notifications.length > 0 && (
                    <div className="space-y-2">
                        {notifications.map(n => (
                            <div key={n.id} className={`px-3 py-2 rounded-lg text-sm ${n.type === 'error' ? 'bg-tint border border-red-800 text-foreground' :
                                n.type === 'success' ? 'bg-tint border border-green-800 text-foreground' :
                                    n.type === 'reminder' ? 'bg-tint border border-yellow-800 text-foreground' :
                                        n.type === 'break' ? 'bg-tint border border-purple-800 text-foreground' :
                                            'bg-tint border border-primary text-primary'
                                }`}>
                                {n.message}
                            </div>
                        ))}
                    </div>
                )}

                {view === 'today' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <TodayFocus
                                tasks={tasks}
                                onStartSession={startNow}
                                onCompleteTask={(id) => mark(id, "done")}
                            />
                        </div>
                        <div>
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
                            onStartNow={startNow}
                            onUpdateNotes={updateNotes}
                        />
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {tasks.map(t => (
                            <div key={t.id} className="rounded-xl border border-border bg-surface p-3">
                                <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="text-zinc-100 font-medium truncate">{t.title}</div>
                                        <div className="text-zinc-400 text-xs">
                                            Échéance : {fmtTime(t.dueAt)} · {t.estMins} mins · P{t.priority}
                                            {t.files && t.files.length > 0 && ` · ${t.files.length} fichier(s)`}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select value={t.status} onChange={e => mark(t.id, e.target.value as any)} className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1">
                                            <option value="todo">À faire</option>
                                            <option value="doing">En cours</option>
                                            <option value="done">Terminé</option>
                                            <option value="blocked">Bloqué</option>
                                        </select>
                                        <button onClick={() => planTask(t.id)} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-200">Planifier</button>
                                        <button onClick={() => gen(t.id, "summary")} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-200">Résumé</button>
                                        <button onClick={() => gen(t.id, "flashcards")} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-200">Cartes</button>
                                        <button onClick={() => del(t.id)} className="text-xs px-2 py-1 rounded bg-primary text-on-primary">Supprimer</button>
                                    </div>
                                </div>

                                {/* Task Files */}
                                {t.files && t.files.length > 0 && (
                                    <div className="mt-3 border-t border-border pt-3">
                                        <div className="text-zinc-300 text-xs mb-2">Fichiers joints :</div>
                                        <div className="flex flex-wrap gap-2">
                                            {t.files.map(file => (
                                                <div key={file.id} className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-200">
                                                    <span className="truncate max-w-32" title={file.originalName}>{file.originalName}</span>
                                                    <span className="text-zinc-400">({Math.round(file.size / 1024)}KB)</span>
                                                    <button
                                                        onClick={() => deleteFile(t.id, file.id)}
                                                        className="text-zinc-400 hover:text-foreground ml-1"
                                                        title="Supprimer le fichier"
                                                    >×</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {materials[t.id]?.summary && (
                                    <div className="mt-3 text-sm text-zinc-200"><MarkdownView md={materials[t.id].summary.answer || materials[t.id].summary} /></div>
                                )}
                                {Array.isArray(materials[t.id]?.flashcards?.flashcards) && (
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {materials[t.id].flashcards.flashcards.map((c: any, i: number) => (
                                            <div key={i} className="border border-border rounded-lg p-2">
                                                <div className="text-zinc-200 text-sm font-medium">Q: <MarkdownView md={c.q} inline /></div>
                                                <div className="text-zinc-400 text-sm">A: <MarkdownView md={c.a} /></div>
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
