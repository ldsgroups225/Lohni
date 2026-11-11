import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { confirmDialog } from './confirm'

export function useLeaveConfirmation(active: boolean, message: string) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let current = true
    void confirmDialog(message, 'Quitter').then(confirmed => {
      if (!current) return
      if (confirmed) blocker.proceed()
      else blocker.reset()
    })
    return () => { current = false }
  }, [blocker, message])
}
