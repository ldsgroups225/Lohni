// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { required } from '../../test/required'
import Composer from './Composer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { vi.unstubAllGlobals() })

async function setup(coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }))
  const onSend = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<Composer onSend={onSend} />))
  const box = required(host.querySelector('textarea'))
  box.value = 'Bonjour'
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  act(() => { box.dispatchEvent(enter) })
  return { onSend, enter, button: required(host.querySelector<HTMLButtonElement>('button[aria-label="Envoyer"]')), done: () => { act(() => root.unmount()); host.remove() } }
}

test('Entrée envoie avec une souris', async () => {
  const t = await setup(false)
  expect(t.onSend).toHaveBeenCalledWith('Bonjour'); expect(t.enter.defaultPrevented).toBe(true); t.done()
})

test('Entrée insère un retour à la ligne au toucher et le bouton envoie', async () => {
  const t = await setup(true)
  expect(t.onSend).not.toHaveBeenCalled(); expect(t.enter.defaultPrevented).toBe(false)
  act(() => t.button.click())
  expect(t.onSend).toHaveBeenCalledWith('Bonjour'); t.done()
})

test('le bouton d’envoi est une flèche, pas une onde sonore', async () => {
  const t = await setup(false)
  expect(t.button.querySelector('path')?.getAttribute('d')).toBe('M4 12h16m-7-7 7 7-7 7'); t.done()
})
