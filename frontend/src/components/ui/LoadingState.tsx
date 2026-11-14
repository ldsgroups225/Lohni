import { useEffect, useState, type ReactNode } from 'react'
import Mascotte from '../Mascotte/Mascotte'

const tips = [
  'Cinq minutes par jour valent mieux qu’une heure la veille de l’examen.',
  'Une carte oubliée revient plus tôt : c’est comme ça que ta mémoire se renforce.',
  'Explique la réponse à voix haute : si tu peux l’expliquer, tu l’as comprise.',
  'Chaque session terminée prolonge ta série et te rapporte des XP.',
  'Tu hésites ? Réponds quand même : essayer aide plus que relire.',
  'Les erreurs sont utiles : Lohni te les repose au bon moment.',
]

// LoadingState: steps are { after, message } in seconds; expectedDuration is seconds; onCancel stops the request.
// ErrorState: title, detail, optional children and actions ({ label, onClick, variant: primary | outline | link }).
export function LoadingState({ label = 'On prépare ta page…', fullPage = false, className = '', steps, expectedDuration, onCancel, fragileCard }: { label?: string; fullPage?: boolean; className?: string; steps?: { after: number; message: string }[]; expectedDuration?: number; onCancel?: () => void; fragileCard?: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!expectedDuration) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [expectedDuration])
  const [tip, setTip] = useState(() => Math.floor(Math.random() * tips.length))
  useEffect(() => {
    const timer = setInterval(() => setTip(value => (value + 1) % tips.length), 3600)
    return () => clearInterval(timer)
  }, [])
  return (
    <div role="status" aria-live="polite" className={`motion-enter mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-6 px-6 text-center ${fullPage ? 'min-h-[70vh]' : 'py-12'} ${className}`}>
      <div className="relative grid place-items-center">
        <span aria-hidden="true" className="ui-glow" />
        <Mascotte humeur="pensive" taille={104} decorative />
      </div>
      <div className="w-full space-y-3">
        <p className="text-lg font-semibold text-foreground">{label}</p>
        {expectedDuration && expectedDuration > 0 ? <>
          <p className="text-sm text-muted">{steps?.length ? [...steps].reverse().find(step => elapsed >= step.after)?.message ?? steps[0].message : 'Cela peut prendre un moment.'}</p>
          <progress className="ui-progress" aria-label="Progression estimée" max={100} value={Math.min(95, Math.floor(elapsed / expectedDuration * 100))} />
          <p className="text-sm font-semibold text-muted">{elapsed} s écoulées · environ {expectedDuration} s en tout</p>
        </> : <div aria-hidden="true" className="ui-loadbar"><span /></div>}
        <div aria-hidden="true" className="flex justify-center gap-2">
          <span className="ui-pip" /><span className="ui-pip" style={{ animationDelay: '0.16s' }} /><span className="ui-pip" style={{ animationDelay: '0.32s' }} />
        </div>
      </div>
      {fragileCard ? <div className="w-full rounded-2xl border border-border bg-surface p-4 text-left text-sm text-muted">En attendant, relis une carte fragile : <b className="text-foreground">{fragileCard}</b></div> : !expectedDuration && <div aria-hidden="true" className="w-full rounded-2xl border border-border bg-surface p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Astuce</p>
        <p key={tip} className="motion-enter mt-1 min-h-12 text-sm text-foreground">{tips[tip]}</p>
      </div>}
      {onCancel && <button type="button" className="min-h-11 underline text-primary" onClick={onCancel}>Annuler</button>}
    </div>
  )
}

export function ErrorState({ title, detail, children, actions }: { title: string; detail?: string; children?: ReactNode; actions: { label: string; onClick: () => void; variant: 'primary' | 'outline' | 'link' }[] }) {
  return <section role="alert" className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-6 py-12 text-center">
    <Mascotte humeur="désolée" taille={104} decorative />
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    {detail && <p className="text-muted">{detail}</p>}
    {children}
    {actions.map(action => <button key={action.label} type="button" onClick={action.onClick} className={action.variant === 'primary' ? 'ui-button min-h-11 w-full' : action.variant === 'outline' ? 'min-h-11 w-full rounded-control border border-primary text-primary' : 'min-h-11 text-primary underline'}>{action.label}</button>)}
  </section>
}
