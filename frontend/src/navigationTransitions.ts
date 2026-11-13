import type { createBrowserRouter } from 'react-router-dom'
import { prefersReducedMotion } from './lib/motion'
import { navigationCancelled } from './lib/useLeaveConfirmation'

type Router = ReturnType<typeof createBrowserRouter>
type PendingTab = { to: string; index: number; origin: string }
let currentRouter: Router | undefined
let currentPending: { current: PendingTab | null } | undefined

export function jumpToTab(delta: number, to: string) {
  const router = currentRouter
  const pending = currentPending
  if (!router || !pending) return false
  if (pending.current) return true
  pending.current = { to, index: window.history.state.idx + delta, origin: router.state.location.key }
  void router.navigate(delta)
  return true
}

export function navigationTransitions<T extends Router>(router: T): T {
  const pending = { current: null as PendingTab | null }
  const subscribe = router.subscribe.bind(router)
  type Subscriber = Parameters<typeof router.subscribe>[0]
  const subscribers = new Set<Subscriber>()
  let stop: (() => void) | undefined
  let previous = router.state.location
  const cancel = () => { pending.current = null }
  router.subscribe = subscriber => {
    subscribers.add(subscriber)
    if (!stop) {
      currentRouter = router
      currentPending = pending
      window.addEventListener(navigationCancelled, cancel)
      // Intercept the intermediate POP before React sees it and starts a transition.
      stop = subscribe((state, options) => {
        const next = state.location
        let tab = false
        if (pending.current && state.historyAction === 'POP' && next.key !== pending.current.origin && window.history.state?.idx === pending.current.index) {
          const { to } = pending.current
          pending.current = null
          if (to !== '/') {
            queueMicrotask(() => { void router.navigate(to, { replace: true, state: { navigationTab: true } }) })
            return
          }
          tab = true
        }
        if (next.pathname !== previous.pathname) {
          document.documentElement.dataset.nav = tab ? 'tab' : state.historyAction === 'POP' ? 'pop' : next.state?.navigationTab ? 'tab' : 'push'
          // La première séance ne doit pas attendre une transition native bloquée.
          const viewTransitionOpts = typeof document.startViewTransition === 'function' && !prefersReducedMotion() && !(state.historyAction === 'PUSH' && next.state?.onboardingComplete)
            ? { currentLocation: previous, nextLocation: next } : undefined
          previous = next
          for (const listener of [...subscribers]) listener(state, { ...options, flushSync: !!viewTransitionOpts, viewTransitionOpts })
        } else {
          previous = next
          for (const listener of [...subscribers]) listener(state, { ...options, viewTransitionOpts: undefined })
        }
      })
    }
    return () => {
      subscribers.delete(subscriber)
      if (!subscribers.size) {
        stop?.(); stop = undefined; window.removeEventListener(navigationCancelled, cancel)
        if (currentRouter === router) { currentRouter = undefined; currentPending = undefined }
      }
    }
  }
  return router
}
