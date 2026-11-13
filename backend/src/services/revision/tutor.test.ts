import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SQLiteDatabase } from '../../utils/database/sqlite'
import { RevisionService, type GeneratedChapter } from './service'

let directory: string
let db: SQLiteDatabase
let service: RevisionService
const context = { deviceId: randomUUID(), localDate: '2026-11-09' }
const now = () => new Date('2026-11-09T12:00:00Z')
const generated: GeneratedChapter = { summary: 'Les fractions', notes: [{ content: 'Une moitié', cards: [
  { kind: 'basic', question: 'Une moitié ?', answer: '1/2' },
] }] }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-tutor-'))
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  service = new RevisionService({ db, now, generateCards: async () => generated })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

test('une carte du Tuteur crée une note persistée et rejoint les révisions sans génération ni import', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  const saved = await service.saveTutorNote(context, {
    subject: 'Mathématiques', title: 'Les fractions', question: 'Un quart ?', answer: '1/4',
  })
  const reopened = new RevisionService({ db, now, generateCards: async () => { throw new Error('Pas de génération') } })
  expect((await reopened.listChapters(context))[0]).toMatchObject({ title: 'Les fractions', subject: 'Mathématiques', cards: [
    { id: saved.id, kind: 'basic', question: 'Un quart ?', answer: '1/4' },
  ] })
  expect((await reopened.getSession(context)).cards).toMatchObject([{ id: saved.id, question: 'Un quart ?' }])
  expect(await reopened.getImportQuota(context)).toMatchObject({ remaining: 3 })
})

test('modifier son profil remplace ses choix sans effacer les cours ni la progression', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques', 'Français'], examDate: '2027-06-01' })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  await service.generateChapter(context, { subject: 'Français', title: 'Grammaire' })
  const session = await service.getSession(context)
  await service.answer(context, { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 1000 })
  expect(await service.saveProfile(context, { schoolClass: 'terminale', series: 'A1', subjects: ['Français'] }))
    .toEqual({ schoolClass: 'terminale', series: 'A1', subjects: ['Français'], examDate: '2027-06-01' })
  expect(await service.listChapters(context)).toHaveLength(2)
  expect(await service.getProgress(context)).toMatchObject({ xp: 10, subjects: [{ name: 'Français' }] })
  const remaining = await service.getSession(context)
  expect(remaining.cards.slice(remaining.position)).toHaveLength(1)
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  expect(await service.getProfile(context)).toMatchObject({ series: undefined, subjects: ['Mathématiques'] })
  expect((await service.getSession({ ...context, localDate: '2026-11-10' })).cards.every(card => card.chapterId === (session.cards[0].chapterId))).toBe(true)
})

test('Moi compte chaque carte apprise une seule fois à partir des réponses, même après suppression', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  expect(await service.getProgress(context)).toMatchObject({ learnedCards: 0 })
  let session = await service.getSession(context)
  const cardId = session.cards[0].id
  session = await service.answer(context, { sessionId: session.id, cardId, position: 0, knew: false, durationMs: 1000 })
  expect(await service.getProgress(context)).toMatchObject({ learnedCards: 0 })
  await service.answer(context, { sessionId: session.id, cardId, position: 1, knew: true, durationMs: 1000 })
  const tomorrow = { ...context, localDate: '2026-11-10' }
  const next = await service.getSession(tomorrow)
  await service.answer(tomorrow, { sessionId: next.id, cardId, position: 0, knew: true, durationMs: 1000 })
  await service.deleteCard(context, cardId)
  expect(await service.getProgress(context)).toMatchObject({ learnedCards: 1, xp: 122 })
})

test('les matières décochées restent consultables mais ne remplissent plus l’accueil ni la session', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Français'] })
  expect(await service.getHome(context)).toMatchObject({ state: 'empty', totalCards: 0, cardCount: 0 })
  expect(await service.listChapters(context)).toHaveLength(1)
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  expect((await service.getSession(context, true)).cards).toHaveLength(1)
})

test('le Tuteur range les notes dans le chapitre existant et refuse les matières non choisies', async () => {
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  const chapter = await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  const note = { subject: 'Mathématiques', title: ' Fractions ', question: ' Un quart ? ', answer: ' 1/4 ' }
  await service.saveTutorNote(context, note)
  const chapters = await service.listChapters(context)
  expect(chapters).toHaveLength(1)
  expect(chapters[0]).toMatchObject({ id: chapter.id, cards: [{ question: 'Une moitié ?' }, { question: 'Un quart ?', answer: '1/4' }] })
  const other = { ...context, deviceId: randomUUID() }
  await service.saveProfile(other, { schoolClass: '3e', subjects: ['Français'] })
  for (const input of [null, { ...note, subject: 'Français' }, { ...note, question: ' ' }, { ...note, answer: '' }, { ...note, title: 'x'.repeat(201) }]) {
    await expect(service.saveTutorNote(context, input as typeof note)).rejects.toThrow()
  }
  await expect(service.saveTutorNote(other, note)).rejects.toThrow()
  expect(await service.listChapters(other)).toEqual([])
  expect((await service.listChapters(context))[0].cards).toHaveLength(2)
})
