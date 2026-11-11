// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useExitTransition } from './motion'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let reduced = false
beforeEach(() => {
  vi.useFakeTimers()
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => { vi.useRealTimers(); reduced = false })

function Probe({ open, seen }: { open: boolean; seen: string[] }) {
  const { mounted, state } = useExitTransition(open, 160)
  seen.push(`${mounted ? 'on' : 'off'}:${state}`)
  return mounted ? <i data-state={state} /> : null
}
async function mount(open: boolean) {
  const seen: string[] = []
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe open={open} seen={seen} />))
  const set = (value: boolean) => act(async () => root.render(<Probe open={value} seen={seen} />))
  return { seen, set }
}

test('à la fermeture le nœud reste monté pendant la sortie, sans image vide entre les deux', async () => {
  const { seen, set } = await mount(true)
  seen.length = 0
  await set(false)
  expect(seen.every(frame => frame === 'on:exit')).toBe(true)
  await act(async () => { vi.advanceTimersByTime(159) })
  expect(seen.at(-1)).toBe('on:exit')
  await act(async () => { vi.advanceTimersByTime(2) })
  expect(seen.at(-1)).toBe('off:exit')
})

test('réouvrir pendant la sortie annule le démontage', async () => {
  const { seen, set } = await mount(true)
  await set(false)
  await act(async () => { vi.advanceTimersByTime(80) })
  await set(true)
  await act(async () => { vi.advanceTimersByTime(400) })
  expect(seen.at(-1)).toBe('on:enter')
})

test('en mouvement réduit le nœud disparaît tout de suite', async () => {
  reduced = true
  const { seen, set } = await mount(true)
  seen.length = 0
  await set(false)
  expect(seen.at(-1)).toBe('off:exit')
})
