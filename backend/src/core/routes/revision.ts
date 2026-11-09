import { RevisionError, RevisionService, type RevisionContext } from '../../services/revision/service'
import { generateCards } from '../../services/revision/generator'
import { sqlite } from '../../utils/database/sqlite'

const revision = new RevisionService({ db: sqlite, now: () => new Date(), generateCards })

export function revisionRoutes(app: any) {
  const route = (method: string, path: string, handle: (context: RevisionContext, req: any) => Promise<unknown>) => {
    app[method](path, async (req: any, res: any) => {
      try {
        const data = await handle({ deviceId: req.headers['x-device-id'], localDate: req.headers['x-local-date'] }, req)
        res.send({ ok: true, data: data ?? null })
      } catch (error) {
        if (error instanceof RevisionError) return res.status(400).send({ ok: false, error: error.message })
        console.error('[revision]', error)
        res.status(500).send({ ok: false, error: 'La révision est indisponible. Réessaie dans un instant.' })
      }
    })
  }
  route('get', '/revision/profile', context => revision.getProfile(context))
  route('put', '/revision/profile', (context, req) => revision.saveProfile(context, req.body))
  route('post', '/revision/chapters', (context, req) => revision.generateChapter(context, req.body))
  route('get', '/revision/session', context => revision.getSession(context))
  route('post', '/revision/session/continue', context => revision.getSession(context, true))
  route('post', '/revision/session/answer', (context, req) => revision.answer(context, req.body))
  route('delete', '/revision/cards/:id', (context, req) => revision.deleteCard(context, req.params.id))
}
