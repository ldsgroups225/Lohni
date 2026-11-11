import { expect, test } from 'vitest'
import parseRequestTarget from './request-url.js'

test('préserve le chemin brut et les paramètres répétés des requêtes HTTP', () => {
  const parsed = parseRequestTarget('/cours/../profil?tag=a&tag=b&nom=deux+mots')
  expect(parsed.pathname).toBe('/cours/../profil')
  expect(parsed.query).toMatchObject({ tag: ['a', 'b'], nom: 'deux mots' })
})

test('accepte les cibles absolues et conserve les doubles barres des chemins relatifs à l’origine', () => {
  expect(parseRequestTarget('http://localhost:5000/cours?x=1').pathname).toBe('/cours')
  expect(parseRequestTarget('//cours/chapitre').pathname).toBe('//cours/chapitre')
  expect(() => parseRequestTarget('http://[invalide')).toThrow()
})
