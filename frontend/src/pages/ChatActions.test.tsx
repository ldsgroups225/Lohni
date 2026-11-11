// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import ActionRow from '../components/Chat/ActionRow'

test('les actions réservent une place au compagnon sur téléphone et sur ordinateur', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<ActionRow />)
  const actions = host.querySelector('button')!.parentElement!
  expect(actions.classList.contains('pr-16')).toBe(true)
  expect(actions.classList.contains('md:pr-52')).toBe(true)
  expect([...host.querySelectorAll('button')].map(button => button.textContent)).toContain('Faire un quiz')
})
