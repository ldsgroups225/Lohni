import type { ReactNode } from 'react'
import Mascotte from '../Mascotte/Mascotte'

// État vide : mascotte, titre, une phrase (children), une action (children aussi, après la phrase).
export function EmptyState({ title, children, live = false, mascot = true }: { title: string; children: ReactNode; live?: boolean; mascot?: boolean }) {
  return <section className="ui-card space-y-3 p-6" aria-live={live ? 'polite' : undefined}>
    {mascot && <Mascotte humeur="au repos" taille={112} />}
    <h2 className="ui-section-title">{title}</h2>
    {children}
  </section>
}
