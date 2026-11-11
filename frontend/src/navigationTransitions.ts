import type { createBrowserRouter } from 'react-router-dom'
import { prefersReducedMotion } from './lib/motion'

export function navigationTransitions<T extends ReturnType<typeof createBrowserRouter>>(router: T): T {
  const subscribe = router.subscribe.bind(router)
  router.subscribe = subscriber => {
    let previous = router.state.location
    return subscribe((state, options) => {
      const next = state.location
      if (next.pathname !== previous.pathname) {
        document.documentElement.dataset.nav = state.historyAction === 'POP' ? 'pop' : next.state?.navigationTab ? 'tab' : 'push'
        const viewTransitionOpts = typeof document.startViewTransition === 'function' && !prefersReducedMotion()
          ? { currentLocation: previous, nextLocation: next } : undefined
        previous = next
        subscriber(state, { ...options, flushSync: !!viewTransitionOpts, viewTransitionOpts })
      } else {
        previous = next
        subscriber(state, { ...options, viewTransitionOpts: undefined })
      }
    })
  }
  return router
}
