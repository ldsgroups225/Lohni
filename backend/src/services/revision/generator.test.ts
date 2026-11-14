import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const model = vi.hoisted(() => ({ call: vi.fn(), invoke: vi.fn() }))
vi.mock('../../utils/llm/llm', () => ({ default: model }))

let directory: string
let RevisionService: typeof import('./service').RevisionService
let SQLiteDatabase: typeof import('../../utils/database/sqlite').SQLiteDatabase
let generateCards: typeof import('./generator').generateCards
const context = () => ({ deviceId: randomUUID(), localDate: '2026-11-13' })
const lesson = (count: number) => JSON.stringify({ topic: 'Fractions', answer: 'Résumé.', flashcards: Array.from({ length: count }, (_, i) => ({ q: `Question ${i}`, a: `Réponse ${i}` })) })
const quiz = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: i + 1, question: `Question ${i}`, options: ['Un', 'Deux', 'Trois', 'Quatre'], correct: 1, hint: 'Indice', explanation: 'Explication.' })))

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-generator-'))
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory)
  ;({ RevisionService } = await import('./service.js'))
  ;({ SQLiteDatabase } = await import('../../utils/database/sqlite.js'))
  ;({ generateCards } = await import('./generator.js'))
  cwd.mockRestore()
})
afterAll(async () => { await rm(directory, { recursive: true, force: true }) })
beforeEach(() => { model.call.mockReset(); model.invoke.mockReset() })

test('une réponse incomplète ne bloque pas la tentative suivante du même chapitre', async () => {
  const db = new SQLiteDatabase(join(directory, 'fresh.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValueOnce({ content: lesson(4) }).mockResolvedValueOnce({ content: lesson(5) })
  model.invoke.mockResolvedValue({ content: quiz })
  const input = { subject: 'Mathématiques', title: 'Fractions fraîches' }
  await expect(service.generateChapter(ctx, input)).rejects.toThrow('5 cartes attendues')
  expect(await service.listChapters(ctx)).toEqual([])
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  expect((await service.getHome(ctx))?.totalCards).toBe(10)
  await db.close()
})


test('un ancien cache incomplet est ignoré et un cache valide reste réutilisable', async () => {
  const db = new SQLiteDatabase(join(directory, 'legacy.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  const input = { subject: 'Mathématiques', title: 'Ancien cache' }
  const cacheDir = join(directory, 'storage/cache/ask')
  const before = await readdir(cacheDir)
  model.call.mockResolvedValueOnce({ content: lesson(5) })
  model.invoke.mockResolvedValue({ content: quiz })
  await service.generateChapter(ctx, input)
  const [file] = (await readdir(cacheDir)).filter(name => !before.includes(name))
  expect(file).toBeDefined()
  model.call.mockRejectedValueOnce(new Error('Le modèle ne doit pas être appelé pour un cache valide'))
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  model.call.mockReset()
  await writeFile(join(cacheDir, file), lesson(4))
  model.call.mockResolvedValueOnce({ content: lesson(5) })
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  await writeFile(join(cacheDir, file), '{invalid JSON')
  const other = context()
  await service.saveProfile(other, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValueOnce({ content: lesson(5) })
  await expect(service.generateChapter(other, input)).resolves.toMatchObject({ title: input.title })
  await db.close()
})

test.each([
  { topic: 'Fractions', answer: ' ', flashcards: Array.from({ length: 5 }, () => ({ q: 'Question', a: 'Réponse' })) },
  { topic: 'Fractions', answer: 'Résumé', flashcards: Array.from({ length: 5 }, () => ({ q: ' ', a: 'Réponse' })) },
  { topic: 'Fractions', answer: 'Résumé', flashcards: Array.from({ length: 5 }, () => ({ q: 'Question', a: null })) },
])('un résumé ou une carte invalide ne pollue pas le cache', async invalid => {
  const db = new SQLiteDatabase(join(directory, `${randomUUID()}.sqlite`))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  const input = { subject: 'Mathématiques', title: randomUUID() }
  model.call.mockResolvedValueOnce({ content: JSON.stringify(invalid) }).mockResolvedValueOnce({ content: lesson(5) })
  model.invoke.mockResolvedValue({ content: quiz })
  await expect(service.generateChapter(ctx, input)).rejects.toThrow('Génération invalide')
  expect(await service.listChapters(ctx)).toEqual([])
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  await db.close()
})

test('un QCM tronqué est repris et le chapitre complet est créé', async () => {
  const db = new SQLiteDatabase(join(directory, 'quiz-retry.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValue({ content: lesson(5) })
  model.invoke.mockResolvedValueOnce({ content: '[{"id":1' }).mockResolvedValueOnce({ content: quiz })
  await expect(service.generateChapter(ctx, { subject: 'Mathématiques', title: 'QCM repris' })).resolves.toMatchObject({ title: 'QCM repris' })
  expect((await service.getHome(ctx))?.totalCards).toBe(10)
  await db.close()
})

test('un QCM illisible après reprise reste réessayable sans chapitre partiel', async () => {
  const db = new SQLiteDatabase(join(directory, 'quiz-invalid.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValue({ content: lesson(5) })
  model.invoke.mockResolvedValueOnce({ content: '[{"id":1' }).mockResolvedValueOnce({ content: '[{"id":1' }).mockResolvedValueOnce({ content: quiz })
  const input = { subject: 'Mathématiques', title: 'QCM invalide' }
  await expect(service.generateChapter(ctx, input)).rejects.toThrow('L’IA n’a pas préparé les QCM attendus. Réessaie ce chapitre.')
  expect(await service.listChapters(ctx)).toEqual([])
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  await db.close()
})

test('une panne du fournisseur conserve son message distinct et reste réessayable', async () => {
  const db = new SQLiteDatabase(join(directory, 'provider.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValue({ content: lesson(5) })
  model.invoke.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValueOnce({ content: quiz })
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
  const input = { subject: 'Mathématiques', title: 'Panne fournisseur' }
  await expect(service.generateChapter(ctx, input)).rejects.toThrow('Le service IA est indisponible pour le moment, réessaie plus tard.')
  expect(await service.listChapters(ctx)).toEqual([])
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  logging.mockRestore()
  await db.close()
})

test.each([
  ['option vide', { options: ['Un', 'Deux', ' ', 'Quatre'] }],
  ['options identiques', { options: ['Un', 'Deux', 'Un', 'Quatre'] }],
  ['option vide après normalisation', { options: ['Un', 'Deux', '3) ', 'Quatre'] }],
  ['options identiques après normalisation', { options: ['Un', 'Deux', '3) Un', 'Quatre'] }],
  ['index fractionnaire', { correct: 1.5 }],
  ['question vide', { question: ' ' }],
  ['explication vide', { explanation: ' ' }],
])('un QCM avec %s est repris puis reste réessayable après épuisement', async (_label, change) => {
  const db = new SQLiteDatabase(join(directory, `${randomUUID()}.sqlite`))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  const input = { subject: 'Mathématiques', title: randomUUID() }
  const invalid = JSON.stringify(JSON.parse(quiz).map((item: object) => ({ ...item, ...change })))
  model.call.mockResolvedValue({ content: lesson(5) })
  model.invoke.mockResolvedValueOnce({ content: invalid }).mockResolvedValueOnce({ content: invalid }).mockResolvedValueOnce({ content: invalid }).mockResolvedValueOnce({ content: quiz })
  await expect(service.generateChapter(ctx, input)).rejects.toThrow('L’IA n’a pas préparé les QCM attendus. Réessaie ce chapitre.')
  expect(model.invoke).toHaveBeenCalledTimes(2)
  expect(await service.listChapters(ctx)).toEqual([])
  await expect(service.generateChapter(ctx, input)).resolves.toMatchObject({ title: input.title })
  expect(model.invoke).toHaveBeenCalledTimes(4)
  expect((await service.getHome(ctx))?.totalCards).toBe(10)
  await db.close()
})

test('la génération du chapitre désactive le raisonnement pour le cours et le QCM', async () => {
  const db = new SQLiteDatabase(join(directory, 'reasoning.sqlite'))
  const service = new RevisionService({ db, now: () => new Date('2026-11-13T12:00:00Z'), generateCards })
  const ctx = context()
  await service.saveProfile(ctx, { schoolClass: 'terminale', series: 'D', subjects: ['Mathématiques'] })
  model.call.mockResolvedValue({ content: lesson(5) })
  model.invoke.mockResolvedValue({ content: quiz })
  await service.generateChapter(ctx, { subject: 'Mathématiques', title: 'Raisonnement' })
  expect(model.call).toHaveBeenCalledWith(expect.any(Array), { reasoning: 'none' })
  expect(model.invoke).toHaveBeenCalledWith(expect.any(Array), { reasoning: 'none' })
  await db.close()
})
