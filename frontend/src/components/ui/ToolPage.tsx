import type { ReactNode } from 'react'
import { ScreenHeader } from './ScreenHeader'

// Gabarit commun des écrans d'outils (Planning, Podcast, Quiz libre, Examen, Débat) : même marge, même en-tête, même retour.
export function ToolPage({ title, back = '/courses', beta = true, wide = false, actions, children }: {
  title: string; back?: string; beta?: boolean; wide?: boolean; actions?: ReactNode; children: ReactNode
}) {
  return (
    <main className="loop-screen ui-page">
      <div className={wide ? 'ui-page-body-wide' : 'ui-page-body-tool'}>
      <ScreenHeader title={title} back={back}>
        {actions}
        {beta && <span className="shrink-0 rounded-full border border-border bg-tint px-3 py-1 text-xs font-medium text-foreground">BÊTA</span>}
      </ScreenHeader>
      <div className="mt-4 space-y-4">{children}</div>
      </div>
    </main>
  )
}
