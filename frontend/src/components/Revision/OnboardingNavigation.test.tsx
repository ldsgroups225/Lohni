// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
vi.mock('../../lib/api', () => ({ revisionAPI: {}, revisionPolicy: {} }))
import Onboarding from './Onboarding'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le retour retrouve l’étape précédente et les réponses', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('form')!.requestSubmit())
    expect(host.textContent).toContain('Étape 2')
    const checkbox = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
    const label = checkbox.parentElement!.textContent!
    await act(async () => checkbox.click())
    await act(async () => host.querySelector('form')!.requestSubmit())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Étape 2')
    expect([...host.querySelectorAll('label')].find(el => el.textContent === label)?.querySelector('input')?.checked).toBe(false)
    await act(async () => { await router.navigate(-1) })
    await act(async () => host.querySelector('form')!.requestSubmit())
    expect([...host.querySelectorAll('label')].find(el => el.textContent === label)?.querySelector('input')?.checked).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
