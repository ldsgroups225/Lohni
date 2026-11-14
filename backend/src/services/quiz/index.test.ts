import { beforeEach, expect, test, vi } from 'vitest'
import { REVISION_POLICY as policy } from '../revision/policy'
import { handleQuiz } from './index'
import llm from '../../utils/llm/llm'

vi.mock('../../utils/llm/llm', () => ({ default: { invoke: vi.fn() } }))

beforeEach(() => { vi.mocked(llm.invoke).mockReset() })

const quiz = () => Array.from({ length: policy.generatedMCQCards }, (_, index) => ({
  id: index + 1,
  question: String.raw`Quelle est la valeur de **la fraction** $\frac{1}{2}$ ?`,
  options: [String.raw`$\frac{1}{2}$`, '$0$', '$1$', '$2$'],
  correct: 1,
  hint: 'Divise le numérateur par le dénominateur.',
  explanation: String.raw`On obtient **un demi** : $$\frac{1}{2}=0{,}5$$.`,
}))

test('un QCM JSON conserve le Markdown et les antislashs LaTeX sans numéroter les options', async () => {
  const expected = quiz()
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(expected) } as any)
  expect(await handleQuiz('Fractions', 'fr')).toEqual(expected)
})

test.each(['not JSON', '[]', '{}', '[{"question":"incomplète"}]'])('une sortie QCM invalide après nouvelle tentative est rejetée : %s', async output => {
  vi.mocked(llm.invoke).mockResolvedValue({ content: output } as any)
  await expect(handleQuiz('Fractions', 'fr')).rejects.toThrow('Invalid quiz JSON from model')
})

test('la nouvelle tentative accepte un QCM LaTeX valide après un JSON invalide', async () => {
  const expected = quiz()
  vi.mocked(llm.invoke)
    .mockResolvedValueOnce({ content: 'not JSON' } as any)
    .mockResolvedValueOnce({ content: JSON.stringify(expected) } as any)
  expect(await handleQuiz('Fractions', 'fr')).toEqual(expected)
})

test('les anciens préfixes renvoyés par le modèle sont retirés sans altérer les formules', async () => {
  const expected = quiz()
  const prefixed = expected.map(item => ({ ...item, options: item.options.map((option, i) => `${i + 1}) ${option}`) }))
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(prefixed) } as any)
  expect(await handleQuiz('Fractions', 'fr')).toEqual(expected)
})

test('les paragraphes Markdown et les variables mathématiques sensibles à la casse sont conservés avec leur index correct', async () => {
  const expected = quiz().map(item => ({
    ...item,
    question: '**Choisis la variable minuscule.**\n\nDistingue les majuscules des minuscules.',
    options: ['$A$', '$a$', '$B$', '$b$'],
    correct: 2,
    explanation: String.raw`**La minuscule est $a$.**

$$
\frac{a}{A}
$$`,
  }))
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(expected) } as any)
  expect(await handleQuiz('Variables', 'fr')).toEqual(expected)
})

test('seuls les champs QCM autorisés sont transmis au navigateur', async () => {
  const expected = quiz()
  const extra = expected.map(item => ({ ...item, imageHtml: '<img src=x onerror=alert(1)>', unexpected: 'ignored' }))
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(extra) } as any)
  expect(await handleQuiz('Fractions', 'fr')).toEqual(expected)
})

test('accepte la clé française explication et désactive le raisonnement', async () => {
  const expected = quiz()
  const french = expected.map(({ explanation, ...item }) => ({ ...item, explication: explanation }))
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(french) } as any)
  expect(await handleQuiz('Fractions', 'fr')).toEqual(expected)
  expect(llm.invoke).toHaveBeenCalledWith(expect.any(Array), { reasoning: 'none' })
})
