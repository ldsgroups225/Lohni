import { useState, type SyntheticEvent } from 'react'

export function usePersistentDetails(key: string) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(key) === 'open' } catch { return false }
  })
  function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const next = event.currentTarget.open
    setOpen(next)
    try { sessionStorage.setItem(key, next ? 'open' : 'closed') } catch { /* Storage is optional. */ }
  }
  return { open, onToggle }
}
