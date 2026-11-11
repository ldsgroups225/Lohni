import { useEffect, useState } from 'react'

export function PendingRead({ title, label }: { title: string; label: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 700)
    return () => window.clearTimeout(timer)
  }, [])
  return <section aria-busy="true" className="space-y-4 rounded-2xl border border-border p-6">
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    <div aria-hidden="true" className="space-y-3">
      <div className="h-4 w-3/4 rounded bg-tint" />
      <div className="h-4 w-1/2 rounded bg-tint" />
      <div className="h-12 rounded-xl bg-tint" />
    </div>
    {slow && <p role="status" className="text-sm text-muted">{label}</p>}
  </section>
}
