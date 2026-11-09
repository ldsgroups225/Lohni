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
  expect(await reopened.getHome({ ...context, localDate: '2026-11-11' })).toMatchObject({ state: 'ready', daysUntilExam: 0, cardCount: 6 })
})
