import type { Task, Slot, PlanPolicy, CreateTaskRequest, UpdateTaskRequest, PlannerGenerateRequest, MaterialsRequest } from "./types"
import type { PlannerStore } from "./store"
import { parseTask, generateSteps, replan } from "./ai"
import { planTask, planTasks, weeklyPlan, defaultPolicy } from "./scheduler"
import { handleAsk } from "../../lib/ai/ask"
import llm from "../../utils/llm/llm"
import { generateStructured } from "../../lib/ai/structured"
import crypto from "node:crypto"

export class PlannerService {
    private policy: PlanPolicy

    constructor(private store: PlannerStore, policy?: PlanPolicy) {
        this.policy = policy || defaultPolicy()
    }

    async createTaskFromRequest(device: string, req: CreateTaskRequest): Promise<Task> {
        let taskData: Partial<Task>

        if (req.text) {
            taskData = await parseTask(req.text)

            if (req.course) taskData.course = req.course
            if (req.title) taskData.title = req.title
            if (req.type) taskData.type = req.type
            if (req.notes) taskData.notes = req.notes
            if (req.dueAt) taskData.dueAt = req.dueAt
            if (req.estMins) taskData.estMins = req.estMins
            if (req.priority) taskData.priority = req.priority
        } else {
            taskData = {
                title: req.title || "Untitled Task",
                course: req.course,
                type: req.type,
                notes: req.notes,
                dueAt: req.dueAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                estMins: req.estMins || 60,
                priority: req.priority || 3
            }
        }

        const tempTask = { ...taskData, id: 'temp' } as Task
        const steps = await generateSteps(tempTask)
        taskData.steps = steps

        const task = await this.store.createTask(device, {
            title: taskData.title || "Untitled Task",
            course: taskData.course,
            type: taskData.type,
            notes: taskData.notes,
            dueAt: taskData.dueAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            estMins: taskData.estMins || 60,
            priority: taskData.priority || 3,
            status: 'todo',
            steps: taskData.steps
        })

        if (req.files && req.files.length > 0) {
            await this.addFilesToTask(device, task.id, req.files)
            const updatedTask = await this.store.getTask(device, task.id)
            return updatedTask || task
        }

        return task
    }

    async getTask(device: string, id: string): Promise<Task | null> {
        return this.store.getTask(device, id)
    }

    async updateTask(device: string, id: string, req: UpdateTaskRequest): Promise<Task | null> {
        const existing = await this.store.getTask(device, id)
        if (!existing) return null

        let steps = existing.steps
        if (req.title || req.type || req.notes) {
            const updatedTask = { ...existing, ...req }
            steps = await generateSteps(updatedTask)
        }

        return this.store.updateTask(device, id, { ...req, steps })
    }

    async deleteTask(device: string, id: string): Promise<boolean> {
        return this.store.deleteTask(device, id)
    }

    async listTasks(device: string, filter?: { status?: string; dueBefore?: string; course?: string }): Promise<Task[]> {
        return this.store.listTasks(device, filter)
    }

    async planSingleTask(device: string, taskId: string): Promise<Task | null> {
        const task = await this.store.getTask(device, taskId)
        if (!task) return null

        const plannedTask = planTask(task, this.policy)
        await this.store.updateTask(device, taskId, { plan: plannedTask.plan })

        return plannedTask
    }

    async generateWeeklyPlan(device: string, req?: PlannerGenerateRequest): Promise<{ tasks: Task[]; plan: any }> {
        const policy = { ...this.policy, ...req?.policy }

        const tasks = await this.store.listTasks(device, { status: 'todo' })

        const plannedTasks = planTasks(tasks, policy)

        for (const task of plannedTasks) {
            await this.store.updateTask(device, task.id, { plan: task.plan })
        }

        const plan = weeklyPlan(plannedTasks, policy)

        return { tasks: plannedTasks, plan }
    }

    async getTodaySessions(device: string): Promise<{ task: Task; slots: Slot[] }[]> {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

        const tasks = await this.store.listTasks(device, { status: 'todo' })
        const todaySessions: { task: Task; slots: Slot[] }[] = []

        for (const task of tasks) {
            if (!task.plan?.slots) continue

            const todaySlots = task.plan.slots.filter(slot => {
                const slotDate = new Date(slot.start)
                return slotDate >= today && slotDate < tomorrow
            })

            if (todaySlots.length > 0) {
                todaySessions.push({ task, slots: todaySlots })
            }
        }

        return todaySessions.sort((a, b) => {
            const aStart = new Date(a.slots[0].start).getTime()
            const bStart = new Date(b.slots[0].start).getTime()
            return aStart - bStart
        })
    }

    async updateSlot(device: string, taskId: string, slotId: string, updates: { done?: boolean; skip?: boolean }): Promise<Task | null> {
        const task = await this.store.getTask(device, taskId)
        if (!task?.plan?.slots) return null

        const slotIndex = task.plan.slots.findIndex(s => s.id === slotId)
        if (slotIndex === -1) return null

        const updatedSlots = [...task.plan.slots]
        updatedSlots[slotIndex] = {
            ...updatedSlots[slotIndex],
            done: updates.done
        }

        if (updates.skip) {
            await this.replanTask(device, taskId)
            return this.store.getTask(device, taskId)
        }

        const updatedPlan = { ...task.plan, slots: updatedSlots }
        return this.store.updateTask(device, taskId, { plan: updatedPlan })
    }

    async replanTask(device: string, taskId: string): Promise<Task | null> {
        const task = await this.store.getTask(device, taskId)
        if (!task?.plan) return null

        const now = new Date()
        const missedSlots = task.plan.slots.filter(s => new Date(s.end) < now && !s.done)
        const remainingSlots = task.plan.slots.filter(s => new Date(s.start) >= now)

        const allTasks = await this.store.listTasks(device, { status: 'todo' })

        const newSlots = replan(missedSlots, remainingSlots, allTasks, task.plan.policy)
        const taskSlots = newSlots.filter(s => s.taskId === taskId)

        const updatedPlan = {
            ...task.plan,
            slots: taskSlots,
            lastPlannedAt: new Date().toISOString()
        }

        return this.store.updateTask(device, taskId, { plan: updatedPlan })
    }

    async generateMaterials(device: string, taskId: string, req: MaterialsRequest): Promise<any> {
        const task = await this.store.getTask(device, taskId)
        if (!task) throw new Error('Task not found')

        const content = `${task.title}\n${task.notes || ''}\nSteps: ${task.steps?.join(', ') || ''}`

        switch (req.type) {
            case 'summary':
                return this.generateSummary(content)
            case 'studyGuide':
                return this.generateStudyGuide(content, task)
            case 'flashcards':
                return this.generateFlashcards(content, task)
            case 'quiz':
                return this.generateQuiz(content, task)
            default:
                throw new Error('Invalid material type')
        }
    }

    private async generateSummary(content: string): Promise<string> {
        const prompt = `Rédige en français un résumé clair et concis de ce contenu, niveau collège/lycée. Mets en avant les notions clés et les points importants. Réponds en Markdown, avec les formules en LaTeX entre $...$.`
        const response = await handleAsk(`${prompt}\n\n${content}`)
        return response.answer
    }

    private async generateStudyGuide(content: string, task: Task): Promise<string> {
        const prompt = `Rédige en français un guide de révision complet pour ce travail (${task.type || 'devoir'}), niveau collège/lycée. Inclus :
        - les notions et définitions clés
        - les formules ou principes importants
        - des questions d’entraînement
        - des conseils de révision propres à ce sujet

        Réponds en Markdown avec des sections claires, et les formules en LaTeX entre $...$ :`

        const response = await handleAsk(`${prompt}\n\n${content}`)
        return response.answer
    }

    private async generateFlashcards(content: string, task: Task): Promise<Array<{ front: string; back: string }>> {
        const prompt = `Crée 10 à 15 cartes de révision en français pour ce travail (${task.type || 'devoir'}), niveau collège/lycée.
        Réponds uniquement avec un tableau JSON d’objets {"front": "...", "back": "..."} : « front » est la question, « back » la réponse courte.
        Porte-toi sur les notions clés, les définitions, les formules et les faits importants. Écris les formules en LaTeX entre $...$.

        Exemple :
        [
          {"front": "Quelle est la dérivée de $x^2$ ?", "back": "$2x$"},
          {"front": "Définis la photosynthèse", "back": "Le processus par lequel les plantes transforment l’énergie lumineuse en énergie chimique."}
        ]`

        const messages = [{ role: 'user' as const, content: `${prompt}\n\n${content}` }]
        const filled = (x: unknown) => typeof x === 'string' && x.trim() !== ''
        return generateStructured({
            model: llm, messages, shape: 'array',
            retryMessages: [{ role: 'system', content: 'Réponds uniquement avec un tableau JSON, sans Markdown ni texte autour.' }, ...messages],
            validate: parsed => Array.isArray(parsed) && parsed.length > 0 && parsed.every((c: any) => filled(c?.front) && filled(c?.back))
                ? parsed.map((c: any) => ({ front: c.front, back: c.back })) : null,
        })
    }

    private async generateQuiz(content: string, task: Task): Promise<any> {
        const prompt = `Crée en français un quiz de 5 questions pour ce travail (${task.type || 'devoir'}), niveau collège/lycée. Mélange des questions à choix multiples et des questions à réponse courte, pour tester la compréhension des notions clés. Réponds en Markdown, avec les formules en LaTeX entre $...$.`

        const response = await handleAsk(`${prompt}\n\n${content}`)
        return response.answer
    }

    async getUpcomingDeadlines(device: string): Promise<{ urgent: Task[]; atRisk: Task[]; upcoming: Task[] }> {
        const tasks = await this.store.listTasks(device, { status: 'todo' })
        const now = new Date()

        const urgent: Task[] = []
        const atRisk: Task[] = []
        const upcoming: Task[] = []

        for (const task of tasks) {
            const deadline = new Date(task.dueAt)
            const hoursToDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)

            const hasScheduledWork = task.plan?.slots?.some(s => new Date(s.start) >= now)

            if (hoursToDeadline < 24) {
                urgent.push(task)
            } else if (hoursToDeadline < 72 && !hasScheduledWork) {
                atRisk.push(task)
            } else if (hoursToDeadline < 168) {
                upcoming.push(task)
            }
        }

        return { urgent, atRisk, upcoming }
    }

    async getUserStats(device: string): Promise<any> {
        const allTasks = await this.store.listTasks(device)
        const completedTasks = allTasks.filter(t => t.status === 'done')

        const totalPlannedMinutes = allTasks.reduce((sum, task) => {
            return sum + (task.plan?.slots?.length || 0) * this.policy.pomodoroMins
        }, 0)

        const completedMinutes = completedTasks.reduce((sum, task) => {
            const completedSlots = task.plan?.slots?.filter(s => s.done) || []
            return sum + completedSlots.length * this.policy.pomodoroMins
        }, 0)

        const onTimeCompletions = completedTasks.filter(task => {
            return new Date(task.updatedAt) <= new Date(task.dueAt)
        }).length

        return {
            totalTasks: allTasks.length,
            completedTasks: completedTasks.length,
            totalPlannedMinutes,
            completedMinutes,
            onTimeRatio: completedTasks.length > 0 ? onTimeCompletions / completedTasks.length : 0,
            averageEstimateAccuracy: this.calculateEstimateAccuracy(completedTasks)
        }
    }

    async addFilesToTask(device: string, taskId: string, files: any[]): Promise<any[]> {
        const task = await this.store.getTask(device, taskId)
        if (!task) throw new Error("Task not found")

        const uploadedFiles: any[] = []

        for (const file of files) {
            const taskFile = {
                id: crypto.randomUUID(),
                taskId,
                filename: file.filename,
                originalName: file.filename,
                mimeType: file.mimeType,
                size: require('node:fs').statSync(file.path).size,
                uploadedAt: new Date().toISOString()
            }

            await this.store.saveTaskFile(device, taskFile)
            uploadedFiles.push(taskFile)
        }

        return uploadedFiles
    }

    async removeFileFromTask(device: string, taskId: string, fileId: string): Promise<boolean> {
        const task = await this.store.getTask(device, taskId)
        if (!task) return false

        try {
            if (!(await this.store.getTaskFiles(device, taskId)).some(f => f.id === fileId)) return false
            await this.store.deleteTaskFile(device, fileId)
            return true
        } catch {
            return false
        }
    }

    private calculateEstimateAccuracy(completedTasks: Task[]): number {
        if (completedTasks.length === 0) return 1.0

        let totalAccuracy = 0
        let validTasks = 0

        for (const task of completedTasks) {
            if (task.metrics?.minutesSpent && task.estMins > 0) {
                const accuracy = Math.min(task.estMins / task.metrics.minutesSpent, 2)
                totalAccuracy += accuracy
                validTasks++
            }
        }

        return validTasks > 0 ? totalAccuracy / validTasks : 1.0
    }
}
