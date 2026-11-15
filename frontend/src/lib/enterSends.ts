// Au clavier physique Entrée envoie ; sur écran tactile Entrée sert à la ligne et le bouton envoie.
export const enterSends = () => !window.matchMedia?.('(pointer: coarse)').matches
