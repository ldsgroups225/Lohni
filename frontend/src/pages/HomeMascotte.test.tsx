import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {} }))
import Home from './Home'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../lib/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

test.each([[0, 0, false, 'au repos'], [0, 12, false, 'au repos'], [0, 12, true, 'endormie'], [2, 12, true, 'contente']])('accueil : humeur pour %s jours et %s XP', (streak, xp, streakStarted, humeur) => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: null }, { streak, xp, streakStarted, subjects: [] }, false, '', '', 0, null, null]
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
})

test.each([
  [null, null, true, '', ''],
  [null, null, false, '', ''],
  [null, null, false, 'Erreur', ''],
])('accueil : le logo mobile est présent sans menu inactif', (home, progress, loading, error, progressError) => {
  state.values = [home, progress, loading, error, progressError, 0, null, null, {}, '3e', '', [], '', 'Mathématiques', '', false, '']
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  if (home || loading || error) expect(html).toMatch(/<header class="[^"]*lg:hidden[^"]*">.*?mascotte\/corps\.webp.*?Lohni<\/span>/)
  else expect(html).not.toContain('lg:hidden')
  expect(html).not.toContain('aria-label="Menu"')
})

test('accueil chargé : seule la mascotte de bienvenue est affichée', () => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: null }, null, false, '', '', 0, null, null]
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).not.toContain('lg:hidden bg-surface')
  expect(html).toContain('aria-label="Lohni, au repos"')
})

test('accueil : une ligne de contexte avec l’examen en lien, et seules les matières avec chapitre', () => {
  const subjects = [{ subjectId: 'm', name: 'Maths', mastery: 50, status: 'En route' }, { subjectId: 'f', name: 'Français', mastery: null, status: '' }]
  const chapters = [{ id: 'c', subjectId: 'm', subject: 'Maths', title: 'Fractions', status: 'En cours', mastery: 50, seenCards: 1, cards: [{}, {}] }]
  state.values = [{ profile: { schoolClass: 'Terminale', series: 'D' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: 30, nextExam: { id: 'e1', title: 'BAC blanc' } }, { streak: 2, xp: 1, streakStarted: true, subjects }, false, '', '', 0, chapters, null]
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).toMatch(/Terminale D · <a[^>]*href="\/plan#exam-e1"[^>]*>BAC blanc dans 30 jours<\/a>/)
  expect(html).toContain('Maths')
  expect(html).not.toContain('Français')
  expect(html).not.toContain('Pas encore révisée')
})

test('accueil : sans aucun chapitre, « Tes matières » disparaît', () => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'empty', totalCards: 0, cardCount: 0, daysUntilExam: null }, { streak: 0, xp: 0, streakStarted: false, subjects: [{ subjectId: 'm', name: 'Maths', mastery: null, status: '' }] }, false, '', '', 0, [], null]
  expect(renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)).not.toContain('Tes matières')
})
