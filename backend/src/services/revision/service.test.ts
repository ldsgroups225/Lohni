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

test('les XP récompensent les réponses et une seule fin de session, même après reprise réseau', async () => {
  await setup(2)
  expect(await service.getProgress(context())).toMatchObject({ xp: 0, streak: 0 })
  let session = await respond(await service.getSession(context()), true)
  expect(await service.getProgress(context())).toMatchObject({ xp: 10, streak: 0 })
  session = await respond(session, false)
  expect(await service.getProgress(context())).toMatchObject({ xp: 12, streak: 0 })
  const input = { sessionId: session.id, cardId: session.cards[session.position].id, position: session.position, knew: true, durationMs: 1 }
  await Promise.all([service.answer(context(), input), service.answer(context(), input)])
  expect(await service.getProgress(context())).toMatchObject({ xp: 72, streak: 1 })
  expect((await service.getSession(context())).earnedXP).toBe(72)
  await service.getSession(context(), true)
  expect(await service.getProgress(context())).toMatchObject({ xp: 72, streak: 1 })
  expect(await service.getProgress({ ...context(), deviceId: randomUUID() })).toEqual({ xp: 0, streak: 0, learnedCards: 0, subjects: [] })
})

test('la série suit les jours locaux terminés, sans doubler le même jour, et casse après un jour sauté', async () => {
  await setup(9)
  await finish(await service.getSession(context()))
  expect((await service.getProgress(context())).streak).toBe(1)
  now = new Date('2026-11-10T12:00:00Z')
  expect((await service.getProgress(context())).streak).toBe(1)
  await finish(await service.getSession(context()))
  generated = cards(1)
  await service.generateChapter(context(), { subject: 'Mathématiques', title: 'Encore' })
  await finish(await service.getSession(context(), true))
  expect((await service.getProgress(context())).streak).toBe(2)
  expect((await service.getProgress({ ...context(), localDate: '2026-11-11' })).streak).toBe(2)
  expect((await service.getProgress({ ...context(), localDate: '2026-11-12' })).streak).toBe(0)
  now = new Date('2026-11-12T12:00:00Z')
  await finish(await service.getSession(context()))
  expect((await service.getProgress(context())).streak).toBe(1)
})

test('Cours regroupe les chapitres par matière et reste Fragile tant que moins de la moitié des cartes sont vues', async () => {
  const chapter = await setup(12)
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques', 'Français'] })
  expect(await service.listChapters(context())).toMatchObject([{
    id: chapter.id, title: 'Fractions', subject: 'Mathématiques', summary: 'Les fractions', mastery: null, status: 'Fragile',
  }])
  expect((await service.listChapters(context()))[0].cards).toHaveLength(12)
  await finish(await service.getSession(context()))
  expect((await service.listChapters(context()))[0]).toMatchObject({ mastery: 100, status: 'Fragile' })
  expect((await service.getProgress(context())).subjects).toEqual([
    { subjectId: expect.any(String), name: 'Mathématiques', mastery: 100, status: 'Fragile' },
    { subjectId: expect.any(String), name: 'Français', mastery: null, status: 'Fragile' },
  ])
  expect(await service.listChapters({ ...context(), deviceId: randomUUID() })).toEqual([])
})

test.each([
  [0, 100, 100, 'Solide'], [4, 85, 86, 'Solide'], [5, 83, 85, 'En cours'],
  [62, 60, 61, 'En cours'], [63, 59, 60, 'Fragile'],
])('la maîtrise après %s jours respecte les seuils, avec exactement la moitié des cartes vues', async (days, minimum, maximum, status) => {
  await setup(2)
  await respond(await service.getSession(context()), true)
  now = new Date(now.getTime() + Number(days) * 86400000)
  const chapter = (await service.listChapters(context()))[0]
  expect(chapter.mastery).toBeGreaterThanOrEqual(Number(minimum))
  expect(chapter.mastery).toBeLessThanOrEqual(Number(maximum))
  expect(chapter.status).toBe(status)
  expect((await service.getProgress(context())).subjects[0]).toMatchObject({ mastery: chapter.mastery, status })
})

test('modifier une carte corrige aussi la session chargée et garde son apprentissage', async () => {
  await setup(2)
  let session = await respond(await service.getSession(context()), true)
  const card = session.cards[1]
  await service.updateCard(context(), card.id, { kind: 'basic', question: 'Question corrigée', answer: 'Réponse corrigée' })
  session = await service.getSession(context())
  expect(session.cards[1]).toMatchObject({ question: 'Question corrigée', answer: 'Réponse corrigée' })
  await finish(session)
  const learned = (await service.listChapters(context()))[0].cards[1]
  await service.updateCard(context(), learned.id, { kind: 'basic', question: 'Précision', answer: 'Réponse précise' })
  expect((await service.listChapters(context()))[0].cards[1]).toMatchObject({ question: 'Précision', due: learned.due, reviews: learned.reviews })
  expect((await service.getProgress(context())).xp).toBe(70)
})

test('supprimer un chapitre retire ses cartes de la session et des jours suivants sans effacer les XP', async () => {
  const deleted = await setup(3)
  let session = await respond(await service.getSession(context()), true)
  const other = { ...context(), deviceId: randomUUID() }
  await expect(service.deleteChapter(other, deleted.id)).rejects.toThrow('Chapitre introuvable')
  await service.deleteChapter(context(), deleted.id)
  expect(await service.listChapters(context())).toEqual([])
  session = await service.getSession(context())
  expect(session.complete).toBe(true)
  expect(session.cards.slice(session.position)).toEqual([])
  expect(await service.getProgress(context())).toMatchObject({ xp: 10, streak: 0 })
  expect((await service.getHome(context()))?.state).toBe('empty')
  now = new Date('2026-12-09T12:00:00Z')
  expect((await service.getSession(context())).cards).toEqual([])
  generated = cards(1)
  const remaining = await service.generateChapter(context(), { subject: 'Mathématiques', title: 'À garder' })
  await finish(await service.getSession(context(), true))
  await service.deleteCard(context(), (await service.listChapters(context()))[0].cards[0].id)
  expect(await service.getProgress(context())).toMatchObject({ xp: 70, streak: 1 })
  expect((await service.listChapters(context()))[0]).toMatchObject({ id: remaining.id, mastery: null, status: 'Fragile', cards: [] })
})

test('la modification valide aussi les QCM et ne permet pas de toucher les cartes d’un autre appareil', async () => {
  await setup(1)
  const card = (await service.listChapters(context()))[0].cards[0]
  const corrected = { kind: 'mcq' as const, question: 'Combien font deux et deux ?', answer: 'Quatre', options: ['Un', 'Deux', 'Trois', 'Quatre'], correct: 4 }
  await expect(service.updateCard({ ...context(), deviceId: randomUUID() }, card.id, corrected)).rejects.toThrow('Carte introuvable')
  await expect(service.updateCard(context(), card.id, { ...corrected, options: ['A', 'A', 'B', 'C'] })).rejects.toThrow('Carte invalide')
  await expect(service.updateCard(context(), card.id, { ...corrected, correct: 1.5 })).rejects.toThrow('Carte invalide')
  await expect(service.updateCard(context(), card.id, { kind: 'basic', question: ' ', answer: 'A' })).rejects.toThrow('Carte invalide')
  expect((await service.listChapters(context()))[0].cards[0]).toEqual(card)
  await service.updateCard(context(), card.id, corrected)
  let session = await service.getSession(context())
  expect(session.cards[0]).toMatchObject(corrected)
  session = await respond(session, true, 4)
  expect(session.complete).toBe(true)
  expect((await service.getProgress(context())).xp).toBe(60)
})

test('une réponse hors ligne rejouée après redémarrage ne compte qu’une fois et son identifiant ne peut pas servir à une autre carte', async () => {
  await setup(2)
  const session = await service.getSession(context())
  const input = { answerId: randomUUID(), sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: false, durationMs: 1500 }
  await service.answer(context(), input)
  await db.close()
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  now = new Date('2026-11-10T12:00:00Z')
  const originalDay = { deviceId, localDate: session.localDate }
  const resumed = await service.answer(originalDay, input)
  expect(resumed.position).toBe(1)
  expect(resumed.cards.filter(card => card.id === input.cardId)).toHaveLength(2)
  expect(await service.getProgress(originalDay)).toMatchObject({ xp: 2, streak: 0 })
  await expect(service.answer(originalDay, { ...input, position: 1, cardId: resumed.cards[1].id })).rejects.toThrow('Identifiant de réponse déjà utilisé')
  const final = await service.answer(originalDay, { ...input, answerId: randomUUID(), position: 1, cardId: resumed.cards[1].id, knew: true })
  await service.answer(originalDay, { ...input, answerId: randomUUID(), position: 2, knew: true })
  await service.answer(originalDay, input)
  expect((await service.getSession(originalDay)).complete).toBe(true)
  expect(await service.getProgress(originalDay)).toMatchObject({ xp: 72, streak: 1 })
  expect(final.position).toBe(2)
})

test('les identifiants de réponse invalides sont refusés et les rejouages concurrents restent isolés par appareil', async () => {
  await setup(1)
  const session = await service.getSession(context())
  const input = { answerId: 'invalide', sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: true, durationMs: 1 }
  await expect(service.answer(context(), input)).rejects.toThrow('Identifiant de réponse invalide')
  expect((await service.getSession(context())).position).toBe(0)
  input.answerId = randomUUID()
  await Promise.all([service.answer(context(), input), service.answer(context(), input)])
  expect(await service.getProgress(context())).toMatchObject({ xp: 60, streak: 1 })
  expect((await service.listChapters(context()))[0].cards[0].reviews).toBe(1)
  const other = { ...context(), deviceId: randomUUID() }
  await service.saveProfile(other, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await service.generateChapter(other, { subject: 'Mathématiques', title: 'Fractions' })
  const otherSession = await service.getSession(other)
  await service.answer(other, { ...input, sessionId: otherSession.id, cardId: otherSession.cards[0].id })
  expect(await service.getProgress(other)).toMatchObject({ xp: 60, streak: 1 })
})
