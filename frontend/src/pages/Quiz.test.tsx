// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ start: vi.fn(async () => ({ quizId: '1' })) }))
vi.mock('../lib/api', () => ({ quizStart: api.start, connectQuizStream: () => ({ close: () => {} }) }))
import Quiz from './Quiz'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('choisir un sujet lance une seule génération malgré la mise à jour de l’URL', async () => {
  api.start.mockClear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={createMemoryRouter([{ path: '/quiz', element: <Quiz /> }], { initialEntries: ['/quiz'] })} />))
    const click = async (text: string) => {
      const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!
      await act(async () => button.click())
    }
    await click('Les fractions')
    await click('Commencer le quiz')
    expect(api.start).toHaveBeenCalledTimes(1)
    expect(api.start).toHaveBeenCalledWith('Les fractions')
  } finally {
    act(() => root.unmount()); host.remove()
  }
})
