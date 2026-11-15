import { useEffect, type RefObject } from 'react'
import { reserveHiddenBottom, revealAtBottom } from './motion'

/** Après une réponse : focus du bouton au clavier, puis défilement jusqu'à lui avec une marge dessous.
 *  Deuxième passage : le Markdown se charge à la demande et peut allonger la page après le premier.
 *  `reserveBar` : la page réserve aussi la hauteur masquée par la barre du navigateur (écran sans autre marge basse). */
export function useRevealButton(button: RefObject<HTMLElement | null>, shown: boolean, keyboardAnswer: RefObject<boolean>, reserveBar = false) {
  useEffect(() => {
    if (!shown) return
    if (keyboardAnswer.current) button.current?.focus({ preventScroll: true })
    keyboardAnswer.current = false
    const go = () => {
      if (!button.current) return
      if (reserveBar) reserveHiddenBottom()
      revealAtBottom(button.current)
    }
    go()
    const timer = window.setTimeout(go, 350)
    return () => window.clearTimeout(timer)
  }, [button, shown, keyboardAnswer, reserveBar])
}
