// Reusable centered loading indicator: one look and one position for every page.
export function LoadingState({ label = 'Chargement…', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`motion-enter flex flex-col items-center justify-center gap-4 px-6 py-16 text-center text-muted ${className}`}>
      <span aria-hidden="true" className="ui-spinner" />
      <p className="max-w-xs text-foreground">{label}</p>
    </div>
  )
}
