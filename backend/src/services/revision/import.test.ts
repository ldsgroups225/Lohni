import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile, truncate } from 'node:fs/promises'
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
const input = { title: 'Fractions', subject: 'Mathématiques', text: 'Une fraction représente une part d’un tout.' }
const chapter = (): GeneratedChapter => ({ summary: 'Une fraction représente une part d’un tout.', notes: [{
  content: 'La moitié est 1/2.', cards: [
    { kind: 'basic', question: 'Comment écrire la moitié ?', answer: '1/2' },
    { kind: 'mcq', question: 'Quelle fraction vaut la moitié ?', answer: '1/2 représente la moitié.', options: ['1/2', '1/3', '1/4', '1/5'], correct: 1 },
  ],
}] })
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-import-'))
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  now = new Date('2026-11-09T12:00:00Z')
  generated = chapter()
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  await service.saveProfile(context(), { schoolClass: '3e', subjects: ['Mathématiques'] })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

test('un cours importé devient un chapitre complet et ses cartes rejoignent la session sans validation', async () => {
  const imported = await service.importChapter(context(), input)
  expect(imported).toMatchObject({ title: 'Fractions', summary: 'Une fraction représente une part d’un tout.', origin: 'import' })
  const session = await service.getSession(context())
  expect(session.cards.map(card => [card.chapterId, card.kind, card.origin])).toEqual([
    [imported.id, 'basic', 'import'], [imported.id, 'mcq', 'import'],
  ])
})

test.each(['jpg', 'jpeg', 'png', 'webp'])('une photo %s transcrite rejoint la chaîne texte et crée un chapitre complet sans validation', async extension => {
  const path = join(directory, `cahier.${extension}`)
  await writeFile(path, Buffer.from('/9j/2Q==', 'base64'))
  service = new RevisionService({ db, now: () => now,
    transcribePhoto: async () => input.text,
    generateCards: async ({ text }) => {
      if (text === undefined) throw new Error('Texte transcrit absent')
      return { ...generated, summary: text }
    },
  })
  const imported = await service.importChapter(context(), { title: input.title, subject: input.subject,
    file: { path, filename: `cahier.${extension}`, mimeType: 'application/octet-stream' },
  })
  expect(imported).toMatchObject({ summary: input.text, origin: 'import' })
  expect((await service.getSession(context())).cards.map(card => [card.kind, card.chapterId])).toEqual([
    ['basic', imported.id], ['mcq', imported.id],
  ])
  expect((await service.getImportQuota(context())).remaining).toBe(2)
})

test('une transcription vide explique comment reprendre la photo sans consommer un import', async () => {
  const path = join(directory, 'cahier.png')
  await writeFile(path, 'photo')
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated, transcribePhoto: async () => '  ' })
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject,
    file: { path, filename: 'cahier.png', mimeType: 'image/png' },
  })).rejects.toThrow('Prends une photo nette')
  expect((await service.getImportQuota(context())).remaining).toBe(3)
  expect((await service.getSession(context())).cards).toEqual([])
})

test('un échec du modèle vision reste réessayable sans créer de cartes ni consommer le quota', async () => {
  const path = join(directory, 'cahier.jpg')
  await writeFile(path, 'photo')
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated,
    transcribePhoto: async () => { throw new Error('vision unavailable') },
  })
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject,
    file: { path, filename: 'cahier.jpg', mimeType: 'image/jpeg' },
  })).rejects.toThrow('lecture des photos est indisponible')
  expect((await service.getSession(context())).cards).toEqual([])
  expect((await service.getImportQuota(context())).remaining).toBe(3)
})

test('une photo réserve la dernière place avant la transcription et partage la limite avec le texte', async () => {
  await service.importChapter(context(), input)
  await service.importChapter(context(), input)
  const path = join(directory, 'cahier.jpg')
  await writeFile(path, 'photo')
  const photo = { title: input.title, subject: input.subject, file: { path, filename: 'cahier.jpg', mimeType: 'image/jpeg' } }
  let release!: () => void
  let started!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const transcribing = new Promise<void>(resolve => { started = resolve })
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated,
    transcribePhoto: async () => { started(); await waiting; return input.text },
  })
  const pending = service.importChapter(context(), photo)
  await transcribing
  try {
    expect((await service.getImportQuota(context())).remaining).toBe(0)
    expect((await service.getSession(context())).cards).toHaveLength(4)
    await expect(service.importChapter(context(), photo)).rejects.toThrow('3 imports')
    await expect(service.importChapter(context(), input)).rejects.toThrow('3 imports')
  } finally { release(); await pending }
})

test('une photo suit la même validation transactionnelle du chapitre que le texte', async () => {
  const path = join(directory, 'cahier.jpg')
  await writeFile(path, 'photo')
  generated.notes[0].cards.pop()
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated, transcribePhoto: async () => input.text })
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject,
    file: { path, filename: 'cahier.jpg', mimeType: 'image/jpeg' },
  })).rejects.toThrow('Génération invalide')
  expect((await service.getSession(context())).cards).toEqual([])
  expect((await service.getImportQuota(context())).remaining).toBe(3)
})

test('la limite persiste après redémarrage, résiste à une fausse date locale et se recharge le lendemain côté serveur', async () => {
  await service.importChapter(context(), input)
  await service.importChapter(context(), input)
  await service.importChapter(context(), input)
  await db.close()
  db = new SQLiteDatabase(join(directory, 'test.sqlite'))
  service = new RevisionService({ db, now: () => now, generateCards: async () => generated })
  expect(await service.getImportQuota(context())).toEqual({ remaining: 0, resetsAt: '2026-11-10T00:00:00.000Z' })
  await expect(service.importChapter({ ...context(), localDate: '2026-11-10' }, input)).rejects.toThrow('3 imports')
  const other = { ...context(), deviceId: randomUUID() }
  await service.saveProfile(other, { schoolClass: '6e', subjects: ['Mathématiques'] })
  await expect(service.importChapter(other, input)).resolves.toMatchObject({ origin: 'import' })
  now = new Date('2026-11-10T00:00:00Z')
  expect((await service.getImportQuota(context())).remaining).toBe(3)
  await expect(service.importChapter(context(), input)).resolves.toMatchObject({ origin: 'import' })
})

test('une sortie IA incomplète ne crée aucune carte et ne consomme pas un import', async () => {
  generated.notes[0].cards.pop()
  await expect(service.importChapter(context(), input)).rejects.toThrow('Génération invalide')
  expect((await service.getSession(context())).cards).toEqual([])
  expect((await service.getImportQuota(context())).remaining).toBe(3)
  generated = chapter()
  await service.importChapter(context(), input)
  expect((await service.getSession(context(), true)).cards).toHaveLength(2)
})

test.each(['txt', 'md', 'pdf', 'docx'])('importe un fichier %s via le parseur et utilise son contenu pour la génération', async extension => {
  const source = 'Une fraction represente une part du tout.'
  let contents: string | Uint8Array = source
  if (extension === 'md') contents = `# Les fractions\n\n${source}`
  if (extension === 'pdf') {
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    pdf.addPage().drawText(source)
    contents = await pdf.save({ useObjectStreams: false })
  }
  if (extension === 'docx') {
    const { default: PizZip } = await import('pizzip')
    const zip = new PizZip()
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${source}</w:t></w:r></w:p></w:body></w:document>`)
    contents = zip.generate({ type: 'uint8array' })
  }
  const path = join(directory, `cours.${extension}`)
  await writeFile(path, contents)
  service = new RevisionService({ db, now: () => now, generateCards: async ({ text }) => {
    expect(text).toContain(source)
    return generated
  } })
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject, file: { path, filename: `cours.${extension}`, mimeType: 'application/octet-stream' } })).resolves.toMatchObject({ origin: 'import' })
})

test('la suppression d’un chapitre retire toutes ses cartes, même répétées, sans supprimer un autre chapitre ni recharger le quota', async () => {
  const imported = await service.importChapter(context(), input)
  const kept = await service.importChapter(context(), { ...input, title: 'Décimaux' })
  let session = await service.getSession(context())
  session = await service.answer(context(), { sessionId: session.id, cardId: session.cards[0].id, position: 0, knew: false, durationMs: 1000 })
  await expect(service.deleteChapter({ ...context(), deviceId: randomUUID() }, imported.id)).rejects.toThrow('Chapitre introuvable')
  await service.deleteChapter(context(), imported.id)
  session = await service.getSession(context())
  expect(session.cards.slice(session.position).every(card => card.chapterId === kept.id)).toBe(true)
  now = new Date('2026-12-09T12:00:00Z')
  expect((await service.getSession(context())).cards.map(card => card.chapterId)).toEqual([kept.id, kept.id])
  now = new Date('2026-11-09T13:00:00Z')
  expect((await service.getImportQuota(context())).remaining).toBe(1)
  await expect(service.deleteChapter(context(), imported.id)).rejects.toThrow('Chapitre introuvable')
})

test('un import en cours réserve la dernière place sans bloquer les sessions et empêche un quatrième appel IA', async () => {
  await service.importChapter(context(), input)
  await service.importChapter(context(), input)
  let release!: () => void
  let started!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const generating = new Promise<void>(resolve => { started = resolve })
  service = new RevisionService({ db, now: () => now, generateCards: async () => { started(); await waiting; return generated } })
  const pending = service.importChapter(context(), input)
  await generating
  try {
    expect((await service.getImportQuota(context())).remaining).toBe(0)
    expect((await service.getSession(context())).cards).toHaveLength(4)
    await expect(service.importChapter(context(), input)).rejects.toThrow('3 imports')
  } finally { release(); await pending }
})

test.each([
  { summary: '', notes: chapter().notes },
  { summary: 'Résumé', notes: [] },
  { summary: 'Résumé', notes: [{ content: 'Note', cards: [{ kind: 'basic', question: 'Question', answer: '' }] }] },
  { summary: 'Résumé', notes: [{ content: 'Note', cards: [{ kind: 'mcq', question: 'Question', answer: 'A', options: ['A', 'B', 'C', 'D'], correct: 5 }] }] },
])('une sortie IA invalide échoue sans données partielles : %j', async invalid => {
  generated = invalid as GeneratedChapter
  await expect(service.importChapter(context(), input)).rejects.toThrow('Génération invalide')
  expect((await service.getSession(context())).cards).toEqual([])
  expect((await service.getImportQuota(context())).remaining).toBe(3)
})

test('un échec du fournisseur IA libère la place et renvoie une erreur compréhensible', async () => {
  service = new RevisionService({ db, now: () => now, generateCards: async () => { throw new Error('provider unavailable') } })
  await expect(service.importChapter(context(), input)).rejects.toThrow('Impossible de préparer ce cours')
  expect((await service.getImportQuota(context())).remaining).toBe(3)
  expect((await service.getSession(context())).cards).toEqual([])
})

test('un cours vide, illisible, trop long ou d’un format inconnu ne consomme aucun import', async () => {
  await expect(service.importChapter(context(), { ...input, title: 'a'.repeat(201) })).rejects.toThrow('Matière ou chapitre invalide')
  await expect(service.importChapter(context(), { ...input, text: '  ' })).rejects.toThrow('vide')
  await expect(service.importChapter(context(), { ...input, text: 'a'.repeat(100001) })).rejects.toThrow('trop long')
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject, file: { path: join(directory, 'absent.pdf'), filename: 'cours.pdf', mimeType: 'application/pdf' } })).rejects.toThrow('illisible')
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject, file: { path: join(directory, 'cours.exe'), filename: 'cours.exe', mimeType: 'image/jpeg' } })).rejects.toThrow('Format non pris en charge')
  const path = join(directory, 'vide.txt')
  await writeFile(path, '')
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject, file: { path, filename: 'vide.txt', mimeType: 'text/plain' } })).rejects.toThrow('vide')
  expect((await service.getImportQuota(context())).remaining).toBe(3)
})


test.each(['txt', 'jpg'])('un fichier %s dépassant 10 Mo est refusé sans consommer le quota', async extension => {
  const path = join(directory, `volumineux.${extension}`)
  await writeFile(path, '')
  await truncate(path, 10 * 1024 * 1024 + 1)
  await expect(service.importChapter(context(), { title: input.title, subject: input.subject, file: { path, filename: `volumineux.${extension}`, mimeType: 'application/octet-stream' } })).rejects.toThrow('10 Mo')
  expect((await service.getImportQuota(context())).remaining).toBe(3)
})
