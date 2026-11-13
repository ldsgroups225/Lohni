import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { extractText } from '../../lib/parser/extract'
import type { UpFile } from '../../lib/parser/upload'
import type { SQLiteDatabase } from '../../utils/database/sqlite'
import { REVISION_POLICY as policy } from './policy'
import { advanceSession, answerXP } from './session'
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'
import { validItem } from '../quiz/validation'
import { buildPlan, type RevisionExam, type RevisionPlan } from './plan'
export type { RevisionExam } from './plan'

export class RevisionError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}

export type RevisionContext = { deviceId: string; localDate: string }
export type GeneratedCard = { kind: 'basic'; question: string; answer: string } | {
  kind: 'mcq'; question: string; answer: string; options: string[]; correct: number
}
export type GeneratedChapter = { summary: string; notes: { content: string; cards: GeneratedCard[] }[] }
export type ProfileInput = { schoolClass: string; series?: string; subjects: string[]; examDate?: string }
export type TimetableBlock = { day: number; start: string; end: string; subject: string }
export type RevisionSettings = { dailyMinutes: number; restDays: number[] }
export type RevisionCard = GeneratedCard & { id: string; chapterId: string; origin: 'ai' | 'import'; due: string; reviews: number }
export type RevisionSession = { kind?: 'exam' | 'express'; id: string; localDate: string; cards: RevisionCard[]; position: number; complete: boolean; repeated: string[]; elapsedMs: number; earnedXP: number; summary?: RevisionSummary }
export type RevisionSummary = {
  quiz: { total: number; correct: number }; flashcards: { total: number; knew: number };
  missed: { cardId: string; question: string; kind: 'basic' | 'mcq' }[]
}
export type RevisionAnswer = { answerId?: string; sessionId: string; cardId: string; position: number; knew: boolean; choice?: number; durationMs: number }
export type MasteryStatus = 'Fragile' | 'En cours' | 'Solide'
export type RevisionChapter = {
  id: string; subjectId: string; subject: string; title: string; summary: string; origin: 'ai' | 'import';
  cards: RevisionCard[]; seenCards: number; mastery: number | null; status: MasteryStatus
}
export type RevisionProgress = {
  streak: number; streakStarted: boolean; xp: number; learnedCards: number;
  subjects: { subjectId: string; name: string; mastery: number | null; status: MasteryStatus }[]
}
export type RevisionHome = { profile: ProfileInput; nextExam: Pick<RevisionExam, 'id' | 'title' | 'date'> | null; daysUntilExam: number | null; totalCards: number; cardCount: number; estimatedMinutes: number; moreCards: boolean; started: boolean; state: 'ready' | 'done' | 'empty' }
type Dependencies = { db: SQLiteDatabase; now: () => Date; generateCards: (input: { title: string; subject: string; schoolClass: string; series?: string; text?: string }) => Promise<GeneratedChapter>; transcribePhoto?: (file: UpFile) => Promise<string>; readTimetable?: (file: UpFile) => Promise<TimetableBlock[]> }
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const validUUID = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
const revisionCard = (row: { content: string; id: string; chapter_id: string; origin: RevisionCard['origin']; due: string; reviews: number }): RevisionCard =>
  ({ ...JSON.parse(row.content), id: row.id, chapterId: row.chapter_id, origin: row.origin, due: row.due, reviews: row.reviews })
const validCard = (card: GeneratedCard) => card && nonempty(card.question) && nonempty(card.answer)
  && (card.kind === 'basic' || (card.kind === 'mcq' && validItem({ ...card, id: 1, hint: '', explanation: card.answer })
    && Number.isInteger(card.correct) && card.options.every(nonempty) && new Set(card.options).size === card.options.length))
const journalXP = (rows: { knew: number; session_complete: number }[]) => rows.reduce((total, row) =>
  total + answerXP(Boolean(row.knew), Boolean(row.session_complete)), 0)

export class RevisionService {
  private ready: Promise<void>
  private scheduler = fsrs({ request_retention: policy.retention, enable_fuzz: false })
  constructor(private dependencies: Dependencies) {
    this.ready = dependencies.db.transaction(async () => {
      for (const sql of [
        `CREATE TABLE IF NOT EXISTS revision_generations (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, server_date TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS revision_generations_daily ON revision_generations(device_id, server_date)`,
        `CREATE TABLE IF NOT EXISTS revision_imports (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, server_date TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS revision_imports_daily ON revision_imports(device_id, server_date)`,
        `CREATE TABLE IF NOT EXISTS revision_profiles (device_id TEXT PRIMARY KEY, school_class TEXT NOT NULL, series TEXT, exam_date TEXT, xp INTEGER NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS revision_exams (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL, subjects TEXT NOT NULL, chapter_ids TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_migrations (name TEXT PRIMARY KEY)`,
        `CREATE TABLE IF NOT EXISTS revision_timetable (device_id TEXT PRIMARY KEY, blocks TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_settings (device_id TEXT PRIMARY KEY, daily_minutes INTEGER NOT NULL, rest_days TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_subjects (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(device_id, name))`,
        `CREATE TABLE IF NOT EXISTS revision_chapters (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, subject_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, origin TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_notes (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, chapter_id TEXT NOT NULL, content TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_cards (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, chapter_id TEXT NOT NULL, note_id TEXT NOT NULL, content TEXT NOT NULL, due TEXT NOT NULL, reviews INTEGER NOT NULL DEFAULT 0, scheduling TEXT)`,
        `CREATE TABLE IF NOT EXISTS revision_sessions (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, local_date TEXT NOT NULL, state TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS revision_cards_due ON revision_cards(device_id, due)`,
        `CREATE TABLE IF NOT EXISTS revision_journal (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, card_id TEXT NOT NULL, session_id TEXT NOT NULL, position INTEGER NOT NULL, reviewed_at TEXT NOT NULL, local_date TEXT NOT NULL, knew INTEGER NOT NULL, duration_ms INTEGER NOT NULL, scheduling TEXT NOT NULL, session_complete INTEGER NOT NULL DEFAULT 0, UNIQUE(session_id, position))`,
      ]) await dependencies.db.run(sql)
      if (!await this.columnExists('revision_sessions', 'kind')) await dependencies.db.run("ALTER TABLE revision_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily'")
      if (!await this.columnExists('revision_sessions', 'exam_id')) await dependencies.db.run('ALTER TABLE revision_sessions ADD COLUMN exam_id TEXT')
      if (!await this.columnExists('revision_journal', 'client_answer_id')) {
        await dependencies.db.run('ALTER TABLE revision_journal ADD COLUMN client_answer_id TEXT')
      }
      await dependencies.db.run('CREATE UNIQUE INDEX IF NOT EXISTS revision_answer_replay ON revision_journal(device_id, client_answer_id)')
      if (!await this.columnExists('revision_subjects', 'selected')) {
        await dependencies.db.run('ALTER TABLE revision_subjects ADD COLUMN selected INTEGER NOT NULL DEFAULT 1')
      }
      if (!await dependencies.db.get("SELECT name FROM revision_migrations WHERE name = 'exams'")) {
        const profiles = await dependencies.db.all('SELECT device_id, exam_date FROM revision_profiles WHERE exam_date IS NOT NULL')
        for (const profile of profiles) {
          const existing = await dependencies.db.get('SELECT id FROM revision_exams WHERE device_id = ? LIMIT 1', [profile.device_id])
          const subjects = (await dependencies.db.all('SELECT name FROM revision_subjects WHERE device_id = ? AND selected = 1 ORDER BY rowid', [profile.device_id])).map(row => row.name)
          if (!existing && validDate(profile.exam_date) && subjects.length) await dependencies.db.run('INSERT INTO revision_exams VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), profile.device_id, 'Examen', profile.exam_date, JSON.stringify(subjects), '[]'])
        }
        await dependencies.db.run("INSERT INTO revision_migrations VALUES ('exams')")
      }
      if (!await this.columnExists('revision_journal', 'session_complete')) {
        await dependencies.db.run('ALTER TABLE revision_journal ADD COLUMN session_complete INTEGER NOT NULL DEFAULT 0')
        await dependencies.db.run(`UPDATE revision_journal SET session_complete = 1 WHERE EXISTS
          (SELECT 1 FROM revision_sessions s WHERE s.id = session_id AND json_extract(s.state, '$.complete') = 1
          AND position = json_extract(s.state, '$.position') - 1)`)
      }
    })
  }
  private async columnExists(table: 'revision_journal' | 'revision_subjects' | 'revision_sessions', name: string): Promise<boolean> {
    return (await this.dependencies.db.all(`PRAGMA table_info(${table})`)).some(column => column.name === name)
  }
  private async execute<T>(context: RevisionContext, operation: () => Promise<T>): Promise<T> {
    if (!context || !validUUID(context.deviceId)) throw new RevisionError('Identifiant appareil invalide.')
    if (!validDate(context.localDate)) throw new RevisionError('Date locale invalide.')
    const serverDate = this.dependencies.now().toISOString().slice(0, 10)
    if (Math.abs(Date.parse(context.localDate) - Date.parse(serverDate)) > 86400000) throw new RevisionError('Date locale trop éloignée. Règle la date de ton appareil à un jour au plus de la date UTC du serveur.', 'REVISION_LOCAL_DATE_OUT_OF_RANGE')
    await this.ready
    return this.dependencies.db.transaction(operation)
  }
  async getProfile(context: RevisionContext): Promise<ProfileInput | null> {
    return this.execute(context, async () => {
      const profile = await this.readProfile(context.deviceId)
      if (profile) profile.examDate = (await this.nextExam(context))?.date
      return profile
    })
  }
  private validateTimetable(input: unknown): TimetableBlock[] {
    if (!Array.isArray(input) || input.length > policy.maxTimetableBlocks) throw new RevisionError('Nombre de blocs de cours invalide.')
    const time = (value: unknown) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
    const blocks = input.map(block => {
      if (!block || !Number.isInteger(block.day) || block.day < 0 || block.day > 6 || !time(block.start) || !time(block.end) || block.start >= block.end || !nonempty(block.subject) || block.subject.length > policy.maxTitleChars) throw new RevisionError('Bloc de cours invalide : vérifie le jour, les horaires et la matière.')
      return { day: block.day, start: block.start, end: block.end, subject: block.subject.trim() }
    })
    if (blocks.some((block, i) => blocks.some((other, j) => i !== j && block.day === other.day && block.start < other.end && other.start < block.end))) throw new RevisionError('Les cours ne peuvent pas se chevaucher.')
    return blocks
  }
  private async readTimetable(deviceId: string): Promise<TimetableBlock[]> {
    const row = await this.dependencies.db.get('SELECT blocks FROM revision_timetable WHERE device_id = ?', [deviceId])
    return row ? JSON.parse(row.blocks) : []
  }
  async getTimetable(context: RevisionContext) { return this.execute(context, () => this.readTimetable(context.deviceId)) }
  async saveTimetable(context: RevisionContext, input: TimetableBlock[]) {
    return this.execute(context, async () => {
      const blocks = this.validateTimetable(input)
      await this.dependencies.db.run('INSERT INTO revision_timetable VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET blocks = excluded.blocks', [context.deviceId, JSON.stringify(blocks)])
      await this.refreshSessions(context.deviceId, true)
      return blocks
    })
  }
  async readTimetablePhotos(context: RevisionContext, files: UpFile[]) {
    const profile = await this.execute(context, () => this.requireProfile(context.deviceId))
    if (!Array.isArray(files) || !files.length || files.length > policy.maxTimetablePhotos) throw new RevisionError(`Choisis entre 1 et ${policy.maxTimetablePhotos} photos.`)
    const images = files.map(file => {
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(file?.filename ?? '').toLowerCase()]
      if (!mime) throw new RevisionError('Format de photo non pris en charge. Choisis une image JPEG, PNG ou WebP.')
      return { ...file, mimeType: mime }
    })
    const id = randomUUID()
    await this.execute(context, async () => {
      const quota = await this.readImportQuota(context.deviceId)
      if (!quota.remaining) throw new RevisionError(`Tu as atteint tes ${policy.dailyImports} imports du jour. Recharge le ${quota.resetsAt.slice(0, 10)} à 00:00 UTC.`)
      await this.dependencies.db.run('INSERT INTO revision_imports VALUES (?, ?, ?)', [id, context.deviceId, this.dependencies.now().toISOString().slice(0, 10)])
    })
    try {
      if (!this.dependencies.readTimetable) throw new Error('Lecteur indisponible')
      const extracted: TimetableBlock[] = []
      for (const image of images) {
        if ((await stat(image.path)).size > policy.maxUploadMB * 1024 * 1024) throw new RevisionError(`Le fichier dépasse la limite de ${policy.maxUploadMB} Mo.`)
        const result = await this.dependencies.readTimetable(image)
        if (!Array.isArray(result)) throw new Error('Lecture invalide')
        extracted.push(...result)
      }
      const unique = new Map(extracted.map(block => [JSON.stringify([block?.day, block?.start, block?.end, typeof block?.subject === 'string' ? block.subject.trim() : block?.subject]), block]))
      const blocks = this.validateTimetable([...unique.values()])
      if (!blocks.length) throw new Error('Lecture vide')
      return { blocks, unknownSubjects: [...new Set(blocks.map(block => block.subject).filter(subject => !profile.subjects.includes(subject)))] }
    } catch (error) {
      await this.execute(context, () => this.dependencies.db.run('DELETE FROM revision_imports WHERE id = ? AND device_id = ?', [id, context.deviceId]))
      if (error instanceof RevisionError) throw error
      throw new RevisionError('Impossible de lire cet emploi du temps. Prends des photos nettes et réessaie.')
    }
  }
  async getSettings(context: RevisionContext): Promise<RevisionSettings> {
    return this.execute(context, async () => {
      const row = await this.dependencies.db.get('SELECT daily_minutes, rest_days FROM revision_settings WHERE device_id = ?', [context.deviceId])
      return row ? { dailyMinutes: row.daily_minutes, restDays: JSON.parse(row.rest_days) } : { dailyMinutes: policy.defaultDailyMinutes, restDays: [] }
    })
  }
  async saveSettings(context: RevisionContext, input: RevisionSettings): Promise<RevisionSettings> {
    return this.execute(context, async () => {
      if (!input || !policy.dailyMinutesChoices.some(minutes => minutes === input.dailyMinutes)) throw new RevisionError('Durée quotidienne invalide.')
      if (!Array.isArray(input.restDays) || input.restDays.length > 6 || input.restDays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(input.restDays).size !== input.restDays.length) throw new RevisionError('Jours de repos invalides.')
      await this.dependencies.db.run(`INSERT INTO revision_settings(device_id, daily_minutes, rest_days) VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET daily_minutes=excluded.daily_minutes, rest_days=excluded.rest_days`,
      [context.deviceId, input.dailyMinutes, JSON.stringify(input.restDays)])
      await this.refreshSessions(context.deviceId, true)
      return { dailyMinutes: input.dailyMinutes, restDays: [...input.restDays] }
    })
  }
  async getProgress(context: RevisionContext): Promise<RevisionProgress> {
    return this.execute(context, async () => {
      const rows = await this.dependencies.db.all('SELECT card_id, knew, session_complete, local_date FROM revision_journal WHERE device_id = ?', [context.deviceId])
      const xp = journalXP(rows)
      const days = new Set(rows.filter(row => row.session_complete).map(row => row.local_date))
      // shortcut: seuls les jours sans carte constatés par une visite sont neutres ; historiser les échéances si ce suivi doit être exhaustif.
      const sessions = await this.dependencies.db.all("SELECT local_date, state FROM revision_sessions WHERE device_id = ? AND kind = 'daily' AND NOT (COALESCE(json_extract(state, '$.stale'), 0) = 1 AND json_extract(state, '$.position') = 0)", [context.deviceId])
      const emptyDays = new Set(sessions.filter(row => JSON.parse(row.state).cards.length === 0).map(row => row.local_date))
      for (const row of sessions) if (JSON.parse(row.state).cards.length > 0 && !days.has(row.local_date)) emptyDays.delete(row.local_date)
      let date = Date.parse(context.localDate)
      if (!days.has(context.localDate)) date -= 86400000
      let streak = 0
      while (days.has(new Date(date).toISOString().slice(0, 10)) || emptyDays.has(new Date(date).toISOString().slice(0, 10))) {
        if (days.has(new Date(date).toISOString().slice(0, 10))) streak++
        date -= 86400000
      }
      const chapters = await this.readChapters(context.deviceId)
      const subjects = (await this.dependencies.db.all('SELECT id, name FROM revision_subjects WHERE device_id = ? AND selected = 1 ORDER BY rowid', [context.deviceId])).map(subject => {
        const own = chapters.filter(chapter => chapter.subjectId === subject.id)
        const seen = own.flatMap(chapter => chapter.mastery === null ? [] : [chapter.mastery])
        const mastery = seen.length ? seen.reduce((sum, value) => sum + value, 0) / seen.length : null
        return { subjectId: subject.id, name: subject.name, mastery,
          status: this.masteryStatus(mastery, own.reduce((sum, chapter) => sum + chapter.seenCards, 0), own.reduce((sum, chapter) => sum + chapter.cards.length, 0)) }
      })
      return { xp, streak, streakStarted: days.size > 0, learnedCards: new Set(rows.filter(row => row.knew).map(row => row.card_id)).size, subjects }
    })
  }
  async listChapters(context: RevisionContext): Promise<RevisionChapter[]> {
    return this.execute(context, () => this.readChapters(context.deviceId))
  }
  private masteryStatus(mastery: number | null, seen: number, total: number): MasteryStatus {
    if (mastery === null || seen < total * policy.minimumSeenRatio || mastery < policy.ongoingMastery) return 'Fragile'
    return mastery >= policy.solidMastery ? 'Solide' : 'En cours'
  }
  private async readChapters(deviceId: string): Promise<RevisionChapter[]> {
    const db = this.dependencies.db
    const chapters = await db.all(`SELECT c.*, s.name AS subject FROM revision_chapters c
      JOIN revision_subjects s ON s.id = c.subject_id AND s.device_id = c.device_id WHERE c.device_id = ? ORDER BY c.rowid`, [deviceId])
    const rows = await db.all(`SELECT c.*, j.scheduling AS reviewed_scheduling FROM revision_cards c
      LEFT JOIN revision_journal j ON j.rowid = (SELECT MAX(rowid) FROM revision_journal WHERE device_id = c.device_id AND card_id = c.id)
      WHERE c.device_id = ? ORDER BY c.rowid`, [deviceId])
    return chapters.map(chapter => {
      const own = rows.filter(row => row.chapter_id === chapter.id)
      const seen = own.filter(row => row.reviewed_scheduling)
      const mastery = seen.length ? seen.reduce((sum, row) => sum + this.scheduler.retrievability(JSON.parse(row.reviewed_scheduling).card, this.dependencies.now()) * 100, 0) / seen.length : null
      return { id: chapter.id, subjectId: chapter.subject_id, subject: chapter.subject, title: chapter.title, summary: chapter.summary, origin: chapter.origin,
        cards: own.map(row => revisionCard({ ...row, origin: chapter.origin })),
        seenCards: seen.length, mastery, status: this.masteryStatus(mastery, seen.length, own.length) }
    })
  }
  async getHome(context: RevisionContext): Promise<RevisionHome | null> {
    const profile = await this.getProfile(context)
    if (!profile) return null
    const session = await this.getSession(context)
    return this.execute(context, async () => {
      const total = await this.dependencies.db.get(`SELECT COUNT(*) AS count FROM revision_cards c
        JOIN revision_chapters ch ON ch.id = c.chapter_id JOIN revision_subjects s ON s.id = ch.subject_id
        WHERE c.device_id = ? AND s.selected = 1`, [context.deviceId])
      const completed = await this.dependencies.db.get(`SELECT id FROM revision_journal WHERE device_id = ? AND local_date = ?
        AND session_complete = 1 LIMIT 1`, [context.deviceId, context.localDate])
      const nextExam = await this.nextExam(context)
      const cardCount = session.complete ? 0 : session.cards.length - session.position
      return {
        profile, nextExam, totalCards: total.count, cardCount,
        moreCards: !session.complete || (await this.selectSessionCards(context, profile)).length > 0,
        daysUntilExam: nextExam ? (Date.parse(nextExam.date) - Date.parse(context.localDate)) / 86400000 : null,
        estimatedMinutes: Math.ceil(cardCount * policy.sessionMinutes / policy.sessionCards),
        started: !session.complete && session.position > 0,
        state: session.complete ? (completed ? 'done' : 'empty') : 'ready',
      }
    })
  }
  private async readProfile(deviceId: string): Promise<ProfileInput | null> {
    const db = this.dependencies.db
    const profile = await db.get('SELECT * FROM revision_profiles WHERE device_id = ?', [deviceId])
    if (!profile) return null
    return { schoolClass: profile.school_class, series: profile.series ?? undefined, examDate: undefined,
      subjects: (await db.all('SELECT name FROM revision_subjects WHERE device_id = ? AND selected = 1 ORDER BY rowid', [deviceId])).map(s => s.name) }
  }
  private async requireProfile(deviceId: string): Promise<ProfileInput> {
    const profile = await this.readProfile(deviceId)
    if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
    return profile
  }
  async saveProfile(context: RevisionContext, input: ProfileInput): Promise<ProfileInput> {
    return this.execute(context, async () => {
      if (!input || typeof input.schoolClass !== 'string' || !input.schoolClass.trim() || !Array.isArray(input.subjects) || !input.subjects.length || input.subjects.some(s => typeof s !== 'string' || !s.trim())) throw new RevisionError('Classe et matières requises.')
      if (input.examDate !== undefined && !validDate(input.examDate)) throw new RevisionError('Date d’examen invalide.')
      if (input.examDate && Date.parse(input.examDate) - Date.parse(context.localDate) > policy.maxExamHorizonDays * 86400000) throw new RevisionError('La date d’examen est trop éloignée.')
      if (input.series !== undefined && !nonempty(input.series)) throw new RevisionError('Série invalide.')
      const db = this.dependencies.db
      await db.run(`INSERT INTO revision_profiles(device_id, school_class, series) VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET school_class=excluded.school_class, series=excluded.series`,
        [context.deviceId, input.schoolClass.trim(), input.series ?? null])
      await db.run('UPDATE revision_subjects SET selected = 0 WHERE device_id = ?', [context.deviceId])
      for (const subject of input.subjects) await db.run(`INSERT INTO revision_subjects(id, device_id, name) VALUES (?, ?, ?)
        ON CONFLICT(device_id, name) DO UPDATE SET selected = 1`, [randomUUID(), context.deviceId, subject.trim()])
      if (input.examDate !== undefined) {
        const previous = (await this.readExams(context.deviceId)).find(exam => exam.title === 'Examen')
        await this.writeExam(context, { id: previous?.id, title: 'Examen', date: input.examDate, subjects: input.subjects, chapterIds: [] })
      }
      await this.refreshSessions(context.deviceId)
      await this.refreshSessions(context.deviceId, true)
      const profile = await this.requireProfile(context.deviceId)
      profile.examDate = (await this.nextExam(context))?.date
      return profile
    })
  }
  private async readExams(deviceId: string): Promise<RevisionExam[]> {
    const rows = await this.dependencies.db.all('SELECT * FROM revision_exams WHERE device_id = ? ORDER BY date, rowid', [deviceId])
    return rows.map(row => ({ id: row.id, title: row.title, date: row.date, subjects: JSON.parse(row.subjects), chapterIds: JSON.parse(row.chapter_ids) }))
  }
  private async nextExam(context: RevisionContext): Promise<Pick<RevisionExam, 'id' | 'title' | 'date'> | null> {
    const exam = (await this.readExams(context.deviceId)).find(item => item.date >= context.localDate)
    return exam ? { id: exam.id, title: exam.title, date: exam.date } : null
  }
  async getPlan(context: RevisionContext): Promise<RevisionPlan> {
    return this.execute(context, () => this.readPlan(context))
  }
  private async readPlan(context: RevisionContext): Promise<RevisionPlan> {
    const db = this.dependencies.db
    const profile = await this.requireProfile(context.deviceId)
    const savedExams = await this.readExams(context.deviceId)
    const settings = await db.get('SELECT daily_minutes, rest_days FROM revision_settings WHERE device_id = ?', [context.deviceId])
    const chapters = (await this.readChapters(context.deviceId)).filter(chapter => profile.subjects.includes(chapter.subject))
    const exams = savedExams.map(exam => {
      const subjects = exam.subjects.filter(subject => profile.subjects.includes(subject))
      return { ...exam, subjects, chapterIds: exam.chapterIds.filter(id => chapters.some(chapter => chapter.id === id && subjects.includes(chapter.subject))) }
    })
    const introduced = await db.all(`SELECT DISTINCT j.card_id FROM revision_journal j JOIN revision_sessions s ON s.id = j.session_id WHERE j.device_id = ? AND j.local_date = ? AND s.kind = 'daily' AND json_extract(j.scheduling, '$.log.state') = 0`, [context.deviceId, context.localDate])
    const reviewed = new Set((await db.all('SELECT card_id FROM revision_journal WHERE device_id = ? AND local_date = ?', [context.deviceId, context.localDate])).map(row => row.card_id))
    const introducedIds = new Set(introduced.map(row => row.card_id))
    const completedReviewsToday = (await db.all(`SELECT DISTINCT j.card_id FROM revision_journal j JOIN revision_sessions s ON s.id = j.session_id WHERE j.device_id = ? AND j.local_date = ? AND s.kind = 'daily' AND json_extract(j.scheduling, '$.log.state') != 0`, [context.deviceId, context.localDate])).filter(row => !introducedIds.has(row.card_id)).length
    const timetable = await this.readTimetable(context.deviceId)
    const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
    const duration = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    const heavy = (date: string) => timetable.filter(block => block.day === weekday(date)).reduce((sum, block) => sum + duration(block.end) - duration(block.start), 0) >= policy.heavyDayHours * 60
    const plan = buildPlan({ heavy, completedReviewsToday, capacity: (date, base) => heavy(date) ? base * policy.heavyDayFactor : base,
      subjectOrder: date => timetable.filter(block => block.day === (weekday(date) + 1) % 7 && profile.subjects.includes(block.subject)).map(block => block.subject), today: context.localDate, exams, dailyMinutes: settings?.daily_minutes ?? policy.defaultDailyMinutes,
      restDays: settings ? JSON.parse(settings.rest_days) : [], chapters: chapters.map(chapter => {
        const dueByDate: Record<string, number> = {}
        for (const card of chapter.cards) if (card.reviews > 0 && (!reviewed.has(card.id) || card.due.slice(0, 10) > context.localDate)) {
          const date = card.due.slice(0, 10)
          dueByDate[date] = (dueByDate[date] ?? 0) + 1
        }
        return { id: chapter.id, title: chapter.title, subject: chapter.subject,
          unseenCards: chapter.cards.filter(card => card.reviews === 0 || introducedIds.has(card.id)).length, hasCards: chapter.cards.length > 0, dueByDate }
      }) })
    const today = plan.days[0]
    if (today) {
      for (const item of today.items) {
        const chapter = chapters.find(entry => entry.id === item.chapterId)!
        item.newCards = Math.max(0, item.newCards - chapter.cards.filter(card => introducedIds.has(card.id)).length)
        item.minutes = Math.ceil((item.newCards + item.dueCards) * policy.sessionMinutes / policy.sessionCards)
      }
      today.minutes = Math.ceil(today.items.reduce((sum, item) => sum + item.newCards + item.dueCards, 0) * policy.sessionMinutes / policy.sessionCards)
      today.overloaded = today.items.reduce((sum, item) => sum + item.newCards + item.dueCards, 0) > today.capacityCards
    }
    return plan
  }
  async listExams(context: RevisionContext): Promise<RevisionExam[]> {
    return this.execute(context, () => this.readExams(context.deviceId))
  }
  private async writeExam(context: RevisionContext, input: { id?: string; title: string; date: string; subjects: string[]; chapterIds?: string[] }): Promise<RevisionExam> {
    const db = this.dependencies.db
    const profile = await this.requireProfile(context.deviceId)
    if (!input || !nonempty(input.title) || input.title.length > policy.maxTitleChars || !validDate(input.date) || !Array.isArray(input.subjects) || !input.subjects.length || input.subjects.some(subject => !profile.subjects.includes(subject)) || (input.chapterIds !== undefined && (!Array.isArray(input.chapterIds) || input.chapterIds.some(id => typeof id !== 'string')))) throw new RevisionError('Examen invalide : vérifie le titre, la date et les matières.')
    if (Date.parse(input.date) - Date.parse(context.localDate) > policy.maxExamHorizonDays * 86400000) throw new RevisionError('La date d’examen est trop éloignée.')
    const exams = await this.readExams(context.deviceId)
    if (input.id !== undefined && (typeof input.id !== 'string' || !exams.some(exam => exam.id === input.id))) throw new RevisionError('Examen introuvable.')
    if (!input.id && exams.length >= policy.maxExams) throw new RevisionError(`Tu peux ajouter ${policy.maxExams} examens au maximum.`)
    const chapters = await this.readChapters(context.deviceId)
    if ((input.chapterIds ?? []).some(id => !chapters.some(chapter => chapter.id === id && input.subjects.includes(chapter.subject)))) throw new RevisionError('Chapitre invalide pour cet examen.')
    const exam = { id: input.id ?? randomUUID(), title: input.title.trim(), date: input.date, subjects: [...new Set(input.subjects)], chapterIds: [...new Set(input.chapterIds ?? [])] }
    await db.run('INSERT INTO revision_exams VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, date=excluded.date, subjects=excluded.subjects, chapter_ids=excluded.chapter_ids', [exam.id, context.deviceId, exam.title, exam.date, JSON.stringify(exam.subjects), JSON.stringify(exam.chapterIds)])
    return exam
  }
  async saveExam(context: RevisionContext, input: { id?: string; title: string; date: string; subjects: string[]; chapterIds?: string[] }): Promise<RevisionExam> {
    return this.execute(context, async () => { const exam = await this.writeExam(context, input); await this.refreshSessions(context.deviceId, true); return exam })
  }
  async deleteExam(context: RevisionContext, id: string): Promise<void> {
    return this.execute(context, async () => {
      if (!nonempty(id) || !(await this.dependencies.db.run('DELETE FROM revision_exams WHERE id = ? AND device_id = ?', [id, context.deviceId])).changes) throw new RevisionError('Examen introuvable.')
      await this.refreshSessions(context.deviceId, true)
    })
  }
  async generateChapter(context: RevisionContext, input: { title: string; subject: string }) {
    const profile = await this.execute(context, () => this.requireProfile(context.deviceId))
    if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > policy.maxTitleChars || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    const generationId = randomUUID()
    await this.execute(context, async () => {
      const date = this.dependencies.now().toISOString().slice(0, 10)
      const row = await this.dependencies.db.get('SELECT COUNT(*) AS count FROM revision_generations WHERE device_id = ? AND server_date = ?', [context.deviceId, date])
      if (row.count >= policy.dailyGenerations) throw new RevisionError(`Tu as atteint tes ${policy.dailyGenerations} générations du jour. Recharge le ${new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)} à 00:00 UTC.`)
      // shortcut: un arrêt serveur consomme cette place jusqu’à minuit ; réconcilier si les arrêts deviennent fréquents.
      await this.dependencies.db.run('INSERT INTO revision_generations VALUES (?, ?, ?)', [generationId, context.deviceId, date])
    })
    try {
      const generated = await this.dependencies.generateCards({ title: input.title.trim(), subject: input.subject, schoolClass: profile.schoolClass, series: profile.series })
      return await this.storeChapter(context, input, generated, 'ai')
    } catch (error) {
      await this.execute(context, () => this.dependencies.db.run('DELETE FROM revision_generations WHERE id = ? AND device_id = ?', [generationId, context.deviceId]))
      if (error instanceof RevisionError) throw error
      console.error('Génération IA en échec :', error)
      throw new RevisionError('Le service IA est indisponible pour le moment, réessaie plus tard.')
    }
  }

  async saveTutorNote(context: RevisionContext, input: { subject: string; title: string; question: string; answer: string }) {
    return this.execute(context, async () => {
      const profile = await this.requireProfile(context.deviceId)
      if (!input || !profile.subjects.includes(input.subject) || !nonempty(input.title) || input.title.length > policy.maxTitleChars
        || !nonempty(input.question) || !nonempty(input.answer) || input.question.length > policy.maxQuestionChars || input.answer.length > policy.maxTextChars) {
        throw new RevisionError('Choisis une matière, un chapitre et une carte avec question et réponse.')
      }
      const db = this.dependencies.db
      const subject = await db.get('SELECT id FROM revision_subjects WHERE device_id = ? AND name = ?', [context.deviceId, input.subject])
      const existing = await db.get('SELECT id FROM revision_chapters WHERE device_id = ? AND subject_id = ? AND title = ?', [context.deviceId, subject.id, input.title.trim()])
      const chapterId = existing?.id ?? randomUUID()
      if (!existing) await db.run('INSERT INTO revision_chapters VALUES (?, ?, ?, ?, ?, ?)', [chapterId, context.deviceId, subject.id, input.title.trim(), 'Notes enregistrées depuis le Tuteur.', 'ai'])
      const noteId = randomUUID()
      const id = randomUUID()
      const card: GeneratedCard = { kind: 'basic', question: input.question.trim(), answer: input.answer.trim() }
      await db.run('INSERT INTO revision_notes VALUES (?, ?, ?, ?)', [noteId, context.deviceId, chapterId, card.answer])
      await db.run('INSERT INTO revision_cards(id, device_id, chapter_id, note_id, content, due) VALUES (?, ?, ?, ?, ?, ?)',
        [id, context.deviceId, chapterId, noteId, JSON.stringify(card), this.dependencies.now().toISOString()])
      return { id }
    })
  }
  async importChapter(context: RevisionContext, input: { title: string; subject: string; text?: string; file?: UpFile }) {
    const profile = await this.execute(context, () => this.requireProfile(context.deviceId))
    if (!input || !nonempty(input.title) || input.title.length > policy.maxTitleChars || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    if (input.file && input.text !== undefined) throw new RevisionError('Choisis un fichier ou du texte, pas les deux.')
    let mime: string | undefined
    if (input.file) {
      mime = { '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(input.file.filename ?? '').toLowerCase()]
      if (!mime) throw new RevisionError('Format non pris en charge. Choisis un fichier texte, PDF, Word (.docx), Markdown ou une photo (JPEG, PNG, WebP).')
    }
    const importId = randomUUID()
    await this.execute(context, async () => {
      const quota = await this.readImportQuota(context.deviceId)
      if (!quota.remaining) throw new RevisionError(`Tu as atteint tes ${policy.dailyImports} imports du jour. Recharge le ${quota.resetsAt.slice(0, 10)} à 00:00 UTC.`)
      // shortcut: un arrêt serveur consomme cette place jusqu’à minuit ; réconcilier si les arrêts deviennent fréquents.
      await this.dependencies.db.run('INSERT INTO revision_imports VALUES (?, ?, ?)', [importId, context.deviceId, this.dependencies.now().toISOString().slice(0, 10)])
    })
    try {
      let text = input.text
      if (input.file && mime) {
        try {
          if ((await stat(input.file.path)).size > policy.maxUploadMB * 1024 * 1024) throw new RevisionError(`Le fichier dépasse la limite de ${policy.maxUploadMB} Mo.`)
          if (mime.startsWith('image/')) {
            if (!this.dependencies.transcribePhoto) throw new RevisionError('La lecture des photos est indisponible. Colle le texte du cours ou réessaie plus tard.')
            text = await this.dependencies.transcribePhoto({ ...input.file, mimeType: mime })
            if (!nonempty(text)) throw new RevisionError('Photo illisible. Prends une photo nette et bien éclairée ou colle le texte du cours.')
          } else text = await extractText(input.file.path, mime)
        } catch (error) {
          if (error instanceof RevisionError) throw error
          throw new RevisionError(mime.startsWith('image/')
            ? 'La lecture des photos est indisponible. Colle le texte du cours ou réessaie plus tard.'
            : 'Fichier illisible. Essaie un autre fichier ou colle le texte du cours.')
        }
      }
      if (!nonempty(text)) throw new RevisionError('Le cours est vide. Ajoute du texte ou un fichier lisible.')
      if (text.length > policy.maxTextChars) throw new RevisionError(`Le cours est trop long. Importe un chapitre de moins de ${policy.maxTextChars.toLocaleString('fr-FR')} caractères.`)
      const generated = await this.dependencies.generateCards({ title: input.title, subject: input.subject, text, schoolClass: profile.schoolClass, series: profile.series })
      return await this.storeChapter(context, input, generated, 'import')
    } catch (error) {
      await this.execute(context, () => this.dependencies.db.run('DELETE FROM revision_imports WHERE id = ? AND device_id = ?', [importId, context.deviceId]))
      if (error instanceof RevisionError) throw error
      throw new RevisionError('Impossible de préparer ce cours. Réessaie dans un instant.')
    }
  }
  async getImportQuota(context: RevisionContext) {
    return this.execute(context, () => this.readImportQuota(context.deviceId))
  }
  private async readImportQuota(deviceId: string) {
    const date = this.dependencies.now().toISOString().slice(0, 10)
    const row = await this.dependencies.db.get('SELECT COUNT(*) AS count FROM revision_imports WHERE device_id = ? AND server_date = ?', [deviceId, date])
    return { remaining: Math.max(0, policy.dailyImports - row.count), resetsAt: new Date(Date.parse(date) + 86400000).toISOString() }
  }
  private async storeChapter(context: RevisionContext, input: { title: string; subject: string }, generated: GeneratedChapter, origin: 'ai' | 'import') {
    if (!generated || !nonempty(generated.summary) || !Array.isArray(generated.notes) || !generated.notes.length || generated.notes.some(note =>
      !note || !nonempty(note.content) || !Array.isArray(note.cards) || !note.cards.length || note.cards.some(card => !validCard(card)))) throw new RevisionError('Génération invalide. Réessaie avec un autre chapitre.')
    if (origin === 'import' && (!generated.notes.some(note => note.cards.some(card => card.kind === 'basic'))
      || !generated.notes.some(note => note.cards.some(card => card.kind === 'mcq')))) throw new RevisionError('Génération invalide. Le cours doit contenir un résumé, des cartes et des QCM. Réessaie.')
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const subject = await db.get('SELECT id FROM revision_subjects WHERE device_id = ? AND name = ?', [context.deviceId, input.subject])
      const chapterId = randomUUID()
      await db.run('INSERT INTO revision_chapters VALUES (?, ?, ?, ?, ?, ?)', [chapterId, context.deviceId, subject.id, input.title.trim(), generated.summary, origin])
      for (const note of generated.notes) {
        const noteId = randomUUID()
        await db.run('INSERT INTO revision_notes VALUES (?, ?, ?, ?)', [noteId, context.deviceId, chapterId, note.content])
        for (const card of note.cards) await db.run('INSERT INTO revision_cards(id, device_id, chapter_id, note_id, content, due) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), context.deviceId, chapterId, noteId, JSON.stringify(card), this.dependencies.now().toISOString()])
      }
      return { id: chapterId, title: input.title, summary: generated.summary, origin }
    })
  }
  async getSession(context: RevisionContext, continueSession = false): Promise<RevisionSession> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const saved = await db.get("SELECT state FROM revision_sessions WHERE device_id = ? AND local_date = ? AND kind = 'daily' AND COALESCE(json_extract(state, '$.stale'), 0) = 0 AND json_array_length(json_extract(state, '$.cards')) > 0 ORDER BY (json_extract(state, '$.position') > 0 AND NOT json_extract(state, '$.complete')) DESC, rowid DESC LIMIT 1", [context.deviceId, context.localDate])
      if (saved && (!continueSession || !JSON.parse(saved.state).complete)) return this.sessionResult(JSON.parse(saved.state))
      const profile = await this.requireProfile(context.deviceId)
      profile.examDate = (await this.nextExam(context))?.date
      const cards = await this.selectSessionCards(context, profile)
      const session: RevisionSession = { id: randomUUID(), localDate: context.localDate, cards, position: 0, complete: cards.length === 0, repeated: [], elapsedMs: 0, earnedXP: 0 }
      await db.run('INSERT INTO revision_sessions (id, device_id, local_date, state) VALUES (?, ?, ?, ?)', [session.id, context.deviceId, context.localDate, JSON.stringify(session)])
      return this.sessionResult(session)
    })
  }
  async getExamSession(context: RevisionContext, examId: string, continueSession = false): Promise<RevisionSession> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const exam = (await this.readExams(context.deviceId)).find(item => item.id === examId)
      if (!exam || exam.date < context.localDate) throw new RevisionError('Examen introuvable ou déjà passé.')
      const kind = Date.parse(exam.date) - Date.parse(context.localDate) === 86400000 ? 'express' : 'exam'
      const saved = await db.get("SELECT state FROM revision_sessions WHERE device_id = ? AND local_date = ? AND kind = ? AND exam_id = ? AND COALESCE(json_extract(state, '$.stale'), 0) = 0 AND json_array_length(json_extract(state, '$.cards')) > 0 ORDER BY rowid DESC LIMIT 1", [context.deviceId, context.localDate, kind, examId])
      if (saved && (!continueSession || !JSON.parse(saved.state).complete)) return { ...await this.sessionResult(JSON.parse(saved.state)), kind }
      const profile = await this.requireProfile(context.deviceId)
      const chapters = (await this.readChapters(context.deviceId)).filter(chapter => profile.subjects.includes(chapter.subject) && exam.subjects.includes(chapter.subject))
      const chapterIds = exam.chapterIds.filter(id => chapters.some(chapter => chapter.id === id))
      const scoped = new Set(chapters.filter(chapter => !chapterIds.length || chapterIds.includes(chapter.id)).map(chapter => chapter.id))
      const reviewed = new Set((await db.all('SELECT card_id FROM revision_journal WHERE device_id = ? AND local_date = ?', [context.deviceId, context.localDate])).map(row => row.card_id))
      const rows = (await db.all(`SELECT c.*, ch.origin FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id WHERE c.device_id = ? ORDER BY c.rowid`, [context.deviceId])).filter(row => scoped.has(row.chapter_id) && !reviewed.has(row.id))
      const due = rows.filter(row => row.reviews > 0 && (kind === 'express' ? this.scheduler.retrievability(JSON.parse(row.scheduling), this.dependencies.now()) * 100 < policy.ongoingMastery : row.due.slice(0, 10) <= context.localDate))
      due.sort((a, b) => this.scheduler.retrievability(JSON.parse(a.scheduling), this.dependencies.now()) - this.scheduler.retrievability(JSON.parse(b.scheduling), this.dependencies.now()))
      const selected = [...due]
      if (kind === 'exam') {
        const plan = await this.readPlan(context)
        const selectDays = (days: typeof plan.days) => {
          for (const day of days) for (const item of day.items) if (scoped.has(item.chapterId)) {
            const available = rows.filter(row => row.chapter_id === item.chapterId && row.reviews === 0 && !selected.includes(row))
            selected.push(...available.slice(0, item.newCards))
          }
        }
        selectDays(continueSession ? plan.days : plan.days.slice(0, 1))
        if (!selected.length) selectDays(plan.days.slice(1))
      }
      const cards = selected.slice(0, policy.sessionCards).map(revisionCard)
      const session: RevisionSession = { id: randomUUID(), localDate: context.localDate, cards, position: 0, complete: cards.length === 0, repeated: [], elapsedMs: 0, earnedXP: 0 }
      await db.run('INSERT INTO revision_sessions (id, device_id, local_date, state, kind, exam_id) VALUES (?, ?, ?, ?, ?, ?)', [session.id, context.deviceId, context.localDate, JSON.stringify(session), kind, examId])
      return { ...await this.sessionResult(session), kind }
    })
  }
  private async selectSessionCards(context: RevisionContext, profile: ProfileInput): Promise<RevisionCard[]> {
    const db = this.dependencies.db
    const settings = await db.get('SELECT rest_days FROM revision_settings WHERE device_id = ?', [context.deviceId])
    if (settings && JSON.parse(settings.rest_days).includes(new Date(`${context.localDate}T00:00:00Z`).getUTCDay())) return []
    const rows = await db.all(`SELECT c.*, ch.origin, s.name AS subject FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id
      JOIN revision_subjects s ON s.id = ch.subject_id WHERE c.device_id = ? AND s.selected = 1 ORDER BY c.rowid`, [context.deviceId])
    const introduced = await db.get(`SELECT COUNT(DISTINCT j.card_id) AS count FROM revision_journal j
      JOIN revision_cards c ON c.id = j.card_id AND c.device_id = j.device_id
      WHERE j.device_id = ? AND j.local_date = ? AND json_extract(j.scheduling, '$.log.state') = 0
      AND json_extract(c.content, '$.kind') = 'basic'`, [context.deviceId, context.localDate])
    const introducedMcq = await db.get(`SELECT COUNT(DISTINCT j.card_id) AS count FROM revision_journal j
      JOIN revision_cards c ON c.id = j.card_id AND c.device_id = j.device_id
      WHERE j.device_id = ? AND j.local_date = ? AND json_extract(j.scheduling, '$.log.state') = 0
      AND json_extract(c.content, '$.kind') = 'mcq'`, [context.deviceId, context.localDate])
    const reviewed = new Set((await db.all('SELECT card_id FROM revision_journal WHERE device_id = ? AND local_date = ?', [context.deviceId, context.localDate])).map(r => r.card_id))
    const unseen = rows.filter(r => r.reviews === 0 && JSON.parse(r.content).kind === 'basic').length
    const days = profile.examDate ? (Date.parse(profile.examDate) - Date.parse(context.localDate)) / 86400000 : 0
    const quota = (days > 0 ? Math.max(policy.minNewCards, Math.min(policy.maxNewCards, Math.ceil((unseen + introduced.count) / days))) : policy.defaultNewCards) - introduced.count
    const eligible = rows.filter(r => !reviewed.has(r.id) && (r.reviews === 0 || r.due.slice(0, 10) <= context.localDate))
    const tomorrow = (new Date(`${context.localDate}T00:00:00Z`).getUTCDay() + 1) % 7
    const preferred = new Set((await this.readTimetable(context.deviceId)).filter(block => block.day === tomorrow && profile.subjects.includes(block.subject)).map(block => block.subject))
    const rank = (row: any) => row.reviews > 0 ? 0 : JSON.parse(row.content).kind === 'mcq' ? 2 : 1
    eligible.sort((a, b) => rank(a) - rank(b) || Number(preferred.has(b.subject)) - Number(preferred.has(a.subject)) || (a.reviews > 0 && b.reviews > 0
      ? this.scheduler.retrievability(JSON.parse(a.scheduling), this.dependencies.now()) - this.scheduler.retrievability(JSON.parse(b.scheduling), this.dependencies.now()) : 0))
    const plan = await this.readPlan(context)
    if (plan.exams.length) {
      const day = plan.days[0]
      if (!day) {
        const settings = await db.get('SELECT rest_days FROM revision_settings WHERE device_id = ?', [context.deviceId])
        const restDays: number[] = settings ? JSON.parse(settings.rest_days) : []
        return restDays.includes(new Date(`${context.localDate}T00:00:00Z`).getUTCDay()) ? [] : eligible.filter(row => row.reviews > 0).slice(0, policy.sessionCards).map(revisionCard)
      }
      if (day.rest) return []
      const quotas = new Map(day.items.map(item => [item.chapterId, item.newCards]))
      return eligible.filter(row => {
        if (row.reviews > 0) return true
        const remaining = quotas.get(row.chapter_id) ?? 0
        if (!remaining) return false
        quotas.set(row.chapter_id, remaining - 1)
        return true
      }).slice(0, policy.sessionCards).map(revisionCard)
    }
    let newCount = 0
    let newMcqCount = 0
    const mcqQuota = quota + introduced.count - introducedMcq.count
    const selected = eligible.filter(row => row.reviews > 0 || (JSON.parse(row.content).kind === 'mcq' ? ++newMcqCount <= mcqQuota : ++newCount <= quota)).slice(0, policy.sessionCards)
    return selected.map(revisionCard)
  }
  private async sessionResult(session: RevisionSession): Promise<RevisionSession> {
    const rows = await this.dependencies.db.all('SELECT knew, session_complete, position FROM revision_journal WHERE session_id = ? ORDER BY position', [session.id])
    const summary: RevisionSummary = { quiz: { total: 0, correct: 0 }, flashcards: { total: 0, knew: 0 }, missed: [] }
    const lastKnew = new Map<string, boolean>()
    for (const row of rows) {
      const card = session.cards[row.position]
      if (!card) continue
      const part = card.kind === 'mcq' ? summary.quiz : summary.flashcards
      part.total++
      if (row.knew) card.kind === 'mcq' ? summary.quiz.correct++ : summary.flashcards.knew++
      lastKnew.set(card.id, Boolean(row.knew))
    }
    // Ordre de première réponse ratée ; une carte réussie ensuite sort de la liste.
    const seen = new Set<string>()
    for (const row of rows) {
      const card = session.cards[row.position]
      if (card && !row.knew && !lastKnew.get(card.id) && !seen.has(card.id)) {
        seen.add(card.id)
        summary.missed.push({ cardId: card.id, question: card.question, kind: card.kind })
      }
    }
    return { ...session, earnedXP: journalXP(rows), summary }
  }
  async answer(context: RevisionContext, input: RevisionAnswer): Promise<RevisionSession> {
    return this.execute(context, async () => {
      if (!input || !nonempty(input.sessionId) || !nonempty(input.cardId) || typeof input.knew !== 'boolean' || !Number.isInteger(input.position) || input.position < 0 || !Number.isSafeInteger(input.durationMs) || input.durationMs < 0) throw new RevisionError('Réponse invalide.')
      if (input.answerId !== undefined && !validUUID(input.answerId)) throw new RevisionError('Identifiant de réponse invalide.')
      const durationMs = Math.min(input.durationMs, policy.sessionMinutes * 60000)
      const db = this.dependencies.db
      const saved = await db.get('SELECT state, kind FROM revision_sessions WHERE id = ? AND device_id = ? AND local_date = ?', [input.sessionId, context.deviceId, context.localDate])
      if (!saved) throw new RevisionError('Session introuvable.')
      const session: RevisionSession = await this.sessionResult(JSON.parse(saved.state))
      delete (session as RevisionSession & { stale?: boolean }).stale
      if (input.answerId) {
        const replay = await db.get('SELECT session_id, card_id, position FROM revision_journal WHERE device_id = ? AND client_answer_id = ?', [context.deviceId, input.answerId])
        if (replay) {
          if (replay.session_id !== input.sessionId || replay.card_id !== input.cardId || replay.position !== input.position) throw new RevisionError('Identifiant de réponse déjà utilisé.')
          return this.sessionResult(session)
        }
      }
      const previous = await db.get('SELECT card_id FROM revision_journal WHERE session_id = ? AND position = ?', [input.sessionId, input.position])
      if (previous?.card_id === input.cardId) return this.sessionResult(session)
      const card = session.cards[session.position]
      if (session.complete || session.position !== input.position || card?.id !== input.cardId) throw new RevisionError('Cette carte ne correspond pas à la session en cours.')
      const row = await db.get('SELECT * FROM revision_cards WHERE device_id = ? AND id = ?', [context.deviceId, input.cardId])
      if (!row) throw new RevisionError('Carte introuvable.')
      if (card.kind === 'mcq' && (typeof input.choice !== 'number' || !Number.isInteger(input.choice) || input.choice < 1 || input.choice > card.options.length)) throw new RevisionError('Choisis une réponse au QCM.')
      const knew = input.knew && (card.kind !== 'mcq' || input.choice === card.correct)
      const now = this.dependencies.now()
      const other = await db.get("SELECT j.scheduling FROM revision_journal j JOIN revision_sessions s ON s.id = j.session_id WHERE j.device_id = ? AND j.local_date = ? AND j.card_id = ? AND j.session_id != ? AND s.kind != 'express' LIMIT 1", [context.deviceId, context.localDate, card.id, session.id])
      const scheduled = other ? JSON.parse(other.scheduling) : this.scheduler.next(row.scheduling ? JSON.parse(row.scheduling) : createEmptyCard(now), now, knew ? Rating.Good : Rating.Again)
      if (saved.kind !== 'express' && !other) {
        await db.run('UPDATE revision_cards SET scheduling = ?, due = ?, reviews = reviews + 1 WHERE id = ? AND device_id = ?', [JSON.stringify(scheduled.card), scheduled.card.due.toISOString(), card.id, context.deviceId])
        card.due = scheduled.card.due.toISOString()
        card.reviews = row.reviews + 1
      } else if (saved.kind === 'express' && !other) scheduled.card = JSON.parse(row.scheduling)
      advanceSession(session, knew, durationMs)
      await db.run(`INSERT INTO revision_journal (id, device_id, card_id, session_id, position, reviewed_at, local_date, knew, duration_ms, scheduling, session_complete, client_answer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), context.deviceId, card.id, session.id, input.position, now.toISOString(), context.localDate, Number(knew), durationMs, JSON.stringify(scheduled), Number(session.complete), input.answerId ?? null])
      await db.run('UPDATE revision_sessions SET state = ? WHERE id = ?', [JSON.stringify(session), session.id])
      return this.sessionResult(session)
    })
  }
  async updateCard(context: RevisionContext, cardId: string, input: GeneratedCard): Promise<void> {
    return this.execute(context, async () => {
      if (!validCard(input)) throw new RevisionError('Carte invalide. Vérifie la question et la réponse.')
      const { kind, question, answer } = input
      const content = kind === 'mcq' ? { kind, question, answer, options: input.options, correct: input.correct } : { kind, question, answer }
      const updated = await this.dependencies.db.run('UPDATE revision_cards SET content = ? WHERE id = ? AND device_id = ?', [JSON.stringify(content), cardId, context.deviceId])
      if (!updated.changes) throw new RevisionError('Carte introuvable.')
      await this.refreshSessions(context.deviceId)
    })
  }
  private async refreshSessions(deviceId: string, settingsChanged = false): Promise<void> {
    const db = this.dependencies.db
    const cards = new Map((await db.all(`SELECT c.*, ch.origin FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id
      JOIN revision_subjects s ON s.id = ch.subject_id WHERE c.device_id = ? AND s.selected = 1`, [deviceId])).map(row => [row.id, row]))
    for (const row of await db.all('SELECT id, state FROM revision_sessions WHERE device_id = ?', [deviceId])) {
      const session: RevisionSession = JSON.parse(row.state)
      if (settingsChanged) {
        if (session.position === 0) await db.run("UPDATE revision_sessions SET state = json_set(state, '$.stale', 1) WHERE id = ?", [row.id])
        continue
      }
      session.cards = [...session.cards.slice(0, session.position), ...session.cards.slice(session.position).flatMap(card => {
        const current = cards.get(card.id)
        return current ? [revisionCard(current)] : []
      })]
      session.complete = session.complete || session.position >= session.cards.length
      await db.run('UPDATE revision_sessions SET state = ? WHERE id = ?', [JSON.stringify(session), row.id])
    }
  }
  async deleteCard(context: RevisionContext, cardId: string): Promise<void> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const deleted = await db.run('DELETE FROM revision_cards WHERE id = ? AND device_id = ?', [cardId, context.deviceId])
      if (!deleted.changes) throw new RevisionError('Carte introuvable.')
      await db.run(`DELETE FROM revision_notes WHERE device_id = ? AND NOT EXISTS
        (SELECT 1 FROM revision_cards WHERE note_id = revision_notes.id)`, [context.deviceId])
      await this.refreshSessions(context.deviceId)
    })
  }
  async deleteChapter(context: RevisionContext, chapterId: string): Promise<void> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const deleted = await db.run('DELETE FROM revision_chapters WHERE id = ? AND device_id = ?', [chapterId, context.deviceId])
      if (!deleted.changes) throw new RevisionError('Chapitre introuvable.')
      await db.run('DELETE FROM revision_cards WHERE chapter_id = ? AND device_id = ?', [chapterId, context.deviceId])
      await db.run('DELETE FROM revision_notes WHERE chapter_id = ? AND device_id = ?', [chapterId, context.deviceId])
      await this.refreshSessions(context.deviceId)
    })
  }
}
