import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'

test.each([
  ['/', 'Accueil'], ['/revision', 'Accueil'], ['/courses', 'Cours'], ['/import', 'Cours'],
  ['/tutor', 'Tuteur'], ['/chat', 'Tuteur'], ['/me', 'Moi'],
])('la navigation indique la page active pour %s', (path, active) => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>)
  expect(html).toContain('aria-label="Navigation principale"')
  for (const [href, label] of [['/', 'Accueil'], ['/courses', 'Cours'], ['/tutor', 'Tuteur'], ['/me', 'Moi']]) {
    expect(html).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${'.*?'}${label}</a>`))
    expect(html).toMatch(new RegExp(`<a[^>]*${label === active ? 'aria-current="page"' : 'href="' + href + '"'}[^>]*>.*?${label}</a>`))
  }
  expect(html.match(/aria-current="page"/g)).toHaveLength(1)
})
