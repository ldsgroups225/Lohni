import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const stream = vi.hoisted(() => ({ event: null as unknown }))
vi.mock('../lib/api', () => ({
  getExams: async () => ({ exams: [{ id: 'test', name: 'Examen test', sections: ['a'] }] }),
  startExam: async () => ({ runId: '1' }),
  connectExamStream: (_id: string, onEvent: (event: unknown) => void) => {
    queueMicrotask(() => onEvent(stream.event ?? { type: 'exam', payload: [{ id: 1, question: 'Question ?', options: ['Oui', 'Non'], correct: 1, hint: 'Indice', explanation: 'Explication' }] }))
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
    await act(async () => { required(button).click() })
  }
  try {
    await act(async () => { root.render(<MemoryRouter><ExamLabs /></MemoryRouter>) })
    await click('Examen test')
    expect(host.textContent).toContain('Examen test')
    await act(async () => required([...host.querySelectorAll<HTMLButtonElement>('#answerOptions button')].find(button => button.textContent?.includes('Non'))).click())
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

test('un échec de préparation est expliqué et permet de revenir à la liste', async () => {
  stream.event = { type: 'error', error: 'Impossible de préparer l’examen. Réessaie.' }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => { root.render(<MemoryRouter><ExamLabs /></MemoryRouter>) })
    await act(async () => { required([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Examen test'))).click() })
    expect(host.textContent).toContain('Impossible de préparer l’examen. Réessaie.')
    await act(async () => { required([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Retour aux examens'))).click() })
    expect(host.textContent).toContain('Commencer cet examen')
  } finally {
    stream.event = null
    act(() => root.unmount())
    host.remove()
  }
})

test('une panne de connexion invite à réessayer sans afficher une erreur technique', async () => {
  stream.event = { type: 'error', error: 'stream_error' }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => { root.render(<MemoryRouter><ExamLabs /></MemoryRouter>) })
    await act(async () => { required([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Examen test'))).click() })
    expect(host.textContent).toContain('Impossible de préparer l’examen. Réessaie.')
    expect(host.textContent).not.toContain('stream_error')
  } finally {
    stream.event = null
    act(() => root.unmount())
    host.remove()
  }
})
