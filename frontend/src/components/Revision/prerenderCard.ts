import type { RevisionCard } from '../../lib/api'

/** Les textes d'une carte, tels que ses composants les rendent : question et choix en ligne (SwipeCard, QCM de Revision), réponse en bloc.
 *  Si un composant change la façon de rendre un champ, changer ce tableau avec lui : sinon le cache manque sans bruit. */
function cardTexts(card: RevisionCard) {
  return [{ md: card.question, inline: true }, { md: card.answer }, ...(card.options ?? []).map(md => ({ md, inline: true }))]
}

const whenIdle = (run: () => void) => (window.requestIdleCallback ?? ((task: () => void) => window.setTimeout(task, 200)))(run)
const cancelIdle = (handle: number) => (window.cancelIdleCallback ?? window.clearTimeout)(handle)

/** Rend la carte (Markdown, KaTeX) au repos, un texte par moment de repos : un geste qui commence n'attend jamais tout son rendu.
 *  Renvoie l'annulation, à appeler quand la carte n'est plus la suivante. */
export function prerenderCard(card: RevisionCard): () => void {
  const texts = cardTexts(card)
  let handle = 0
  let stopped = false
  const renderNext = async () => {
    const { prerenderMarkdown } = await import('../Chat/MarkdownContent')
    const text = texts.shift()
    if (stopped || !text) return
    prerenderMarkdown([text])
    if (texts.length) schedule()
  }
  const schedule = () => { handle = whenIdle(() => { void renderNext() }) }
  schedule()
  return () => { stopped = true; cancelIdle(handle) }
}
