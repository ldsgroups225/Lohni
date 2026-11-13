import crypto from "node:crypto"
import type { Task, TaskFile } from "./types"

export type KV = { get(key: string): Promise<any>; set(key: string, value: any): Promise<any>; delete(key: string): Promise<any> }

// Every key carries the device id. Legacy global keys (`planner:tasks`, `planner:task:<id>`, ...) are never read.
export class PlannerStore {
    constructor(private db: KV) { }
    private k = (device: string, ...rest: string[]) => ["planner", device, ...rest].join(":")

    async createTask(device: string, t: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const task: Task = { ...t, id, createdAt: now, updatedAt: now }
        const list = (await this.db.get(this.k(device, "tasks"))) || []
        list.push({ id })
        await this.db.set(this.k(device, "tasks"), list)
        await this.db.set(this.k(device, "task", id), task)
        return task
    }

    async getTask(device: string, id: string): Promise<Task | null> {
        const task = (await this.db.get(this.k(device, "task", id))) || null
        if (task) task.files = await this.getTaskFiles(device, id)
        return task
    }

    async updateTask(device: string, id: string, patch: Partial<Task>): Promise<Task | null> {
        const cur = await this.getTask(device, id)
        if (!cur) return null
        const next: Task = { ...cur, ...patch, id: cur.id, updatedAt: new Date().toISOString() }
        await this.db.set(this.k(device, "task", id), next)
        return next
    }

    async deleteTask(device: string, id: string): Promise<boolean> {
        if (!(await this.db.get(this.k(device, "task", id)))) return false
        const list = ((await this.db.get(this.k(device, "tasks"))) || []).filter((x: any) => x.id !== id)
        await this.db.set(this.k(device, "tasks"), list)
        await this.db.delete(this.k(device, "task", id))
        await this.deleteTaskFiles(device, id)
        return true
    }

    async listTasks(device: string, filter?: { status?: string; dueBefore?: string; course?: string }): Promise<Task[]> {
        const list = (await this.db.get(this.k(device, "tasks"))) || []
        const tasks: Task[] = []
        for (const it of list) {
            const t = await this.getTask(device, it.id)
            if (!t) continue
            if (filter?.status && t.status !== filter.status) continue
            if (filter?.dueBefore && new Date(t.dueAt) > new Date(filter.dueBefore)) continue
            if (filter?.course && t.course !== filter.course) continue
            tasks.push(t)
        }
        return tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    }

    async saveTaskFile(device: string, file: TaskFile): Promise<void> {
        const list = (await this.db.get(this.k(device, "task_files"))) || []
        list.push({ id: file.id, taskId: file.taskId })
        await this.db.set(this.k(device, "task_files"), list)
        await this.db.set(this.k(device, "task_file", file.id), file)
    }

    async getTaskFiles(device: string, taskId: string): Promise<TaskFile[]> {
        const list = (await this.db.get(this.k(device, "task_files"))) || []
        const files: TaskFile[] = []
        for (const item of list) {
            if (item.taskId !== taskId) continue
            const file = await this.db.get(this.k(device, "task_file", item.id))
            if (file) files.push(file)
        }
        return files
    }

    async deleteTaskFile(device: string, id: string): Promise<void> {
        const list = ((await this.db.get(this.k(device, "task_files"))) || []).filter((x: any) => x.id !== id)
        await this.db.set(this.k(device, "task_files"), list)
        await this.db.delete(this.k(device, "task_file", id))
    }

    async deleteTaskFiles(device: string, taskId: string): Promise<void> {
        const list = (await this.db.get(this.k(device, "task_files"))) || []
        await this.db.set(this.k(device, "task_files"), list.filter((x: any) => x.taskId !== taskId))
        for (const file of list.filter((x: any) => x.taskId === taskId)) await this.db.delete(this.k(device, "task_file", file.id))
    }
}
