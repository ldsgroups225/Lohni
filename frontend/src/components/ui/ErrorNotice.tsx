import Mascotte from '../Mascotte/Mascotte'
import { Button } from './Button'

// Erreur d'écran : mascotte, message dans un <p>, « Réessayer » sur sa propre ligne quand une nouvelle tentative existe.
export function ErrorNotice({ message, onRetry, busy = false, mascot = true, retryLabel = 'Réessayer' }: { message: string; onRetry?: () => void; busy?: boolean; mascot?: boolean; retryLabel?: string }) {
  return <div role="alert" className="ui-error space-y-3">
    {mascot && <Mascotte humeur="désolée" taille={96} />}
    <p>{message}</p>
    {onRetry && <Button variant="secondary" disabled={busy} onClick={onRetry}>{retryLabel}</Button>}
  </div>
}
