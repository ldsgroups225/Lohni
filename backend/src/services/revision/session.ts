import { REVISION_POLICY as policy } from './policy'

// Même avancement pour la session locale hors ligne et la session persistée côté serveur.
export function advanceSession<Card extends { id: string }>(session: {
  cards: Card[]; position: number; repeated: string[]; elapsedMs: number; complete: boolean; earnedXP: number
}, knew: boolean, durationMs: number): void {
  const card = session.cards[session.position]
  if (!knew && !session.repeated.includes(card.id)) {
    // Une reprise remplace une carte encore à voir ; la dernière peut ajouter une 21e réponse.
    if (session.cards.length >= policy.sessionCards) {
      for (let i = session.cards.length - 1; i > session.position; i--) {
        if (!session.repeated.includes(session.cards[i].id)) {
          session.cards.splice(i, 1)
          break
        }
      }
    }
    session.cards.push({ ...card })
    session.repeated.push(card.id)
  }
  session.position++
  session.elapsedMs += Math.min(durationMs, policy.sessionMinutes * 60000)
  session.complete = session.position >= session.cards.length || session.elapsedMs >= policy.sessionMinutes * 60000
  session.earnedXP += (knew ? policy.knownXP : policy.missedXP) + (session.complete ? policy.sessionXP : 0)
}
