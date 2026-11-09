import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { extractText } from '../../lib/parser/extract'
import type { UpFile } from '../../lib/parser/upload'
import type { SQLiteDatabase } from '../../utils/database/sqlite'
import { REVISION_POLICY as policy } from './policy'
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'
import { validItem } from '../quiz/validation'

export class RevisionError extends Error {}

export type RevisionContext = { deviceId: string; localDate: string }
export type GeneratedCard = { kind: 'basic'; question: string; answer: string } | {
  kind: 'mcq'; question: string; answer: string; options: string[]; correct: number
}
export type GeneratedChapter = { summary: string; notes: { content: string; cards: GeneratedCard[] }[] }
export type ProfileInput = { schoolClass: string; series?: string; subjects: string[]; examDate?: string }
export type RevisionCard = GeneratedCard & { id: string; chapterId: string; origin: 'ai' | 'import'; due: string; reviews: number }
export type RevisionSession = { id: string; localDate: string; cards: RevisionCard[]; position: number; complete: boolean; repeated: string[]; elapsedMs: number; earnedXP: number }
export type RevisionAnswer = { sessionId: string; cardId: string; position: number; knew: boolean; choice?: number; durationMs: number }
export type MasteryStatus = 'Fragile' | 'En cours' | 'Solide'
export type RevisionChapter = {
  id: string; subjectId: string; subject: string; title: string; summary: string; origin: 'ai' | 'import';
  cards: RevisionCard[]; seenCards: number; mastery: number | null; status: MasteryStatus
}
export type RevisionProgress = {
  streak: number; xp: number; learnedCards: number;
  subjects: { subjectId: string; name: string; mastery: number | null; status: MasteryStatus }[]
}
export type RevisionHome = { profile: ProfileInput; daysUntilExam: number | null; totalCards: number; cardCount: number; estimatedMinutes: number; state: 'ready' | 'done' | 'empty' }
type Dependencies = { db: SQLiteDatabase; now: () => Date; generateCards: (input: { title: string; subject: string; schoolClass: string; series?: string; text?: string }) => Promise<GeneratedChapter>; transcribePhoto?: (file: UpFile) => Promise<string> }
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const validCard = (card: GeneratedCard) => card && nonempty(card.question) && nonempty(card.answer)
  && (card.kind === 'basic' || (card.kind === 'mcq' && validItem({ ...card, id: 1, hint: '', explanation: card.answer })
    && Number.isInteger(card.correct) && card.options.every(nonempty) && new Set(card.options).size === card.options.length))
const journalXP = (rows: { knew: number; session_complete: number }[]) => rows.reduce((total, row) =>
  total + (row.knew ? policy.knownXP : policy.missedXP) + (row.session_complete ? policy.sessionXP : 0), 0)

export class RevisionService {
  private ready: Promise<void>
  private scheduler = fsrs({ request_retention: policy.retention, enable_fuzz: false })
  constructor(private dependencies: Dependencies) {
    this.ready = dependencies.db.transaction(async () => {
      for (const sql of [
        `CREATE TABLE IF NOT EXISTS revision_imports (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, server_date TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS revision_imports_daily ON revision_imports(device_id, server_date)`,
        `CREATE TABLE IF NOT EXISTS revision_profiles (device_id TEXT PRIMARY KEY, school_class TEXT NOT NULL, series TEXT, exam_date TEXT, xp INTEGER NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS revision_subjects (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(device_id, name))`,
        `CREATE TABLE IF NOT EXISTS revision_chapters (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, subject_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, origin TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_notes (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, chapter_id TEXT NOT NULL, content TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS revision_cards (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, chapter_id TEXT NOT NULL, note_id TEXT NOT NULL, content TEXT NOT NULL, due TEXT NOT NULL, reviews INTEGER NOT NULL DEFAULT 0, scheduling TEXT)`,
        `CREATE TABLE IF NOT EXISTS revision_sessions (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, local_date TEXT NOT NULL, state TEXT NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS revision_cards_due ON revision_cards(device_id, due)`,
        `CREATE TABLE IF NOT EXISTS revision_journal (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, card_id TEXT NOT NULL, session_id TEXT NOT NULL, position INTEGER NOT NULL, reviewed_at TEXT NOT NULL, local_date TEXT NOT NULL, knew INTEGER NOT NULL, duration_ms INTEGER NOT NULL, scheduling TEXT NOT NULL, session_complete INTEGER NOT NULL DEFAULT 0, UNIQUE(session_id, position))`,
      ]) await dependencies.db.run(sql)
      if (!(await dependencies.db.all('PRAGMA table_info(revision_subjects)')).some(column => column.name === 'selected')) {
        await dependencies.db.run('ALTER TABLE revision_subjects ADD COLUMN selected INTEGER NOT NULL DEFAULT 1')
      }
      if (!(await dependencies.db.all('PRAGMA table_info(revision_journal)')).some(column => column.name === 'session_complete')) {
        await dependencies.db.run('ALTER TABLE revision_journal ADD COLUMN session_complete INTEGER NOT NULL DEFAULT 0')
        await dependencies.db.run(`UPDATE revision_journal SET session_complete = 1 WHERE EXISTS
          (SELECT 1 FROM revision_sessions s WHERE s.id = session_id AND json_extract(s.state, '$.complete') = 1
          AND position = json_extract(s.state, '$.position') - 1)`)
      }
    })
  }
  private async execute<T>(context: RevisionContext, operation: () => Promise<T>): Promise<T> {
    if (!context || typeof context.deviceId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(context.deviceId)) throw new RevisionError('Identifiant appareil invalide.')
    if (!validDate(context.localDate)) throw new RevisionError('Date locale invalide.')
    await this.ready
    return this.dependencies.db.transaction(operation)
  }
  async getProfile(context: RevisionContext): Promise<ProfileInput | null> {
    return this.execute(context, () => this.readProfile(context.deviceId))
  }
  async getProgress(context: RevisionContext): Promise<RevisionProgress> {
    return this.execute(context, async () => {
      const rows = await this.dependencies.db.all('SELECT card_id, knew, session_complete, local_date FROM revision_journal WHERE device_id = ?', [context.deviceId])
      const xp = journalXP(rows)
      const days = new Set(rows.filter(row => row.session_complete).map(row => row.local_date))
      let date = Date.parse(context.localDate)
      if (!days.has(context.localDate)) date -= 86400000
      let streak = 0
      while (days.has(new Date(date).toISOString().slice(0, 10))) {
        streak++
        date -= 86400000
      }
      const chapters = await this.readChapters(context.deviceId)
      const subjects = (await this.dependencies.db.all('SELECT id, name FROM revision_subjects WHERE device_id = ? AND selected = 1 ORDER BY rowid', [context.deviceId])).map(subject => {
        const own = chapters.filter(chapter => chapter.subjectId === subject.id)
        const seen = own.filter(chapter => chapter.mastery !== null)
        const mastery = seen.length ? seen.reduce((sum, chapter) => sum + chapter.mastery!, 0) / seen.length : null
        return { subjectId: subject.id, name: subject.name, mastery,
          status: this.masteryStatus(mastery, own.reduce((sum, chapter) => sum + chapter.seenCards, 0), own.reduce((sum, chapter) => sum + chapter.cards.length, 0)) }
      })
      return { xp, streak, learnedCards: new Set(rows.filter(row => row.knew).map(row => row.card_id)).size, subjects }
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
      const mastery = seen.length ? seen.reduce((sum, row) => sum + this.scheduler.get_retrievability(JSON.parse(row.reviewed_scheduling).card, this.dependencies.now(), false) * 100, 0) / seen.length : null
      return { id: chapter.id, subjectId: chapter.subject_id, subject: chapter.subject, title: chapter.title, summary: chapter.summary, origin: chapter.origin,
        cards: own.map(row => ({ ...JSON.parse(row.content), id: row.id, chapterId: row.chapter_id, origin: chapter.origin, due: row.due, reviews: row.reviews })),
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
      const cardCount = session.complete ? 0 : session.cards.length - session.position
      return {
        profile, totalCards: total.count, cardCount,
        daysUntilExam: profile.examDate ? Math.max(0, (Date.parse(profile.examDate) - Date.parse(context.localDate)) / 86400000) : null,
        estimatedMinutes: Math.ceil(cardCount * policy.sessionMinutes / policy.sessionCards),
        state: session.complete ? (completed ? 'done' : 'empty') : 'ready',
      }
    })
  }
  private async readProfile(deviceId: string): Promise<ProfileInput | null> {
    const db = this.dependencies.db
    const profile = await db.get('SELECT * FROM revision_profiles WHERE device_id = ?', [deviceId])
    if (!profile) return null
    return { schoolClass: profile.school_class, series: profile.series ?? undefined, examDate: profile.exam_date ?? undefined,
      subjects: (await db.all('SELECT name FROM revision_subjects WHERE device_id = ? AND selected = 1 ORDER BY rowid', [deviceId])).map(s => s.name) }
  }
  async saveProfile(context: RevisionContext, input: ProfileInput): Promise<ProfileInput> {
    return this.execute(context, async () => {
      if (!input || typeof input.schoolClass !== 'string' || !input.schoolClass.trim() || !Array.isArray(input.subjects) || !input.subjects.length || input.subjects.some(s => typeof s !== 'string' || !s.trim())) throw new RevisionError('Classe et matières requises.')
      if (input.examDate !== undefined && !validDate(input.examDate)) throw new RevisionError('Date d’examen invalide.')
      if (input.series !== undefined && !nonempty(input.series)) throw new RevisionError('Série invalide.')
      const db = this.dependencies.db
      await db.run(`INSERT INTO revision_profiles(device_id, school_class, series, exam_date) VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET school_class=excluded.school_class, series=excluded.series, exam_date=excluded.exam_date`,
        [context.deviceId, input.schoolClass.trim(), input.series ?? null, input.examDate ?? null])
      await db.run('UPDATE revision_subjects SET selected = 0 WHERE device_id = ?', [context.deviceId])
      for (const subject of input.subjects) await db.run(`INSERT INTO revision_subjects(id, device_id, name) VALUES (?, ?, ?)
        ON CONFLICT(device_id, name) DO UPDATE SET selected = 1`, [randomUUID(), context.deviceId, subject.trim()])
      await this.refreshSessions(context.deviceId)
      return (await this.readProfile(context.deviceId))!
    })
  }
  async generateChapter(context: RevisionContext, input: { title: string; subject: string }) {
    const profile = await this.getProfile(context)
    if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
    if (!input || typeof input.title !== 'string' || !input.title.trim() || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    const generated = await this.dependencies.generateCards({ title: input.title.trim(), subject: input.subject, schoolClass: profile.schoolClass, series: profile.series })
    return this.storeChapter(context, input, generated, 'ai')
  }
  async saveTutorNote(context: RevisionContext, input: { subject: string; title: string; question: string; answer: string }) {
    return this.execute(context, async () => {
      const profile = await this.readProfile(context.deviceId)
      if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
      if (!input || !profile.subjects.includes(input.subject) || !nonempty(input.title) || input.title.length > 200
        || !nonempty(input.question) || !nonempty(input.answer) || input.question.length > 10000 || input.answer.length > 100000) {
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
    const profile = await this.getProfile(context)
    if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
    if (!input || !nonempty(input.title) || input.title.length > 200 || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    if (input.file && input.text !== undefined) throw new RevisionError('Choisis un fichier ou du texte, pas les deux.')
    let mime: string | undefined
    if (input.file) {
      mime = { '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(input.file.filename ?? '').toLowerCase()]
      if (!mime) throw new RevisionError('Format non pris en charge. Choisis un fichier texte, PDF, Word (.docx), Markdown ou une photo (JPEG, PNG, WebP).')
    }
    const importId = randomUUID()
    await this.execute(context, async () => {
      const quota = await this.readImportQuota(context.deviceId)
      if (!quota.remaining) throw new RevisionError(`Tu as atteint tes trois imports du jour. Recharge le ${quota.resetsAt.slice(0, 10)} à 00:00 UTC.`)
      // shortcut: un arrêt serveur consomme cette place jusqu’à minuit ; réconcilier si les arrêts deviennent fréquents.
      await this.dependencies.db.run('INSERT INTO revision_imports VALUES (?, ?, ?)', [importId, context.deviceId, this.dependencies.now().toISOString().slice(0, 10)])
    })
    try {
      let text = input.text
      if (input.file && mime) {
        try {
          if ((await stat(input.file.path)).size > 10 * 1024 * 1024) throw new RevisionError('Le fichier dépasse la limite de 10 Mo.')
          if (mime.startsWith('image/')) {
            if (!this.dependencies.transcribePhoto) throw new RevisionError('La lecture des photos est indisponible. Colle le texte du cours ou réessaie plus tard.')
            text = await this.dependencies.transcribePhoto({ ...input.file, mimeType: mime })
            if (!nonempty(text)) throw new Error('empty transcription')
          } else text = await extractText(input.file.path, mime)
        } catch (error) {
          if (error instanceof RevisionError) throw error
          throw new RevisionError(mime.startsWith('image/')
            ? 'Photo illisible. Prends une photo nette et bien éclairée ou colle le texte du cours.'
            : 'Fichier illisible. Essaie un autre fichier ou colle le texte du cours.')
        }
      }
      if (!nonempty(text)) throw new RevisionError('Le cours est vide. Ajoute du texte ou un fichier lisible.')
      if (text.length > 100000) throw new RevisionError('Le cours est trop long. Importe un chapitre de moins de 100 000 caractères.')
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
      const saved = await db.get('SELECT state FROM revision_sessions WHERE device_id = ? AND local_date = ? ORDER BY rowid DESC LIMIT 1', [context.deviceId, context.localDate])
      if (saved && (!continueSession || !JSON.parse(saved.state).complete)) return this.sessionResult(JSON.parse(saved.state))
      const profile = await this.readProfile(context.deviceId)
      if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
      const rows = await db.all(`SELECT c.*, ch.origin FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id
        JOIN revision_subjects s ON s.id = ch.subject_id WHERE c.device_id = ? AND s.selected = 1 ORDER BY c.rowid`, [context.deviceId])
      const introduced = await db.get(`SELECT COUNT(DISTINCT card_id) AS count FROM revision_journal
        WHERE device_id = ? AND local_date = ? AND json_extract(scheduling, '$.log.state') = 0`, [context.deviceId, context.localDate])
      const reviewed = new Set((await db.all('SELECT card_id FROM revision_journal WHERE device_id = ? AND local_date = ?', [context.deviceId, context.localDate])).map(r => r.card_id))
      const unseen = rows.filter(r => r.reviews === 0).length
      const days = profile.examDate ? (Date.parse(profile.examDate) - Date.parse(context.localDate)) / 86400000 : 0
      const quota = (days > 0 ? Math.max(policy.minNewCards, Math.min(policy.maxNewCards, Math.ceil((unseen + introduced.count) / days))) : policy.defaultNewCards) - introduced.count
      const eligible = rows.filter(r => !reviewed.has(r.id) && (r.reviews === 0 || r.due.slice(0, 10) <= context.localDate))
      const rank = (row: any) => JSON.parse(row.content).kind === 'mcq' ? 2 : row.reviews > 0 ? 0 : 1
      eligible.sort((a, b) => rank(a) - rank(b) || (a.reviews > 0 && b.reviews > 0
        ? this.scheduler.get_retrievability(JSON.parse(a.scheduling), this.dependencies.now(), false) - this.scheduler.get_retrievability(JSON.parse(b.scheduling), this.dependencies.now(), false) : 0))
      let newCount = 0
      const selected = eligible.filter(row => row.reviews > 0 || ++newCount <= quota).slice(0, policy.sessionCards)
      const cards: RevisionCard[] = selected.map(row => ({ ...JSON.parse(row.content), id: row.id, chapterId: row.chapter_id, origin: row.origin, due: row.due, reviews: row.reviews }))
      const session: RevisionSession = { id: randomUUID(), localDate: context.localDate, cards, position: 0, complete: cards.length === 0, repeated: [], elapsedMs: 0, earnedXP: 0 }
      await db.run('INSERT INTO revision_sessions VALUES (?, ?, ?, ?)', [session.id, context.deviceId, context.localDate, JSON.stringify(session)])
      return session
    })
  }
  private async sessionResult(session: RevisionSession): Promise<RevisionSession> {
    const rows = await this.dependencies.db.all('SELECT knew, session_complete FROM revision_journal WHERE session_id = ?', [session.id])
    return { ...session, earnedXP: journalXP(rows) }
  }
  async answer(context: RevisionContext, input: RevisionAnswer): Promise<RevisionSession> {
    return this.execute(context, async () => {
      if (!input || !nonempty(input.sessionId) || !nonempty(input.cardId) || typeof input.knew !== 'boolean' || !Number.isInteger(input.position) || input.position < 0 || !Number.isSafeInteger(input.durationMs) || input.durationMs < 0) throw new RevisionError('Réponse invalide.')
      const durationMs = Math.min(input.durationMs, policy.sessionMinutes * 60000)
      const db = this.dependencies.db
      const saved = await db.get('SELECT state FROM revision_sessions WHERE id = ? AND device_id = ? AND local_date = ?', [input.sessionId, context.deviceId, context.localDate])
      if (!saved) throw new RevisionError('Session introuvable.')
      const session: RevisionSession = JSON.parse(saved.state)
      const previous = await db.get('SELECT card_id FROM revision_journal WHERE session_id = ? AND position = ?', [input.sessionId, input.position])
      if (previous?.card_id === input.cardId) return this.sessionResult(session)
      const card = session.cards[session.position]
      if (session.complete || session.position !== input.position || card?.id !== input.cardId) throw new RevisionError('Cette carte ne correspond pas à la session en cours.')
      const row = await db.get('SELECT * FROM revision_cards WHERE device_id = ? AND id = ?', [context.deviceId, input.cardId])
      if (!row) throw new RevisionError('Carte introuvable.')
      if (card.kind === 'mcq' && (!Number.isInteger(input.choice) || input.choice! < 1 || input.choice! > card.options.length)) throw new RevisionError('Choisis une réponse au QCM.')
      const knew = input.knew && (card.kind !== 'mcq' || input.choice === card.correct)
      const now = this.dependencies.now()
      const scheduled = this.scheduler.next(row.scheduling ? JSON.parse(row.scheduling) : createEmptyCard(now), now, knew ? Rating.Good : Rating.Again)
      await db.run('UPDATE revision_cards SET scheduling = ?, due = ?, reviews = reviews + 1 WHERE id = ? AND device_id = ?', [JSON.stringify(scheduled.card), scheduled.card.due.toISOString(), card.id, context.deviceId])
      card.due = scheduled.card.due.toISOString()
      card.reviews = row.reviews + 1
      if (!knew && !session.repeated.includes(card.id)) {
        // Une reprise remplace une carte encore à voir ; la dernière peut ajouter une 21e réponse.
        if (session.cards.length >= policy.sessionCards) {
          for (let i = session.cards.length - 1; i > session.position; i--) {
            if (!session.repeated.includes(session.cards[i].id)) {
              session.cards.splice(i, 1)
              break
            }
          }
        }
        session.cards.push({ ...card })
        session.repeated.push(card.id)
      }
      session.position++
      session.elapsedMs += durationMs
      session.complete = session.position >= session.cards.length || session.elapsedMs >= policy.sessionMinutes * 60000
      await db.run(`INSERT INTO revision_journal (id, device_id, card_id, session_id, position, reviewed_at, local_date, knew, duration_ms, scheduling, session_complete)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), context.deviceId, card.id, session.id, input.position, now.toISOString(), context.localDate, Number(knew), durationMs, JSON.stringify(scheduled), Number(session.complete)])
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
  private async refreshSessions(deviceId: string): Promise<void> {
    const db = this.dependencies.db
    const cards = new Map((await db.all(`SELECT c.* FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id
      JOIN revision_subjects s ON s.id = ch.subject_id WHERE c.device_id = ? AND s.selected = 1`, [deviceId])).map(row => [row.id, row]))
    for (const row of await db.all('SELECT id, state FROM revision_sessions WHERE device_id = ?', [deviceId])) {
      const session: RevisionSession = JSON.parse(row.state)
      session.cards = [...session.cards.slice(0, session.position), ...session.cards.slice(session.position).flatMap(card => {
        const current = cards.get(card.id)
        return current ? [{ ...JSON.parse(current.content), id: current.id, chapterId: current.chapter_id, origin: card.origin, due: current.due, reviews: current.reviews }] : []
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
