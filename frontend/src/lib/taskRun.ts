type Ev = { type: string; error?: string }

// One generation launched on the server and followed over a socket:
// cancelling before the id arrives cancels as soon as it does; a socket lost mid-run is an immediate failure.
export function runTask<E extends Ev>(o: {
  start: () => Promise<string>
  connect: (id: string, onEvent: (ev: E) => void) => { close: () => void }
  cancel: (id: string) => Promise<unknown>
  onEvent: (ev: E) => void
  onStartError: () => void
  onId?: (id: string) => void
  onCancelError?: () => void
  streamError: string
}) {
  let cancelled = false
  let finished = false
  let id: string | undefined
  let close = () => {}
  // A cleanup cancel after a failure is silent: it must not replace the failure message.
  const cancelRemote = (target: string, silent = false) => { Promise.resolve().then(() => o.cancel(target)).catch(() => { if (!silent) o.onCancelError?.() }) }
  void o.start().then(started => {
    if (cancelled) return cancelRemote(started)
    id = started
    o.onId?.(started)
    close = o.connect(started, ev => {
      if (cancelled || finished) return
      if (ev.type === "error" && ev.error === "stream_error") {
        finished = true
        cancelRemote(started, true)
        return o.onEvent({ ...ev, error: o.streamError })
      }
      if (ev.type === "done" || ev.type === "error") { finished = true; close() }
      o.onEvent(ev)
    }).close
  }, () => { if (!cancelled) o.onStartError() })
  return {
    cancel() {
      if (cancelled) return
      cancelled = true
      close()
      if (id && !finished) cancelRemote(id)
    },
  }
}
