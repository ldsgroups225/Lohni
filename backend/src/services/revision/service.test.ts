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
let generated: GeneratedChapter
const deviceId = randomUUID()
const context = () => ({ deviceId, localDate: now.toISOString().slice(0, 10) })
const cards = (count: number): GeneratedChapter => ({
  summary: 'Les fractions',
  notes: Array.from({ length: count }, (_, i) => ({ content: `Notion ${i}`, cards: [{
    kind: 'basic' as const, question: `Question ${i}`, answer: `Réponse ${i}`,
  }] })),
})
async function setup(count = 5, examDate?: string) {
  generated = cards(count)
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'], examDate })
  return service.generateChapter(context(), { subject: 'Mathématiques', title: 'Fractions' })
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-revision-'))
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  now = new Date('2026-11-09T12:00:00Z')
  generated = cards(5)
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

test('un chapitre généré devient une session persistée, isolée par appareil', async () => {
  await setup()
  const session = await service.getSession(context())
  expect(session.cards.map(c => c.question)).toEqual(['Question 0', 'Question 1', 'Question 2', 'Question 3', 'Question 4'])
  const reopened = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  expect(await reopened.getSession(context())).toEqual(session)
  const other = { ...context(), deviceId: randomUUID() }
  expect(await service.getProfile(other)).toBeNull()
  await service.saveProfile(other, { schoolClass: '6e', subjects: ['Français'] })
  expect((await service.getSession(other)).cards).toEqual([])
  expect((await service.getSession(context())).cards).toHaveLength(5)
})

test.each([
  [undefined, 5], ['2026-11-08', 5], ['2026-11-09', 5],
  ['2026-11-10', 10], ['2026-11-19', 4], ['2027-01-01', 3],
])('dose les nouvelles cartes avec une date %s : %s cartes', async (examDate, expected) => {
  await setup(32, examDate)
  expect((await service.getSession(context())).cards).toHaveLength(expected)
})

async function respond(session: Awaited<ReturnType<RevisionService['getSession']>>, knew: boolean, choice?: number) {
  return service.answer(context(), { sessionId: session.id, cardId: session.cards[session.position].id, position: session.position, knew, choice, durationMs: 1500 })
}

test('une carte ratée revient une seule fois, la reprise ne rejoue pas les réponses', async () => {
  await setup(2)
  let session = await service.getSession(context())
  const missedId = session.cards[0].id
  session = await respond(session, false)
  expect(session.cards.map(c => c.id)).toEqual([missedId, session.cards[1].id, missedId])
  expect((await service.getSession(context())).position).toBe(1)
  session = await respond(session, true)
  session = await respond(session, false)
  expect(session.complete).toBe(true)
  expect(session.cards).toHaveLength(3)
})

test('FSRS programme une carte sue plus tard que la carte ratée et une réponse réseau réessayée reste unique', async () => {
  await setup(2)
  let session = await service.getSession(context())
  const input = { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 1000 }
  const results = await Promise.all([service.answer(context(), input), service.answer(context(), input)])
  expect(results[0]).toEqual(results[1])
  session = await respond(results[0], false)
  expect(Date.parse(session.cards[0].due)).toBeGreaterThan(Date.parse(session.cards[1].due))
  expect(session.cards[0].reviews).toBe(1)
})

async function finish(session: Awaited<ReturnType<RevisionService['getSession']>>) {
  while (!session.complete) session = await respond(session, true, session.cards[session.position].kind === 'mcq' ? 1 : undefined)
  return session
}

test('une erreur de QCM est traitée comme un oubli même si le client dit « Je savais »', async () => {
  await setup(1)
  generated = { summary: 'QCM', notes: [{ content: 'QCM', cards: [{ kind: 'mcq', question: 'Quelle fraction ?', answer: 'Un demi', options: ['Un demi', 'Un tiers', 'Un quart', 'Un cinquième'], correct: 1 }] }] }
  await service.generateChapter(context(), { subject: 'Mathématiques', title: 'QCM' })
  let session = await service.getSession(context())
  session = await respond(session, true)
  session = await respond(session, true, 2)
  expect(session.cards[session.cards.length - 1]?.id).toBe(session.cards[1].id)
  expect(session.complete).toBe(false)
})

test('les dues précèdent les nouvelles puis les QCM ; continuer ne dépasse pas le dosage du jour', async () => {
  await setup(8)
  await finish(await service.getSession(context()))
  expect((await service.getSession(context(), true)).cards).toHaveLength(0)
  now = new Date('2026-11-10T12:00:00Z')
  generated = { summary: 'QCM', notes: [{ content: 'QCM', cards: [{ kind: 'mcq', question: 'Question QCM', answer: 'A', options: ['A', 'B', 'C', 'D'], correct: 1 }] }] }
  await service.generateChapter(context(), { subject: 'Mathématiques', title: 'QCM' })
  const session = await service.getSession(context())
  expect(session.cards.map(c => c.kind)).toEqual(['basic', 'basic', 'basic', 'basic', 'basic', 'basic', 'basic', 'basic', 'mcq'])
  expect(session.cards.slice(0, 5).every(c => c.reviews > 0)).toBe(true)
  expect(session.cards.slice(5).every(c => c.reviews === 0)).toBe(true)
})

test('après un long retard, la session reste plafonnée et continuer propose le reste', async () => {
  await setup(30, '2026-11-10')
  await finish(await service.getSession(context()))
  now = new Date('2026-11-10T12:00:00Z')
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-11-11' })
  await finish(await service.getSession(context()))
  now = new Date('2026-11-11T12:00:00Z')
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-11-12' })
  await finish(await service.getSession(context()))
  await finish(await service.getSession(context(), true))
  now = new Date('2026-12-11T12:00:00Z')
  let session = await service.getSession(context())
  expect(session.cards).toHaveLength(20)
  expect(session.cards.every(c => c.reviews > 0)).toBe(true)
  await finish(session)
  expect((await service.getSession(context(), true)).cards).toHaveLength(10)
})

test('les cartes les plus fragiles passent en premier après plusieurs jours sans révision', async () => {
  await setup(3)
  let session = await service.getSession(context())
  const fragile = session.cards[2].id
  session = await respond(session, true)
  session = await respond(session, true)
  session = await respond(session, false)
  await respond(session, true)
  now = new Date('2026-12-09T12:00:00Z')
  expect((await service.getSession(context())).cards[0].id).toBe(fragile)
})

test('la suppression retire une carte de la session et de toutes les révisions futures, sans toucher un autre appareil', async () => {
  await setup(3)
  let session = await service.getSession(context())
  const deleted = session.cards[0].id
  await expect(service.deleteCard({ ...context(), deviceId: randomUUID() }, deleted)).rejects.toThrow('Carte introuvable')
  await service.deleteCard(context(), deleted)
  session = await service.getSession(context())
  expect(session.cards.some(c => c.id === deleted)).toBe(false)
  await finish(session)
  now = new Date('2026-12-09T12:00:00Z')
  expect((await service.getSession(context())).cards.some(c => c.id === deleted)).toBe(false)
})

test('un générateur invalide échoue clairement sans laisser de chapitre ou de cartes partiels', async () => {
  await setup(1)
  generated = { summary: 'Invalide', notes: [{ content: 'Valide', cards: [{ kind: 'basic', question: 'Valide', answer: 'Valide' }] }, { content: 'Invalide', cards: [{ kind: 'mcq', question: 'Sans bonne réponse', answer: '', options: ['A'], correct: 5 }] }] }
  await expect(service.generateChapter(context(), { subject: 'Mathématiques', title: 'Invalide' })).rejects.toThrow('Génération invalide')
  expect((await service.getSession(context())).cards).toHaveLength(1)
})

test('les entrées invalides ne créent pas de profil et un autre appareil ne peut pas répondre à une session', async () => {
  await expect(service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-02-30' })).rejects.toThrow('Date')
  expect(await service.getProfile(context())).toBeNull()
  await setup(1)
  const session = await service.getSession(context())
  await expect(service.answer({ ...context(), deviceId: randomUUID() }, { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 1 })).rejects.toThrow('Session introuvable')
  expect((await service.getSession(context())).position).toBe(0)
})

test('les oublis ne font pas grossir une session de retard au-delà d’une vingtaine de réponses', async () => {
  await setup(30, '2026-11-10')
  await finish(await service.getSession(context()))
  now = new Date('2026-11-10T12:00:00Z')
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2026-11-11' })
  await finish(await service.getSession(context()))
  now = new Date('2026-12-10T12:00:00Z')
  let session = await service.getSession(context())
  while (!session.complete) session = await respond(session, false)
  expect(session.position).toBeLessThanOrEqual(21)
  const occurrences = session.cards.map(c => c.id)
  for (const id of new Set(occurrences)) expect(occurrences.filter(cardId => cardId === id)).toHaveLength(2)
})

test('une session s’arrête après quinze minutes de réponses et reprend après un redémarrage du service', async () => {
  await setup(2)
  let session = await service.getSession(context())
  session = await service.answer(context(), { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 15 * 60000 })
  expect(session.complete).toBe(true)
  await db.close()
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  expect(await service.getSession(context())).toEqual(session)
})

test('un élève peut déclarer un oubli même après avoir choisi la bonne option au QCM', async () => {
  await setup(1)
  generated = { summary: 'QCM', notes: [{ content: 'QCM', cards: [{ kind: 'mcq', question: 'Une question', answer: 'A', options: ['A', 'B', 'C', 'D'], correct: 1 }] }] }
  await service.generateChapter(context(), { subject: 'Mathématiques', title: 'QCM' })
  let session = await respond(await service.getSession(context()), true)
  session = await respond(session, false, 1)
  expect(session.complete).toBe(false)
  expect(session.cards).toHaveLength(3)
})
