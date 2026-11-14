import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { SessionRecap } from './SessionRecap'
import type { RevisionSession } from '../../lib/api'

vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
const base = { id: '1', localDate: '', cards: [], position: 4, complete: true, repeated: [], elapsedMs: 0, earnedXP: 20 } as RevisionSession
const html = (summary?: RevisionSession['summary'], pending = 0) => renderToString(
  <MemoryRouter><SessionRecap session={{ ...base, summary }} progress={{ streak: 2, xp: 50 } as never} chapters={[]} pending={pending} moreCards={false} busy={false} online onExplain={() => {}} onContinue={() => {}} /></MemoryRouter>).replace(/<!-- -->/g, '')
const missed = (n: number) => Array.from({ length: n }, (_, i) => ({ cardId: `c${i}`, question: `Q${i}`, kind: 'mcq' as const }))

test('quiz et flashcards séparés, sans « correctes » pour les flashcards', () => {
  const out = html({ quiz: { total: 4, correct: 3 }, flashcards: { total: 5, knew: 2 }, missed: missed(5) })
  expect(out).toContain('bonnes réponses')
  expect(out).toContain('75')
  expect(out).toContain('auto-évaluation')
  expect(out).toContain('à revoir')
  expect(out).toContain('+2 autres')
  expect(out).not.toContain('correctes')
  expect(out.match(/Explique-moi/g)).toHaveLength(3)
})
test('quiz seul : pas de bloc flashcards', () => {
  const out = html({ quiz: { total: 2, correct: 2 }, flashcards: { total: 0, knew: 0 }, missed: [] })
  expect(out).toContain('Quiz')
  expect(out).not.toContain('Flashcards')
  expect(out).not.toContain('À revoir')
})
test('sans résumé : texte simple, aucune statistique', () => {
  const out = html(undefined, 1)
  expect(out).toContain('4 réponses enregistrées sur cet appareil')
  expect(out).not.toContain('Quiz')
  expect(out).not.toContain('de série')
})


test('bilan affiche les données de la séance et les chapitres concernés', () => {
  const session = { ...base, localDate: '2026-11-12', cards: [{ id: 'c0', chapterId: 'chap', kind: 'mcq' }] } as RevisionSession
  const out = renderToString(<MemoryRouter><SessionRecap session={{ ...session, summary: { quiz: { total: 1, correct: 0 }, flashcards: { total: 0, knew: 0 }, missed: missed(1) } }} progress={{ streak: 4, xp: 123, completedDates: ['2026-11-09', '2026-11-12'], subjects: [], learnedCards: 1, streakStarted: true }} chapters={[{ id: 'chap', title: 'Les fractions', status: 'Fragile', subject: 'Maths', subjectId: 'm', summary: '', origin: 'import', cards: [], seenCards: 1, mastery: 20 }]} pending={0} moreCards={false} busy={false} online onExplain={() => {}} onContinue={() => {}} /></MemoryRouter>).replace(/<!-- -->/g, '')
  expect(out).toContain('Les fractions')
  expect(out).toContain('Fragile')
  expect(out).toContain('4 jours de suite')
  expect(out).toContain('2026-11-12 : séance terminée')
  expect(out).toContain('Revoir la carte maintenant')
  expect(out).toContain('Cette option n’est pas encore disponible.')
})
