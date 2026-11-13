import { REVISION_POLICY as policy } from './policy'
export type RevisionExam = { id: string; title: string; date: string; subjects: string[]; chapterIds: string[] }

export type PlanInput = {
  today: string; exams: RevisionExam[]
  chapters: { id: string; title: string; subject: string; unseenCards: number; dueByDate: Record<string, number>; hasCards?: boolean }[]
  dailyMinutes: number; restDays: number[]
  capacity?: (date: string, baseCards: number) => number; subjectOrder?: (date: string) => string[]
}
export type PlanItem = { subject: string; chapterId: string; chapterTitle: string; examId: string | null; dueCards: number; newCards: number; minutes: number }
export type PlanDay = { date: string; rest: boolean; capacityCards: number; minutes: number; items: PlanItem[]; actions: { kind: 'addChapter'; subject: string }[] }
export type RevisionPlan = { today: string; exams: { id: string; title: string; date: string; overloaded: boolean }[]; days: PlanDay[] }

const nextDate = (date: string) => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
const minutes = (cards: number) => Math.ceil(cards * policy.sessionMinutes / policy.sessionCards)

export function buildPlan(input: PlanInput): RevisionPlan {
  const exams = input.exams.filter(exam => exam.date >= input.today).sort((a, b) => a.date.localeCompare(b.date))
  const result: RevisionPlan = { today: input.today, exams: exams.map(({ id, title, date }) => ({ id, title, date, overloaded: false })), days: [] }
  if (!exams.length) return result
  const last = exams[exams.length - 1].date
  for (let date = input.today; date < last; date = nextDate(date)) {
    const rest = input.restDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
    const base = Math.floor(input.dailyMinutes * policy.sessionCards / policy.sessionMinutes)
    result.days.push({ date, rest, capacityCards: rest ? 0 : Math.max(0, Math.floor(input.capacity?.(date, base) ?? base)), minutes: 0, items: [], actions: [] })
  }
  const covered = (chapter: PlanInput['chapters'][number], exam: RevisionExam) => exam.subjects.includes(chapter.subject) && (!exam.chapterIds.length || exam.chapterIds.includes(chapter.id))
  const nearest = (chapter: PlanInput['chapters'][number]) => exams.find(exam => covered(chapter, exam))
  const item = (day: PlanDay, chapter: PlanInput['chapters'][number]) => {
    let value = day.items.find(entry => entry.chapterId === chapter.id)
    if (!value) { value = { subject: chapter.subject, chapterId: chapter.id, chapterTitle: chapter.title, examId: nearest(chapter)?.id ?? null, dueCards: 0, newCards: 0, minutes: 0 }; day.items.push(value) }
    return value
  }
  const used = (day: PlanDay) => day.items.reduce((sum, entry) => sum + entry.dueCards + entry.newCards, 0)
  const newCount = (day: PlanDay) => day.items.reduce((sum, entry) => sum + entry.newCards, 0)
  const maxNew = Math.floor(policy.maxNewCards * input.dailyMinutes / policy.defaultDailyMinutes)
  const room = (day: PlanDay) => Math.max(0, Math.min(day.capacityCards - used(day), maxNew - newCount(day)))
  for (const chapter of input.chapters) for (const [date, count] of Object.entries(chapter.dueByDate)) {
    const day = result.days.find(day => !day.rest && day.date >= (date < input.today ? input.today : date))
    if (day) item(day, chapter).dueCards += count
  }
  const chapters = [...input.chapters].sort((a, b) => (nearest(a)?.date ?? '9999').localeCompare(nearest(b)?.date ?? '9999'))
  for (const chapter of chapters) {
    const exam = nearest(chapter)
    const eligible = result.days.filter(day => !day.rest && (!exam || day.date < exam.date))
    if (exam) {
      let remaining = chapter.unseenCards
      for (let index = 0; index < eligible.length; index++) {
        const day = eligible[index]
        const share = Math.ceil(remaining / (eligible.length - index))
        let excess = share
        for (const target of [day, ...eligible.slice(0, index).reverse()]) {
          const count = Math.min(excess, room(target))
          if (count) item(target, chapter).newCards += count
          excess -= count
          remaining -= count
        }
      }
      if (remaining) result.exams.find(entry => entry.id === exam.id)!.overloaded = true
    } else {
      let remaining = chapter.unseenCards
      for (const day of eligible) {
        const already = day.items.filter(entry => !entry.examId).reduce((sum, entry) => sum + entry.newCards, 0)
        const count = Math.min(remaining, Math.max(0, policy.defaultNewCards - already), room(day))
        if (count) item(day, chapter).newCards += count
        remaining -= count
      }
    }
  }
  for (let index = 0; index < result.days.length; index++) {
    const day = result.days[index]
    if (day.rest) continue
    let needed = Math.min(policy.minNewCards - newCount(day), room(day))
    for (const later of result.days.slice(index + 1)) {
      for (const entry of later.items) {
        if (needed <= 0) break
        const chapter = chapters.find(value => value.id === entry.chapterId)
        if (!chapter) continue
        const count = Math.min(needed, entry.newCards)
        if (count) { entry.newCards -= count; item(day, chapter).newCards += count; needed -= count }
      }
      if (needed <= 0) break
    }
  }
  for (const day of result.days) day.items = day.items.filter(entry => entry.newCards || entry.dueCards)
  const missing = new Set(exams.flatMap(exam => exam.subjects.filter(subject => !input.chapters.some(chapter => chapter.subject === subject && covered(chapter, exam) && (chapter.hasCards ?? (chapter.unseenCards > 0 || Object.values(chapter.dueByDate).some(Boolean)))))))
  if (result.days[0]) result.days[0].actions = [...missing].map(subject => ({ kind: 'addChapter', subject }))
  for (const day of result.days) {
    const order = input.subjectOrder?.(day.date) ?? []
    day.items.sort((a, b) => (order.indexOf(a.subject) < 0 ? order.length : order.indexOf(a.subject)) - (order.indexOf(b.subject) < 0 ? order.length : order.indexOf(b.subject)))
    for (const entry of day.items) entry.minutes = minutes(entry.dueCards + entry.newCards)
    day.minutes = minutes(used(day))
  }
  return result
}
