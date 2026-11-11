import { expect, test } from 'vitest'
import { salvageTruncatedJson } from '../ask'

test('une réponse JSON coupée par la limite de jetons garde le texte lisible et les cartes complètes', () => {
  const cut = '{"topic": "La photosynthèse", "answer": "# Titre\\n\\nLes plantes **fabriquent** du sucre.\\n\\n## Suite\\nElle utilise le CO₂ de l\'air", "flashcards": [{"q": "Que produit la photosynthèse ?", "a": "Du sucre et du dioxygène.", "tags": ["a"]}, {"q": "Pourquoi les feuilles sont vertes ?", "a": "La chloro'
  const out = salvageTruncatedJson(cut, 'Sujet')
  expect(out?.topic).toBe('La photosynthèse')
  expect(out?.answer).toContain('# Titre\n\nLes plantes **fabriquent** du sucre.')
  expect(out?.answer).not.toContain('"topic"')
  expect(out?.flashcards).toEqual([{ q: 'Que produit la photosynthèse ?', a: 'Du sucre et du dioxygène.', tags: ['a'] }])
})

test('une réponse coupée au milieu de l’answer est récupérée sans carte', () => {
  const out = salvageTruncatedJson('{"topic": "T", "answer": "Début de réponse coupée au milieu d\\', 'Sujet')
  expect(out?.answer).toBe('Début de réponse coupée au milieu d')
  expect(out?.flashcards).toEqual([])
})

test('un texte sans champ answer n’est pas récupéré', () => {
  expect(salvageTruncatedJson('juste du texte', 'Sujet')).toBeNull()
})
