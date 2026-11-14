import type { PlanPolicy, Slot, Task, WeeklyPlan } from "./types"
import { makeSlots } from "./ai"
import { addDays, localDay } from "../revision/day"

export function defaultPolicy(): PlanPolicy {
    return { pomodoroMins: 25, breakMins: 5, maxDailyMins: 240 }
}

export function planTask(task: Task, policy: PlanPolicy): Task {
    const slots = makeSlots([task], policy)
    const taskSlots = slots.filter(s => s.taskId === task.id)

    const plan = {
        slots: taskSlots,
        policy,
        lastPlannedAt: new Date().toISOString()
    }

    return { ...task, plan }
}

export function planTasks(tasks: Task[], policy: PlanPolicy): Task[] {
    const allSlots = makeSlots(tasks, policy)

    return tasks.map(task => {
        const taskSlots = allSlots.filter(s => s.taskId === task.id)
        const plan = {
            slots: taskSlots,
            policy,
            lastPlannedAt: new Date().toISOString()
        }
        return { ...task, plan }
    })
}

export function weeklyPlan(tasks: Task[], _policy: PlanPolicy): WeeklyPlan {
    // Server-local calendar days: no 24 h arithmetic, so a daylight-saving change cannot shift a slot.
    const first = localDay()
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(first, i), slots: [] as Slot[] }))

    for (const task of tasks) {
        for (const slot of task.plan?.slots || []) {
            days.find(day => day.date === localDay(new Date(slot.start)))?.slots.push(slot)
        }
    }

    for (const day of days) {
        day.slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    }

    return { days }
}
