// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

vi.mock('../lib/api', () => ({
  getExams: async () => ({ exams: [{ id: 'test', name: 'Examen test', sections: ['a'] }] }),
  startExam: async () => ({ runId: '1' }),
  connectExamStream: (_id: string, onEvent: (event: unknown) => void) => {
    queueMicrotask(() => onEvent({ type: 'exam', payload: [{ id: 1, question: 'Question ?', options: ['Oui', 'Non'], correct: 1, hint: 'Indice', explanation: 'Explication' }] }))
    return { close: () => {} }
  },
}))
vi.mock('../components/Chat/MarkdownView', () => ({ default: ({ md }: { md: string }) => <span>{md}</span> }))
import ExamLabs from './examlab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('un examen affiche la correction avant le résultat et permet de revoir sa réponse', async () => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const click = async (text: string) => {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))
    expect(button).toBeTruthy()
    await act(async () => { button!.click() })
  }
  try {
    await act(async () => { root.render(<MemoryRouter><ExamLabs /></MemoryRouter>) })
    await click('Examen test')
    await click('Non')
    expect(host.textContent).toContain('Réponse incorrecte')
    expect(host.textContent).toContain('Bonne réponse')
    expect(host.textContent).not.toContain('Quiz terminé')
    await click('Voir mon résultat')
    expect(host.textContent).toContain('0/1')
    expect(host.textContent).toContain('Ta réponse')
    expect(host.textContent).toContain('Explication')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
