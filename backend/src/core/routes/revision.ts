import { withUpload } from '../../lib/parser/withUpload'
import { RevisionError, RevisionService, type RevisionContext } from '../../services/revision/service'
import { generateCards, transcribePhoto, readTimetable } from '../../services/revision/generator'
import { REVISION_POLICY as policy } from '../../services/revision/policy'
import { sqlite } from '../../utils/database/sqlite'
import { config } from '../../config/env'

const revision = new RevisionService({ db: sqlite, now: () => new Date(), generateCards, transcribePhoto, readTimetable })

export function revisionRoutes(app: any) {
  const route = (method: string, path: string, handle: (context: RevisionContext, req: any, res: any) => Promise<unknown>) => {
    app[method](path, async (req: any, res: any) => {
      req.setTimeout(config.timeout)
      try {
        const data = await handle({ deviceId: req.headers['x-device-id'], localDate: req.headers['x-local-date'] }, req, res)
        if (!res.destroyed) res.send({ ok: true, data: data ?? null })
      } catch (error) {
        if (res.destroyed) return
        if (error instanceof RevisionError) return res.status(400).send({ ok: false, error: error.message, code: error.code, chapterId: error.chapterId })
        console.error('[revision]', error)
        res.status(500).send({ ok: false, error: 'La révision est indisponible. Réessaie dans un instant.' })
      }
    })
  }
  // Imports are cancellable: abort the signal when the client disconnects before the response ends.
  const importRoute = (path: string, handle: (context: RevisionContext, req: any, signal: AbortSignal) => Promise<unknown>) =>
    route('post', path, async (context, req, res) => {
      const controller = new AbortController()
      const onClose = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', onClose)
      try { return await handle(context, req, controller.signal) } finally { res.off('close', onClose) }
    })
  route('get', '/revision/timetable', context => revision.getTimetable(context))
  route('put', '/revision/timetable', (context, req) => revision.saveTimetable(context, req.body))
  route('post', '/revision/timetable/photos', (context, req) =>
    withUpload(req, { prefix: 'lohni-timetable-', maxFiles: policy.maxTimetablePhotos, fileSize: policy.maxUploadMB * 1024 * 1024, tooBigMessage: `Choisis au plus ${policy.maxTimetablePhotos} photos de ${policy.maxUploadMB} Mo maximum.` },
      ({ files }) => revision.readTimetablePhotos(context, files)))
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
  route('delete', '/revision/import/:id', (context, req) => revision.discardFailedImport(context, req.params.id))
  importRoute('/revision/import/:id/retry', (context, req, signal) => revision.retryImport(context, req.params.id, signal))
  importRoute('/revision/import', async (context, req, signal) => {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      const { title, subject, text } = req.body ?? {}
      return revision.importChapter(context, { title, subject, text }, signal)
    }
    return withUpload<{ title: string; subject: string }>(req, { prefix: 'lohni-import-', maxFiles: 1, fileSize: policy.maxUploadMB * 1024 * 1024, exactlyOne: true, metadata: true, code: 'IMPORT_FILE',
      tooBigMessage: `Import illisible ou trop volumineux. Choisis un seul fichier de ${policy.maxUploadMB} Mo maximum.`, noFileMessage: 'Choisis un fichier à importer.' },
      ({ files, metadata }) => revision.importChapter(context, { title: metadata?.title, subject: metadata?.subject, file: files[0] }, signal))
  })
  route('delete', '/revision/chapters/:id', (context, req) => revision.deleteChapter(context, req.params.id))
  route('get', '/revision/session', context => revision.getSession(context))
  route('post', '/revision/session/continue', context => revision.getSession(context, true))
  route('post', '/revision/chapters/:id/session', (context, req) => revision.getChapterSession(context, req.params.id))
  route('post', '/revision/session/:id/review-missed', (context, req) => revision.reviewMissed(context, req.params.id))
  route('post', '/revision/session/answer', (context, req) => revision.answer(context, req.body))
  route('delete', '/revision/cards/:id', (context, req) => revision.deleteCard(context, req.params.id))
  route('put', '/revision/cards/:id', (context, req) => revision.updateCard(context, req.params.id, req.body))
}
