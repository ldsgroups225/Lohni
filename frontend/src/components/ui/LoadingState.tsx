import { useEffect, useState } from 'react'
import Mascotte from '../Mascotte/Mascotte'

const tips = [
  'Cinq minutes par jour valent mieux qu’une heure la veille de l’examen.',
  'Une carte oubliée revient plus tôt : c’est comme ça que ta mémoire se renforce.',
  'Explique la réponse à voix haute : si tu peux l’expliquer, tu l’as comprise.',
  'Chaque session terminée prolonge ta série et te rapporte des XP.',
  'Tu hésites ? Réponds quand même : essayer aide plus que relire.',
  'Les erreurs sont utiles : Lohni te les repose au bon moment.',
]

// Reusable loading screen: mascot, progress shimmer and rotating study tips. Animations only use transform/opacity.
export function LoadingState({ label = 'On prépare ta page…', fullPage = false, className = '' }: { label?: string; fullPage?: boolean; className?: string }) {
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
        <div aria-hidden="true" className="ui-loadbar"><span /></div>
        <div aria-hidden="true" className="flex justify-center gap-2">
          <span className="ui-pip" /><span className="ui-pip" style={{ animationDelay: '0.2s' }} /><span className="ui-pip" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
      <div aria-hidden="true" className="w-full rounded-2xl border border-border bg-surface p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Astuce</p>
        <p key={tip} className="motion-enter mt-1 min-h-12 text-sm text-foreground">{tips[tip]}</p>
      </div>
    </div>
  )
}
