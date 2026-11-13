import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SQLiteDatabase } from '../../utils/database/sqlite'
import { RevisionError, RevisionService, type GeneratedChapter } from './service'

let directory: string
let db: SQLiteDatabase
let service: RevisionService
let now: Date
const context = { deviceId: randomUUID(), localDate: '2026-11-09' }
const generated: GeneratedChapter = {
  summary: 'Les fractions permettent de représenter une partie d’un tout.',
  notes: Array.from({ length: 10 }, (_, index) => ({
    content: `Notion ${index + 1}`,
    cards: [{ kind: 'basic', question: `Question ${index + 1}`, answer: `Réponse ${index + 1}` }],
  })),
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-onboarding-'))
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  now = new Date('2026-11-09T12:00:00Z')
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

test('le premier chapitre fournit dix cartes IA et un accueil prêt à lancer la session', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques', 'Français'], examDate: '2026-11-19' })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Les fractions' })
  const home = await service.getHome(context)
  expect(home).toMatchObject({ daysUntilExam: 10, cardCount: 3, estimatedMinutes: 3, state: 'ready', totalCards: 10 })
  expect((await service.getSession(context)).cards.every(card => card.origin === 'ai')).toBe(true)
})

test('l’accueil distingue aucune carte et journée terminée, même après un « Continuer » vide', async () => {
  expect(await service.getHome(context)).toBeNull()
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  expect(await service.getHome(context)).toMatchObject({ daysUntilExam: null, state: 'empty', cardCount: 0, estimatedMinutes: 0 })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  let session = await service.getSession(context, true)
  while (!session.complete) session = await service.answer(context, {
    sessionId: session.id, cardId: session.cards[session.position].id, position: session.position, knew: true, durationMs: 1000,
  })
  expect(await service.getHome(context)).toMatchObject({ state: 'done', cardCount: 0 })
  expect((await service.getSession(context, true)).cards).toHaveLength(0)
  expect(await service.getHome(context)).toMatchObject({ state: 'done' })
})

test('le premier chapitre respecte la classe et la série du profil sauvegardé', async () => {
  service = new RevisionService({ db, now: () => now, generateCards: async input => ({
    ...generated,
    notes: [{ content: 'Niveau du chapitre', cards: [{ kind: 'basic', question: `Niveau ${input.schoolClass} ${input.series}`, answer: 'Programme adapté' }] }],
  }) })
  await service.saveProfile(context, { schoolClass: 'terminale', series: 'C', subjects: ['Mathématiques'] })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Les suites' })
  expect((await service.getSession(context)).cards[0].question).toBe('Niveau terminale C')
})

test('l’accueil conserve la reprise et utilise le jour local pour le compte à rebours et la session suivante', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-11-10' })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  const session = await service.getSession(context)
  await service.answer(context, { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 1000 })
  const reopened = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  expect(await reopened.getHome(context)).toMatchObject({ state: 'ready', cardCount: 9 })
  expect((await reopened.getSession(context)).position).toBe(1)
  expect(await reopened.getHome({ ...context, deviceId: randomUUID() })).toBeNull()
  now = new Date('2026-11-10T23:30:00Z')
  expect(await reopened.getHome({ ...context, localDate: '2026-11-11' })).toMatchObject({ state: 'ready', daysUntilExam: null, cardCount: 6 })
})

test.each([402, 429, 500, 503, 'invalid JSON'])('un échec IA %s du premier chapitre reste compréhensible et réessayable sans données partielles', async failure => {
  let failing = true
  service = new RevisionService({ db, now: () => now, generateCards: async () => {
    if (failing) throw new Error(`provider: ${failure}`)
    return generated
  } })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await expect(service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })).rejects.toMatchObject({
    constructor: RevisionError,
    message: 'Le service IA est indisponible pour le moment, réessaie plus tard.',
  })
  expect(await service.listChapters(context)).toEqual([])
  failing = false
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  expect((await service.getHome(context))?.totalCards).toBe(10)
})

test('une génération de chapitre incomplète conserve une erreur de validation sans données partielles', async () => {
  service = new RevisionService({ db, now: () => now, generateCards: async () => ({ summary: '', notes: [] }) })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await expect(service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })).rejects.toMatchObject({
    constructor: RevisionError, message: 'Génération invalide. Réessaie avec un autre chapitre.',
  })
  expect(await service.listChapters(context)).toEqual([])
})

test('les examens sont propres à l’appareil et l’accueil choisit le prochain', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-11-20' })
  const first = (await service.listExams(context))[0]
  expect(first).toMatchObject({ title: 'Examen', date: '2026-11-20', subjects: ['Mathématiques'], chapterIds: [] })
  const next = await service.saveExam(context, { title: 'Brevet', date: '2026-11-12', subjects: ['Mathématiques'] })
  await service.saveExam(context, { title: 'Passé', date: '2026-11-01', subjects: ['Mathématiques'] })
  expect(await service.getHome(context)).toMatchObject({ nextExam: { id: next.id, title: 'Brevet', date: '2026-11-12' }, daysUntilExam: 3 })
  expect(await service.listExams({ ...context, deviceId: randomUUID() })).toEqual([])
  await service.deleteExam(context, next.id)
  expect(await service.getHome(context)).toMatchObject({ nextExam: { id: first.id }, daysUntilExam: 11 })
  await expect(service.saveExam(context, { title: '', date: '2026-11-12', subjects: ['Mathématiques'] })).rejects.toBeInstanceOf(RevisionError)
})

test('la migration des anciennes dates est unique et ne recrée pas un examen supprimé', async () => {
  const oldDevice = randomUUID()
  const oldDb = new SQLiteDatabase(join(directory, 'old.sqlite'))
  await oldDb.run('CREATE TABLE revision_profiles (device_id TEXT PRIMARY KEY, school_class TEXT NOT NULL, series TEXT, exam_date TEXT, xp INTEGER NOT NULL DEFAULT 0)')
  await oldDb.run('CREATE TABLE revision_subjects (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(device_id, name))')
  await oldDb.run('INSERT INTO revision_profiles VALUES (?, ?, ?, ?, ?)', [oldDevice, '3e', null, '2026-11-20', 0])
  await oldDb.run('INSERT INTO revision_subjects VALUES (?, ?, ?)', [randomUUID(), oldDevice, 'Français'])
  const legacy = new RevisionService({ db: oldDb, now: () => now, generateCards: async () => generated })
  const oldContext = { ...context, deviceId: oldDevice }
  const exams = await legacy.listExams(oldContext)
  expect(exams).toMatchObject([{ title: 'Examen', date: '2026-11-20', subjects: ['Français'], chapterIds: [] }])
  await legacy.deleteExam(oldContext, exams[0].id)
  const reopened = new RevisionService({ db: oldDb, now: () => now, generateCards: async () => generated })
  expect(await reopened.listExams(oldContext)).toEqual([])
  await oldDb.close()
})

test('les examens valident matières, chapitres, dates et limite', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques', 'Français'] })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  const chapter = (await service.listChapters(context))[0]
  const valid = { title: 'Brevet', date: '2026-12-01', subjects: ['Français'] }
  await expect(service.saveExam(context, { ...valid, date: '2026-02-30' })).rejects.toBeInstanceOf(RevisionError)
  await expect(service.saveExam(context, { ...valid, subjects: ['Inconnue'] })).rejects.toBeInstanceOf(RevisionError)
  await expect(service.saveExam(context, { ...valid, chapterIds: [chapter.id] })).rejects.toBeInstanceOf(RevisionError)
  for (let i = 0; i < 10; i++) await service.saveExam(context, valid)
  await expect(service.saveExam(context, valid)).rejects.toBeInstanceOf(RevisionError)
  const exam = (await service.listExams(context))[0]
  expect(await service.saveExam(context, { ...exam, title: 'Modifié' })).toMatchObject({ id: exam.id, title: 'Modifié' })
})
