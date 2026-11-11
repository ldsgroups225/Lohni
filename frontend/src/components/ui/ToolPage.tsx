import type { ReactNode } from 'react'
import { BackButton } from './BackButton'

// Gabarit commun des écrans d'outils (Planning, Podcast, Quiz libre, Examen, Débat) : même marge, même en-tête, même retour.
export function ToolPage({ title, back = '/courses', beta = true, wide = false, actions, children }: {
  title: string; back?: string; beta?: boolean; wide?: boolean; actions?: ReactNode; children: ReactNode
}) {
  return (
    <main className={`loop-screen mx-auto w-full px-4 pb-28 pt-3 md:pb-14 md:pl-28 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <header className="mb-4 flex items-center gap-3">
        <BackButton fallback={back} />
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold text-foreground">{title}</h1>
        {actions}
        {beta && <span className="shrink-0 rounded-full border border-border bg-tint px-3 py-1 text-xs font-medium text-foreground">BÊTA</span>}
      </header>
      <div className="space-y-4">{children}</div>
    </main>
  )
}
