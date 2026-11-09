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
export type RevisionSession = { id: string; localDate: string; cards: RevisionCard[]; position: number; complete: boolean; repeated: string[]; elapsedMs: number }
export type RevisionAnswer = { sessionId: string; cardId: string; position: number; knew: boolean; choice?: number; durationMs: number }
type Dependencies = { db: SQLiteDatabase; now: () => Date; generateCards: (input: { title: string; subject: string; schoolClass: string; text?: string }) => Promise<GeneratedChapter> }
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

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
        `CREATE TABLE IF NOT EXISTS revision_journal (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, card_id TEXT NOT NULL, session_id TEXT NOT NULL, position INTEGER NOT NULL, reviewed_at TEXT NOT NULL, local_date TEXT NOT NULL, knew INTEGER NOT NULL, duration_ms INTEGER NOT NULL, scheduling TEXT NOT NULL, UNIQUE(session_id, position))`,
      ]) await dependencies.db.run(sql)
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
  private async readProfile(deviceId: string): Promise<ProfileInput | null> {
    const db = this.dependencies.db
    const profile = await db.get('SELECT * FROM revision_profiles WHERE device_id = ?', [deviceId])
    if (!profile) return null
    return { schoolClass: profile.school_class, series: profile.series ?? undefined, examDate: profile.exam_date ?? undefined,
      subjects: (await db.all('SELECT name FROM revision_subjects WHERE device_id = ? ORDER BY rowid', [deviceId])).map(s => s.name) }
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
      for (const subject of input.subjects) await db.run('INSERT OR IGNORE INTO revision_subjects(id, device_id, name) VALUES (?, ?, ?)', [randomUUID(), context.deviceId, subject.trim()])
      return (await this.readProfile(context.deviceId))!
    })
  }
  async generateChapter(context: RevisionContext, input: { title: string; subject: string }) {
    const profile = await this.getProfile(context)
    if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
    if (!input || typeof input.title !== 'string' || !input.title.trim() || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    const generated = await this.dependencies.generateCards({ ...input, schoolClass: profile.schoolClass })
    return this.storeChapter(context, input, generated, 'ai')
  }
  async importChapter(context: RevisionContext, input: { title: string; subject: string; text?: string; file?: UpFile }) {
    const profile = await this.getProfile(context)
    if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
    if (!input || !nonempty(input.title) || input.title.length > 200 || !profile.subjects.includes(input.subject)) throw new RevisionError('Matière ou chapitre invalide.')
    if (input.file && input.text !== undefined) throw new RevisionError('Choisis un fichier ou du texte, pas les deux.')
    let text = input.text
    if (input.file) {
      const mime = { '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[extname(input.file.filename ?? '').toLowerCase()]
      if (!mime) throw new RevisionError('Format non pris en charge. Choisis un fichier texte, PDF, Word (.docx) ou Markdown.')
      try {
        if ((await stat(input.file.path)).size > 10 * 1024 * 1024) throw new RevisionError('Le fichier dépasse la limite de 10 Mo.')
        text = await extractText(input.file.path, mime)
      } catch (error) {
        if (error instanceof RevisionError) throw error
        throw new RevisionError('Fichier illisible. Essaie un autre fichier ou colle le texte du cours.')
      }
    }
    if (!nonempty(text)) throw new RevisionError('Le cours est vide. Ajoute du texte ou un fichier lisible.')
    if (text.length > 100000) throw new RevisionError('Le cours est trop long. Importe un chapitre de moins de 100 000 caractères.')
    const importId = randomUUID()
    await this.execute(context, async () => {
      const quota = await this.readImportQuota(context.deviceId)
      if (!quota.remaining) throw new RevisionError(`Tu as atteint tes trois imports du jour. Recharge le ${quota.resetsAt.slice(0, 10)} à 00:00 UTC.`)
      // shortcut: un arrêt serveur consomme cette place jusqu’à minuit ; réconcilier si les arrêts deviennent fréquents.
      await this.dependencies.db.run('INSERT INTO revision_imports VALUES (?, ?, ?)', [importId, context.deviceId, this.dependencies.now().toISOString().slice(0, 10)])
    })
    try {
      const generated = await this.dependencies.generateCards({ title: input.title, subject: input.subject, text, schoolClass: profile.schoolClass })
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
      !note || !nonempty(note.content) || !Array.isArray(note.cards) || !note.cards.length || note.cards.some(card =>
        !card || !nonempty(card.question) || !nonempty(card.answer) || (card.kind !== 'basic' && (card.kind !== 'mcq'
          || !validItem({ ...card, id: 1, hint: '', explanation: card.answer }) || !Number.isInteger(card.correct)
          || card.options.some(option => !nonempty(option)) || new Set(card.options).size !== card.options.length))))) throw new RevisionError('Génération invalide. Réessaie avec un autre chapitre.')
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
      if (saved && (!continueSession || !JSON.parse(saved.state).complete)) return JSON.parse(saved.state)
      const profile = await this.readProfile(context.deviceId)
      if (!profile) throw new RevisionError('Crée ton profil pour commencer.')
      const rows = await db.all(`SELECT c.*, ch.origin FROM revision_cards c JOIN revision_chapters ch ON ch.id = c.chapter_id WHERE c.device_id = ? ORDER BY c.rowid`, [context.deviceId])
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
      const session: RevisionSession = { id: randomUUID(), localDate: context.localDate, cards, position: 0, complete: cards.length === 0, repeated: [], elapsedMs: 0 }
      await db.run('INSERT INTO revision_sessions VALUES (?, ?, ?, ?)', [session.id, context.deviceId, context.localDate, JSON.stringify(session)])
      return session
    })
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
      if (previous?.card_id === input.cardId) return session
      const card = session.cards[session.position]
      if (session.complete || session.position !== input.position || card?.id !== input.cardId) throw new RevisionError('Cette carte ne correspond pas à la session en cours.')
      const row = await db.get('SELECT * FROM revision_cards WHERE device_id = ? AND id = ?', [context.deviceId, input.cardId])
      if (!row) throw new RevisionError('Carte introuvable.')
      if (card.kind === 'mcq' && (!Number.isInteger(input.choice) || input.choice! < 1 || input.choice! > card.options.length)) throw new RevisionError('Choisis une réponse au QCM.')
      const knew = input.knew && (card.kind !== 'mcq' || input.choice === card.correct)
      const now = this.dependencies.now()
      const scheduled = this.scheduler.next(row.scheduling ? JSON.parse(row.scheduling) : createEmptyCard(now), now, knew ? Rating.Good : Rating.Again)
      await db.run('UPDATE revision_cards SET scheduling = ?, due = ?, reviews = reviews + 1 WHERE id = ? AND device_id = ?', [JSON.stringify(scheduled.card), scheduled.card.due.toISOString(), card.id, context.deviceId])
      await db.run('INSERT INTO revision_journal VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), context.deviceId, card.id, session.id, session.position, now.toISOString(), context.localDate, Number(knew), durationMs, JSON.stringify(scheduled)])
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
      await db.run('UPDATE revision_sessions SET state = ? WHERE id = ?', [JSON.stringify(session), session.id])
      return session
    })
  }
  async deleteCard(context: RevisionContext, cardId: string): Promise<void> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const deleted = await db.run('DELETE FROM revision_cards WHERE id = ? AND device_id = ?', [cardId, context.deviceId])
      if (!deleted.changes) throw new RevisionError('Carte introuvable.')
      await db.run(`DELETE FROM revision_notes WHERE device_id = ? AND NOT EXISTS
        (SELECT 1 FROM revision_cards WHERE note_id = revision_notes.id)`, [context.deviceId])
      await this.removeFromSessions(context.deviceId, card => card.id === cardId)
    })
  }
  async deleteChapter(context: RevisionContext, chapterId: string): Promise<void> {
    return this.execute(context, async () => {
      const db = this.dependencies.db
      const deleted = await db.run('DELETE FROM revision_chapters WHERE id = ? AND device_id = ?', [chapterId, context.deviceId])
      if (!deleted.changes) throw new RevisionError('Chapitre introuvable.')
      await db.run('DELETE FROM revision_cards WHERE chapter_id = ? AND device_id = ?', [chapterId, context.deviceId])
      await db.run('DELETE FROM revision_notes WHERE chapter_id = ? AND device_id = ?', [chapterId, context.deviceId])
      await this.removeFromSessions(context.deviceId, card => card.chapterId === chapterId)
    })
  }
  private async removeFromSessions(deviceId: string, removed: (card: RevisionCard) => boolean) {
    const db = this.dependencies.db
    for (const row of await db.all('SELECT id, state FROM revision_sessions WHERE device_id = ?', [deviceId])) {
      const session: RevisionSession = JSON.parse(row.state)
      session.cards = [...session.cards.slice(0, session.position), ...session.cards.slice(session.position).filter(card => !removed(card))]
      session.complete = session.complete || session.position >= session.cards.length
      await db.run('UPDATE revision_sessions SET state = ? WHERE id = ?', [JSON.stringify(session), row.id])
    }
  }
}
