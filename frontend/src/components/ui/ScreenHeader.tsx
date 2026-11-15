import type { ReactNode } from 'react'
import { BackButton } from './BackButton'

// En-tête des écrans secondaires : retour carré et titre sur la même ligne, centrés verticalement.
export function ScreenHeader({ title, back, backLabel, subtitle, fullTitle, children }: {
  title: ReactNode; back: string | (() => void) | null; backLabel?: string; subtitle?: ReactNode; fullTitle?: boolean; children?: ReactNode
}) {
  return <header className="flex items-center gap-3">
    {typeof back === 'string' ? <BackButton fallback={back} label={backLabel} /> : back && <BackButton onClick={back} label={backLabel} />}
    <div className="min-w-0 flex-1">
      <h1 className={`${fullTitle ? '' : 'line-clamp-2 '}text-2xl font-bold leading-tight text-foreground [overflow-wrap:anywhere]`}>{title}</h1>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
    {children}
  </header>
}
