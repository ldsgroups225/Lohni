// A student's day is a local calendar date `YYYY-MM-DD` (the X-Local-Date header); all arithmetic is done in UTC on that string, so it never depends on the machine's timezone.
const DAY_MS = 86400000

export const localDay = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')

export const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS

// 0 = Sunday, like Date#getDay.
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()

export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7))

// Révision express: the exam is tomorrow.
export const isExpress = (examDate: string, today: string) => daysBetween(today, examDate) === 1

// A card's due instant, moved by the gap between the student's day and the server's UTC day when it was scheduled,
// so its first ten characters name the student's local day. FSRS intervals keep the time of day, so only the day boundary moves.
export const dueOnLocalDay = (due: Date, now: Date, today: string) =>
  new Date(due.getTime() + daysBetween(now.toISOString().slice(0, 10), today) * DAY_MS).toISOString()
