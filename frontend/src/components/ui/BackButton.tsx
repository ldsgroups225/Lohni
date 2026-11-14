import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// `onClick` remplace la navigation quand le retour reste dans l’écran (étape précédente, fermeture d’un détail).
export function BackButton({ fallback = '/', onClick, label = 'Retour', className = 'press-icon -ml-1 inline-grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground', children }: {
  fallback?: string; onClick?: () => void; label?: string; className?: string; children?: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  // React Router uses the default key for the initial entry.
  return <button type="button" aria-label={label} className={className} onClick={onClick ?? (() => location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }))}>
    {children ?? <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>}
  </button>
}
