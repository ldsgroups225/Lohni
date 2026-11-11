import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { confirmDialog } from './confirm'

export const navigationCancelled = 'lohni-navigation-cancelled'

export function useLeaveConfirmation(active: boolean, message: string) {
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => active && !(historyAction !== 'POP' && nextLocation.state?.allowLeave) && currentLocation.pathname !== nextLocation.pathname)
  const latestBlocker = useRef(blocker)
  latestBlocker.current = blocker
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let current = true
    const controller = new AbortController()
    void confirmDialog(message, 'Quitter', controller.signal).then(confirmed => {
      if (!current) return
      const currentBlocker = latestBlocker.current
      if (currentBlocker.state !== 'blocked') return
      if (confirmed) currentBlocker.proceed()
      else { currentBlocker.reset(); window.dispatchEvent(new Event(navigationCancelled)) }
    })
    return () => { current = false; controller.abort() }
  }, [blocker.state, message])
}
