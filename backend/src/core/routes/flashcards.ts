import db from '../../utils/database/keyv'

export function flashcardRoutes(app: any) {
  app.post('/flashcards', async (req: any, res: any) => {
    try {
      const { question, answer, tag } = req.body
      if (!question || !answer || !tag) return res.status(400).send({ error: 'Question, réponse et thème requis.' })
      const id = crypto.randomUUID()
      const card = { id, question, answer, tag, created: Date.now() }
      const cards = await db.get('flashcards') || []
      cards.push(card)
      await db.set(`flashcard:${id}`, card)
      await db.set('flashcards', cards)
      res.send({ ok: true, flashcard: card })
    } catch (e: any) {
      console.error('[flashcards]', e)
      res.status(500).send({ ok: false, error: 'Impossible de gérer les cartes. Réessaie.' })
    }
  })

  app.get('/flashcards', async (_: any, res: any) => {
    try {
      res.send({ ok: true, flashcards: await db.get('flashcards') || [] })
    } catch (e: any) {
      console.error('[flashcards]', e)
      res.status(500).send({ ok: false, error: 'Impossible de gérer les cartes. Réessaie.' })
    }
  })

  app.delete('/flashcards/:id', async (req: any, res: any) => {
    try {
      const id = req.params.id
      if (!id) return res.status(400).send({ error: 'Identifiant requis.' })
      await db.delete(`flashcard:${id}`)
      let cards = await db.get('flashcards') || []
      cards = cards.filter((c: any) => c.id !== id)
      await db.set('flashcards', cards)
      res.send({ ok: true })
    } catch (e: any) {
      console.error('[flashcards]', e)
      res.status(500).send({ ok: false, error: 'Impossible de gérer les cartes. Réessaie.' })
    }
  })
}