import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SQLiteDatabase } from '../../utils/database/sqlite'
import { RevisionService } from './service'

let directory: string
let db: SQLiteDatabase
let service: RevisionService
const context = { deviceId: randomUUID(), localDate: '2026-11-09' }
const block = { day: 1, start: '08:00', end: '14:00', subject: 'Sport' }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'timetable-'))
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  service = new RevisionService({ db, now: () => new Date('2026-11-09T12:00:00Z'), generateCards: async () => ({ summary: 'Cours', notes: [] }), readTimetable: async () => [block] })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })
test('valide et remplace les blocs sans chevauchement', async () => {
  await service.saveTimetable(context, [block])
  await expect(service.saveTimetable(context, [{ ...block, start: '25:00' }])).rejects.toThrow()
  await expect(service.saveTimetable(context, [block, { ...block, start: '13:00', end: '15:00' }])).rejects.toThrow()
  expect(await service.getTimetable(context)).toEqual([block])
})
test('une photo produit un brouillon et compte un import', async () => {
  const path = join(directory, 'photo.jpg'); await writeFile(path, 'photo')
  const file = { path, filename: 'photo.jpg', mimeType: 'image/jpeg' }
  expect(await service.readTimetablePhotos(context, [file])).toEqual({ blocks: [block], unknownSubjects: ['Sport'] })
  expect(await service.getTimetable(context)).toEqual([])
  expect((await service.getImportQuota(context)).remaining).toBe(2)
  await expect(service.readTimetablePhotos(context, [file, file, file, file])).rejects.toThrow()
})
test('jour chargé et matière du lendemain orientent le plan et la séance', async () => {
  service = new RevisionService({ db, now: () => new Date('2026-11-09T12:00:00Z'), generateCards: async ({ subject }) => ({ summary: 'Cours', notes: [{ content: 'Cours', cards: [{ kind: 'basic', question: subject, answer: 'Réponse' }] }] }) })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques', 'Histoire'] })
  const math = await service.generateChapter(context, { subject: 'Mathématiques', title: 'Fractions' })
  const history = await service.generateChapter(context, { subject: 'Histoire', title: 'Histoire' })
  await service.saveExam(context, { title: 'Examen', date: '2026-11-12', subjects: ['Mathématiques', 'Histoire'] })
  await service.saveTimetable(context, [block, { day: 2, start: '08:00', end: '09:00', subject: 'Histoire' }])
  const day = (await service.getPlan(context)).days[0]
  expect(day.capacityCards).toBe(10)
  expect(day.items.map(item => item.subject)).toEqual(['Histoire', 'Mathématiques'])
  expect((await service.getSession(context)).cards.map(card => card.chapterId)).toEqual([history.id, math.id])
})
test('un lecteur en échec renvoie une erreur française et libère le quota', async () => {
  const path = join(directory, 'photo.png'); await writeFile(path, 'photo')
  service = new RevisionService({ db, now: () => new Date('2026-11-09T12:00:00Z'), generateCards: async () => ({ summary: 'Cours', notes: [] }), readTimetable: async () => { throw new Error('failure') } })
  await expect(service.readTimetablePhotos(context, [{ path, filename: 'photo.png', mimeType: 'image/png' }])).rejects.toThrow('Impossible de lire cet emploi du temps')
  expect((await service.getImportQuota(context)).remaining).toBe(3)
})
test('un simple cours reste hors de la séance même si une ancienne matière porte son nom', async () => {
  service = new RevisionService({ db, now: () => new Date('2026-11-09T12:00:00Z'), generateCards: async () => ({ summary: 'Cours', notes: [{ content: 'Cours', cards: [{ kind: 'basic', question: 'Question', answer: 'Réponse' }] }] }) })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques', 'Sport'] })
  await service.generateChapter(context, { subject: 'Sport', title: 'Sport' })
  await service.saveProfile(context, { schoolClass: '3e', subjects: ['Mathématiques'] })
  await service.saveTimetable(context, [{ ...block, day: 2 }])
  expect((await service.getSession(context)).cards).toEqual([])
})
