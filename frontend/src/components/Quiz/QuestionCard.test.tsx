import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import QuestionCard from './QuestionCard'

test('ne rend pas le HTML ajouté à une question', () => {
  const question = { id: 1, question: 'Question', options: ['Réponse'], correct: 0, hint: '', explanation: '', imageHtml: '<img src=x onerror=alert(1)>' }
  const html = renderToStaticMarkup(<QuestionCard q={question} selected={null} showExp={false} showHint={false} onSelect={() => {}} onHint={() => {}} onNext={() => {}} isLast />)
  expect(html).not.toContain('<img')
  expect(html).not.toContain('onerror')
})

test('les réponses utilisent des boutons radio natifs, même si leurs textes sont identiques', () => {
  const question = { id: 1, question: 'Question', options: ['Même texte', 'Même texte'], correct: 0, hint: '', explanation: '' }
  const html = renderToStaticMarkup(<QuestionCard q={question} selected={null} showExp={false} showHint={false} onSelect={() => {}} onHint={() => {}} onNext={() => {}} isLast />)
  expect(html.match(/type="radio"/g)).toHaveLength(2)
  expect(html).toContain('Choisis ta réponse')
})
