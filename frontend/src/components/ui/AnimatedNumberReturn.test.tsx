// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { AnimatedNumber } from './AnimatedNumber'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('les nombres restaurés restent visibles et seuls les changements sont animés', () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  const raf = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const host = document.createElement('div'); document.body.append(host)
  host.style.setProperty('--duration-slow', '300ms')
  const computed = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = computed(element)
    style.setProperty('--duration-slow', '300ms')
    return style
  })
  const root = createRoot(host)
  try {
    act(() => root.render(<AnimatedNumber value={42} />))
    const number = () => host.querySelector('[aria-hidden]')!.textContent
    expect(number()).toBe('42')
    expect(raf).not.toHaveBeenCalled()
    act(() => root.render(<AnimatedNumber value={43} />))
    expect(number()).toBe('42')
    expect(raf).toHaveBeenCalledOnce()
    act(() => root.render(<AnimatedNumber value={43} from={0} />))
    expect(number()).toBe('0')
    act(() => root.render(<AnimatedNumber value={43} from={null} />))
    expect(number()).toBe('43')
  } finally { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() }
})
