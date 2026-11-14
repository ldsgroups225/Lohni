import type { PlannerService } from "../../services/planner/service"
import type { CreateTaskRequest, UpdateTaskRequest, PlannerGenerateRequest } from "../../services/planner/types"
import { DEVICE_ID_ERROR, validUUID } from "../../services/revision/service"
import { emitToAll } from "../../utils/chat/ws"
import { parseMultipart } from "../../lib/parser/upload"
import crypto from "node:crypto"

const FAILED = "Le planning est indisponible. Réessaie dans un instant."
const MATERIALS_FAILED = "La fiche n’a pas pu être générée. Réessaie dans un instant."
const MATERIAL_TYPES = ["summary", "studyGuide", "flashcards", "quiz"]
const NOT_FOUND = "Tâche introuvable."

// One room per device: events never leave the device that owns the data.
const rooms = new Map<string, Set<any>>()

export function plannerRoutes(app: any, service: PlannerService) {
    const emit = (device: string, payload: any) => {
        try { emitToAll(rooms.get(device), payload) } catch (e) { console.error("[planner] emit failed", e) }
    }

    app.ws("/ws/planner", (ws: any, req: any) => {
        const device = new URL(req.url, "http://localhost").searchParams.get("device") || ""
        if (!validUUID(device)) {
            ws.send(JSON.stringify({ type: "error", error: DEVICE_ID_ERROR }))
            return ws.close()
        }
        const set = rooms.get(device) ?? new Set()
        rooms.set(device, set)
        set.add(ws)
        ws.send(JSON.stringify({ type: "ready" }))
        ws.on("close", () => { set.delete(ws); if (set.size === 0) rooms.delete(device) })
    })

    const route = (method: string, path: string, handle: (device: string, req: any, res: any) => Promise<unknown>) => {
        app[method](path, async (req: any, res: any) => {
            const device = req.headers["x-device-id"]
            if (!validUUID(device)) return res.status(400).send({ ok: false, error: DEVICE_ID_ERROR })
            try { await handle(device, req, res) }
            catch (e) {
                console.error("[planner]", e)
                res.status(500).send({ ok: false, error: FAILED })
            }
        })
    }
    const notFound = (res: any, error = NOT_FOUND) => res.status(404).send({ ok: false, error })

    route("post", "/tasks", async (device, req, res) => {
        const isMultipart = (req.headers["content-type"] || "").includes("multipart/form-data")
        let request: CreateTaskRequest = req.body
        if (isMultipart) {
            const { q: text, files } = await parseMultipart(req)
            request = { text, files }
        }
        const task = await service.createTaskFromRequest(device, request)
        res.send({ ok: true, task })
        emit(device, { type: "task.created", task })
    })

    route("post", "/tasks/ingest", async (device, req, res) => {
        const text = String(req.body?.text || "").trim()
        if (!text) return res.status(400).send({ ok: false, error: "Écris d’abord la tâche à ajouter." })
        const task = await service.createTaskFromRequest(device, { text })
        res.send({ ok: true, task })
        emit(device, { type: "task.created", task })
    })

    route("get", "/tasks/:id", async (device, req, res) => {
        const task = await service.getTask(device, req.params.id)
        if (!task) return notFound(res)
        res.send({ ok: true, task })
    })

    route("post", "/tasks/:id/replan", async (device, req, res) => {
        const task = await service.replanTask(device, req.params.id)
        if (!task) return notFound(res)
        res.send({ ok: true, task })
        emit(device, { type: "plan.update", taskId: task.id, slots: task.plan?.slots || [] })
    })

    route("post", "/tasks/:id/plan", async (device, req, res) => {
        const task = await service.planSingleTask(device, req.params.id)
        if (!task) return notFound(res)
        res.send({ ok: true, task })
        emit(device, { type: "plan.update", taskId: task.id, slots: task.plan?.slots || [] })
    })

    route("post", "/planner/weekly", async (device, req, res) => {
        const request: PlannerGenerateRequest = req.body
        const result = await service.generateWeeklyPlan(device, request)
        res.send({ ok: true, ...result })
        emit(device, { type: "weekly.update", plan: result.plan })
    })

    route("get", "/planner/today", async (device, _req, res) => {
        res.send({ ok: true, sessions: await service.getTodaySessions(device) })
    })

    route("get", "/planner/deadlines", async (device, _req, res) => {
        res.send({ ok: true, ...(await service.getUpcomingDeadlines(device)) })
    })

    route("get", "/planner/stats", async (device, _req, res) => {
        res.send({ ok: true, stats: await service.getUserStats(device) })
    })

    route("post", "/tasks/:id/materials", async (device, req, res) => {
        const id = req.params.id
        const type = req.body?.type
        if (!MATERIAL_TYPES.includes(type)) return res.status(400).send({ ok: false, error: "Type de fiche inconnu." })
        if (!(await service.getTask(device, id))) return notFound(res)
        try {
            const materials = await service.generateMaterials(device, id, { type })
            res.send({ ok: true, materials })
        } catch (e) {
            console.error("[planner] materials failed", e)
            res.status(500).send({ ok: false, error: MATERIALS_FAILED })
        }
    })

    route("patch", "/slots/:taskId/:slotId", async (device, req, res) => {
        const { taskId, slotId } = req.params
        const { done, skip } = req.body
        const task = await service.updateSlot(device, taskId, slotId, { done, skip })
        if (!task) return notFound(res, "Tâche ou créneau introuvable.")
        res.send({ ok: true, task })
        emit(device, { type: "slot.update", taskId, slotId, done, skip })
    })

    route("get", "/tasks", async (device, req, res) => {
        const { status, dueBefore, course } = req.query
        const filter: any = {}
        if (status) filter.status = status as string
        if (dueBefore) filter.dueBefore = dueBefore as string
        if (course) filter.course = course as string
        res.send({ ok: true, tasks: await service.listTasks(device, filter) })
    })

    route("patch", "/tasks/:id", async (device, req, res) => {
        const updates: UpdateTaskRequest = req.body
        const task = await service.updateTask(device, req.params.id, updates)
        if (!task) return notFound(res)
        res.send({ ok: true, task })
        emit(device, { type: "task.updated", task })
    })

    route("delete", "/tasks/:id", async (device, req, res) => {
        if (!(await service.deleteTask(device, req.params.id))) return notFound(res)
        res.send({ ok: true })
        emit(device, { type: "task.deleted", taskId: req.params.id })
    })

    route("post", "/tasks/:id/files", async (device, req, res) => {
        if (!(req.headers["content-type"] || "").includes("multipart/form-data")) {
            return res.status(400).send({ ok: false, error: "Envoie les fichiers en multipart/form-data." })
        }
        const taskId = req.params.id
        if (!(await service.getTask(device, taskId))) return notFound(res)
        const { files } = await parseMultipart(req)
        if (!files || files.length === 0) return res.status(400).send({ ok: false, error: "Aucun fichier reçu." })
        const uploadedFiles = await service.addFilesToTask(device, taskId, files)
        res.send({ ok: true, files: uploadedFiles })
        emit(device, { type: "task.files.added", taskId, files: uploadedFiles })
    })

    route("delete", "/tasks/:id/files/:fileId", async (device, req, res) => {
        if (!(await service.removeFileFromTask(device, req.params.id, req.params.fileId))) return notFound(res, "Fichier introuvable.")
        res.send({ ok: true })
        emit(device, { type: "task.file.removed", taskId: req.params.id, fileId: req.params.fileId })
    })

    route("post", "/sessions/start", async (device, req, res) => {
        const { taskId, slotId } = req.body
        if (!taskId) return res.status(400).send({ ok: false, error: "Choisis une tâche." })
        if (!(await service.getTask(device, taskId))) return notFound(res)
        const session = { id: crypto.randomUUID(), taskId, slotId, startedAt: new Date().toISOString(), status: "active" }
        res.send({ ok: true, session })
        emit(device, { type: "session.started", session })
    })

    route("post", "/sessions/:id/stop", async (device, req, res) => {
        const { minutesWorked, completed } = req.body
        const session = { id: req.params.id, endedAt: new Date().toISOString(), minutesWorked: minutesWorked || 0, completed: completed || false, status: "completed" }
        res.send({ ok: true, session })
        emit(device, { type: "session.ended", session })
    })

    route("post", "/reminders/schedule", async (device, req, res) => {
        const { text, scheduledFor, taskId } = req.body
        if (!text || !scheduledFor) return res.status(400).send({ ok: false, error: "Indique le texte et l’heure du rappel." })
        if (taskId && !(await service.getTask(device, taskId))) return notFound(res)
        const reminder = { id: crypto.randomUUID(), text, taskId, scheduledFor, createdAt: new Date().toISOString() }
        res.send({ ok: true, reminder })
        const delayMs = new Date(scheduledFor).getTime() - Date.now()
        if (delayMs > 0) {
            setTimeout(() => emit(device, { type: "reminder", id: reminder.id, text: reminder.text, taskId: reminder.taskId, scheduledFor: reminder.scheduledFor }), delayMs)
        }
    })

    route("post", "/reminders/test", async (device, _req, res) => {
        emit(device, { type: "reminder", text: "Rappel de test", at: Date.now() + 60000 })
        res.send({ ok: true })
    })

    startPeriodicNotices(service, emit)
}

let noticesStarted = false
const lastDigest = new Map<string, string>()
const lastBreakReminder = new Map<string, number>()

// Notices are computed per connected device, from that device's own tasks only.
function startPeriodicNotices(service: PlannerService, emit: (device: string, payload: any) => void) {
    if (noticesStarted) return
    noticesStarted = true
    setInterval(async () => {
        const now = new Date()
        const hh = now.getHours()
        const mm = now.getMinutes()
        const today = now.toISOString().slice(0, 10)
        for (const device of [...rooms.keys()]) {
            try {
                if (hh === 8 && mm < 5 && lastDigest.get(device) !== today) {
                    lastDigest.set(device, today)
                    const tomorrow = new Date(`${today}T23:59:59Z`).toISOString()
                    const tasks = await service.listTasks(device, { dueBefore: tomorrow })
                    const dueToday = tasks.filter(t => new Date(t.dueAt).toDateString() === new Date(today).toDateString())
                    const todaySessions = await service.getTodaySessions(device)
                    emit(device, {
                        type: "daily.digest",
                        date: today,
                        due: dueToday.map(t => ({ id: t.id, title: t.title, dueAt: t.dueAt })),
                        sessions: todaySessions.length,
                        message: `Bonjour ! Tu as ${dueToday.length} tâche(s) à rendre aujourd’hui et ${todaySessions.length} séance(s) prévue(s).`
                    })
                }

                if (hh >= 9 && hh <= 18 && mm < 5 && now.getTime() - (lastBreakReminder.get(device) ?? 0) > 2 * 60 * 60 * 1000) {
                    lastBreakReminder.set(device, now.getTime())
                    emit(device, { type: "break.reminder", text: "C’est l’heure d’une pause ! Repose tes yeux et étire-toi 5 à 10 minutes.", at: now.toISOString() })
                }

                if (hh === 20 && mm < 5) {
                    const stats = await service.getUserStats(device)
                    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                    const tomorrowTasks = await service.listTasks(device, { status: 'todo', dueBefore: new Date(`${tomorrow}T23:59:59Z`).toISOString() })
                    emit(device, {
                        type: "evening.review",
                        date: today,
                        stats,
                        tomorrowTasks: tomorrowTasks.slice(0, 3).map(t => ({ id: t.id, title: t.title })),
                        message: `Bilan du jour : ${stats.completedTasks} tâche(s) terminée(s). Demain, ${tomorrowTasks.length} tâche(s) t’attendent.`
                    })
                }
            } catch (e) { console.error("[planner] notice failed", e) }
        }
    }, 60000).unref()
}
