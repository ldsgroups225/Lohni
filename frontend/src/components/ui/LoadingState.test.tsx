// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { LoadingState } from './LoadingState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le chargement indique le temps, progresse sans promettre la fin et permet l’annulation', () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  const root = createRoot(host)
  const cancel = vi.fn()
  try {
    act(() => root.render(<LoadingState steps={[{ after: 0, message: 'Préparation' }, { after: 25, message: 'Encore un instant' }]} expectedDuration={40} onCancel={cancel} />))
    act(() => vi.advanceTimersByTime(100000))
    expect(host.textContent).toContain('100 s')
    expect(host.textContent).toContain('Encore un instant')
    expect(host.querySelector('progress')?.value).toBe(95)
    act(() => host.querySelector('button')?.click())
    expect(cancel).toHaveBeenCalledOnce()
  } finally { act(() => root.unmount()); vi.useRealTimers() }
})
