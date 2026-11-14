import { useEffect, useRef } from 'react'
import { readOnDevice } from './revisionStore'

type Handlers<T> = { accept: (value: T) => void; fail?: (cause: unknown) => void; onChanged?: () => void; settled?: () => void }

// Lit une ressource de révision dans un effet : ignore le résultat après démontage, écarte la réponse d’un autre appareil
// (`onChanged` remet l’écran à zéro, la lecture repart) et relance si `deps` change.
// Renvoie `refresh`, qui relit à la demande (après une écriture) et rejette en cas d’erreur.
export function useRevisionRead<T>(read: () => Promise<T>, handlers: Handlers<T>, deps: unknown[] = []): () => Promise<void> {
  const latest = useRef({ read, handlers })
  latest.current = { read, handlers }
  const run = (isActive: () => boolean) => readOnDevice(() => latest.current.read(), () => latest.current.handlers.onChanged?.(), isActive)
    .then(value => { if (isActive()) latest.current.handlers.accept(value) })
  useEffect(() => {
    let active = true
    run(() => active)
      .catch(cause => { if (active) latest.current.handlers.fail?.(cause) })
      .finally(() => { if (active) latest.current.handlers.settled?.() })
    return () => { active = false }
  // biome-ignore lint/correctness/useExhaustiveDependencies: les dépendances sont celles de l’appelant ; read et handlers sont lus à jour via la ref.
  }, deps)
  return () => run(() => true)
}
