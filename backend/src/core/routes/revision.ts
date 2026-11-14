import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMultipart } from '../../lib/parser/upload'
import { RevisionError, RevisionService, type RevisionContext } from '../../services/revision/service'
import { generateCards, transcribePhoto, readTimetable } from '../../services/revision/generator'
import { REVISION_POLICY as policy } from '../../services/revision/policy'
import { sqlite } from '../../utils/database/sqlite'
import { config } from '../../config/env'

const revision = new RevisionService({ db: sqlite, now: () => new Date(), generateCards, transcribePhoto, readTimetable })

export function revisionRoutes(app: any) {
  const route = (method: string, path: string, handle: (context: RevisionContext, req: any) => Promise<unknown>) => {
    app[method](path, async (req: any, res: any) => {
      req.setTimeout(config.timeout)
      const controller = method === 'post' && (path === '/revision/import' || path === '/revision/import/:id/retry') ? new AbortController() : undefined
      const onClose = () => { if (!res.writableEnded) controller?.abort() }
      if (controller) { req.importSignal = controller.signal; res.on('close', onClose) }
      try {
        const data = await handle({ deviceId: req.headers['x-device-id'], localDate: req.headers['x-local-date'] }, req)
        if (!res.destroyed) res.send({ ok: true, data: data ?? null })
      } catch (error) {
        if (res.destroyed) return
        if (error instanceof RevisionError) return res.status(400).send({ ok: false, error: error.message, code: error.code, chapterId: error.chapterId })
        console.error('[revision]', error)
        res.status(500).send({ ok: false, error: 'La révision est indisponible. Réessaie dans un instant.' })
      } finally { if (controller) res.off('close', onClose) }
    })
  }
  route('get', '/revision/timetable', context => revision.getTimetable(context))
  route('put', '/revision/timetable', (context, req) => revision.saveTimetable(context, req.body))
  route('post', '/revision/timetable/photos', async (context, req) => {
    const directory = await mkdtemp(join(tmpdir(), 'lohni-timetable-'))
    try {
      let upload: Awaited<ReturnType<typeof parseMultipart>>
      try { upload = await parseMultipart(req, { directory, limits: { files: policy.maxTimetablePhotos, fileSize: policy.maxUploadMB * 1024 * 1024, fields: 1, fieldSize: 4096 } }) }
      catch { throw new RevisionError(`Choisis au plus ${policy.maxTimetablePhotos} photos de ${policy.maxUploadMB} Mo maximum.`) }
      return await revision.readTimetablePhotos(context, upload.files)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  route('get', '/revision/plan', context => revision.getPlan(context))
  route('get', '/revision/exams/:id/session', (context, req) => revision.getExamSession(context, req.params.id))
  route('post', '/revision/exams/:id/session/continue', (context, req) => revision.getExamSession(context, req.params.id, true))
  route('get', '/revision/exams', context => revision.listExams(context))
  route('post', '/revision/exams', (context, req) => revision.saveExam(context, req.body))
  route('put', '/revision/exams/:id', (context, req) => revision.saveExam(context, { ...req.body, id: req.params.id }))
  route('delete', '/revision/exams/:id', (context, req) => revision.deleteExam(context, req.params.id))
  route('get', '/revision/profile', context => revision.getProfile(context))
  route('get', '/revision/settings', context => revision.getSettings(context))
  route('put', '/revision/settings', (context, req) => revision.saveSettings(context, req.body))
  route('get', '/revision/progress', context => revision.getProgress(context))
  route('get', '/revision/home', context => revision.getHome(context))
  route('put', '/revision/profile', (context, req) => revision.saveProfile(context, req.body))
  route('post', '/revision/notes', (context, req) => revision.saveTutorNote(context, req.body))
  route('post', '/revision/chapters', (context, req) => revision.generateChapter(context, req.body))
  route('get', '/revision/chapters', context => revision.listChapters(context))
  route('get', '/revision/import/quota', context => revision.getImportQuota(context))
  route('post', '/revision/import/:id/retry', (context, req) => revision.retryImport(context, req.params.id, req.importSignal))
  route('post', '/revision/import', async (context, req) => {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      const { title, subject, text } = req.body ?? {}
      return revision.importChapter(context, { title, subject, text }, req.importSignal)
    }
    const directory = await mkdtemp(join(tmpdir(), 'lohni-import-'))
    try {
      let upload: Awaited<ReturnType<typeof parseMultipart>>
      try {
        upload = await parseMultipart(req, { directory, limits: { files: 1, fileSize: policy.maxUploadMB * 1024 * 1024, fields: 1, fieldSize: 4096 } })
      } catch {
        throw new RevisionError(`Import illisible ou trop volumineux. Choisis un seul fichier de ${policy.maxUploadMB} Mo maximum.`)
      }
      let metadata: { title: string; subject: string }
      try { metadata = JSON.parse(upload.q) } catch { throw new RevisionError('Matière et titre du chapitre requis.') }
      if (upload.files.length !== 1) throw new RevisionError('Choisis un fichier à importer.')
      return await revision.importChapter(context, { title: metadata?.title, subject: metadata?.subject, file: upload.files[0] }, req.importSignal)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  route('delete', '/revision/chapters/:id', (context, req) => revision.deleteChapter(context, req.params.id))
  route('get', '/revision/session', context => revision.getSession(context))
  route('post', '/revision/session/continue', context => revision.getSession(context, true))
  route('post', '/revision/session/answer', (context, req) => revision.answer(context, req.body))
  route('delete', '/revision/cards/:id', (context, req) => revision.deleteCard(context, req.params.id))
  route('put', '/revision/cards/:id', (context, req) => revision.updateCard(context, req.params.id, req.body))
}
