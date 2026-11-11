// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import QuestionCard from './QuestionCard'

test('ne rend pas le HTML ajouté à une question', () => {
  const question = { id: 1, question: 'Question', options: ['Réponse'], correct: 0, hint: '', explanation: '', imageHtml: '<img src=x onerror=alert(1)>' }
  const html = renderToStaticMarkup(<QuestionCard q={question} selected={null} showExp={false} showHint={false} onSelect={() => {}} onHint={() => {}} onNext={() => {}} isLast />)
  expect(html).not.toContain('<img')
  expect(html).not.toContain('onerror')
})

test('les réponses restent distinctes même si leurs textes sont identiques', () => {
  const question = { id: 1, question: 'Question', options: ['Même texte', 'Même texte'], correct: 0, hint: '', explanation: '' }
  const html = renderToStaticMarkup(<QuestionCard q={question} selected={null} showExp={false} showHint={false} onSelect={() => {}} onHint={() => {}} onNext={() => {}} isLast />)
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(2)
  expect(html).toContain('Choisis ta réponse')
})

test('les flèches ne répondent pas, un clic répond une fois et verrouille les choix', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const question = { id: 1, question: 'Question', options: ['Une', 'Deux'], correct: 0, hint: '', explanation: '' }
  const onSelect = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (selected: number | null, showExp: boolean) => <QuestionCard q={question} selected={selected} showExp={showExp} showHint={false} onSelect={onSelect} onHint={() => {}} onNext={() => {}} isLast />
  const scroll = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  try {
    await act(async () => root.render(render(null, false)))
    const options = host.querySelectorAll<HTMLButtonElement>('#answerOptions button')
    expect(options).toHaveLength(2)
    options[0].focus()
    await act(async () => options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(onSelect).not.toHaveBeenCalled()
    await act(async () => options[1].click())
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(1)
    await act(async () => root.render(render(1, true)))
    expect([...options].every(option => option.disabled)).toBe(true)
    await act(async () => options[0].click())
    expect(onSelect).toHaveBeenCalledOnce()
  } finally {
    act(() => root.unmount())
    host.remove()
    Element.prototype.scrollIntoView = scroll
  }
})
