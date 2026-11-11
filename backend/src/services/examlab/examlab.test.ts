import { beforeEach, expect, test, vi } from 'vitest'
import { loadAllExams } from './loader'
import { generateSectionItems } from './generator'
import { handleExam } from './generate'
import llm from '../../utils/llm/llm'

vi.mock('../../utils/llm/llm', () => ({ default: { invoke: vi.fn() } }))

beforeEach(() => { vi.mocked(llm.invoke).mockReset() })

test('les examens livrés sont des examens blancs ivoiriens en français', () => {
  const exams = loadAllExams()
  expect(exams.map(e => e.id).sort()).toEqual(['bac-d', 'bepc'])
  for (const exam of exams) {
    expect(exam.sections.length).toBeGreaterThan(0)
    for (const section of exam.sections) expect(section.gen.prompt).toMatch(/programme ivoirien/)
  }
})

test('les questions sont demandées en français et gardent leurs accents', async () => {
  const item = { id: 1, question: 'Quelle est la dérivée de x² ?', options: ['A) 2x', 'B) x', 'C) x²', 'D) 2'], correct: 1, hint: 'Règle de la puissance.', explanation: 'On abaisse l’exposant : 2x.' }
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify([item]) } as any)
  const [out] = await generateSectionItems({ type: 'mcq', count: 1, prompt: `Mathématiques, programme ivoirien ${Math.random()}` }, 'seed')
  const system = String((vi.mocked(llm.invoke).mock.calls[0][0] as any)[0].content)
  expect(system).toMatch(/en français/)
  expect(system).not.toMatch(/ASCII|plain English/)
  expect(out.question).toBe(item.question)
  expect(out.explanation).toBe(item.explanation)
})

test('une réponse vide du modèle échoue sans inventer ni mettre en cache de fausses questions', async () => {
  const gen = { type: 'mcq' as const, count: 2, prompt: `SVT, programme ivoirien ${Math.random()}` }
  vi.mocked(llm.invoke).mockResolvedValue({ content: '' } as any)
  await expect(generateSectionItems(gen, 'seed')).rejects.toThrow()

  const items = [1, 2].map(id => ({ id, question: `Quel organe filtre le sang ? (${id})`, options: ['A) Le rein', 'B) Le cœur', 'C) Le foie', 'D) La peau'], correct: 1, hint: 'Pense à l’urine.', explanation: 'Le rein filtre le sang et produit l’urine.' }))
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(items) } as any)
  expect((await generateSectionItems(gen, 'seed')).map(q => q.question)).toEqual(items.map(q => q.question))
})

test('un QCM incomplet n’est pas complété par des options inventées', async () => {
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify([{ id: 1, question: 'Quelle est la capitale de la Côte d’Ivoire ?', options: ['A) Yamoussoukro', 'B) Abidjan'], correct: 1, hint: 'Capitale politique.', explanation: 'Yamoussoukro est la capitale politique.' }]) } as any)
  await expect(generateSectionItems({ type: 'mcq', count: 1, prompt: `Géographie ${Math.random()}` }, 'seed')).rejects.toThrow()
})

test('chaque génération de section demande de nouvelles questions au modèle', async () => {
  const gen = { type: 'mcq' as const, count: 1, prompt: `Sciences ${Math.random()}` }
  const item = { id: 1, question: 'Quel organe filtre le sang ?', options: ['A) Le rein', 'B) Le cœur', 'C) Le foie', 'D) La peau'], correct: 1, hint: 'Pense à l’urine.', explanation: 'Le rein filtre le sang et produit l’urine.' }
  vi.mocked(llm.invoke)
    .mockResolvedValueOnce({ content: JSON.stringify([item]) } as any)
    .mockResolvedValueOnce({ content: JSON.stringify([{ ...item, question: 'Quel organe pompe le sang ?' }]) } as any)
  expect((await generateSectionItems(gen, 'premier'))[0].question).toBe(item.question)
  expect((await generateSectionItems(gen, 'second'))[0].question).toBe('Quel organe pompe le sang ?')
})

test('chaque lancement du même examen génère un nouvel examen blanc', async () => {
  let generation = 0
  vi.mocked(llm.invoke).mockImplementation(async (messages: any) => {
    const count = Number(String(messages[0].content).match(/exactement (\d+) questions/)![1])
    generation++
    return { content: JSON.stringify(Array.from({ length: count }, (_, i) => ({
      id: i + 1, question: `Quelle est la réponse de la génération ${generation} ?`,
      options: ['A) Le rein', 'B) Le cœur', 'C) Le foie', 'D) La peau'], correct: 1,
      hint: 'Pense à ton cours.', explanation: 'La bonne réponse est celle du cours.'
    }))) } as any
  })
  const first = await handleExam('bepc')
  const second = await handleExam('bepc')
  expect(second.sections[0].items[0].question).not.toBe(first.sections[0].items[0].question)
})

test('un QCM sans réponse correcte identifiable est rejeté', async () => {
  const item = { question: 'Quelle est la capitale de la Côte d’Ivoire ?', options: ['A) Yamoussoukro', 'B) Abidjan', 'C) Bouaké', 'D) Korhogo'], hint: 'Capitale politique.', explanation: 'Yamoussoukro est la capitale politique.' }
  for (const correct of [undefined, 'inconnue', 2.5]) {
    vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify([{ ...item, correct }]) } as any)
    await expect(generateSectionItems({ type: 'mcq', count: 1, prompt: 'Géographie' }, 'seed')).rejects.toThrow()
  }
})

test('un QCM aux options répétées ne décale pas la réponse correcte', async () => {
  const item = { question: 'Quelle est la capitale de la Côte d’Ivoire ?', options: ['A) Abidjan', 'B) Abidjan', 'C) Yamoussoukro', 'D) Bouaké', 'E) Korhogo'], correct: 3, hint: 'Capitale politique.', explanation: 'Yamoussoukro est la capitale politique.' }
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify([item]) } as any)
  await expect(generateSectionItems({ type: 'mcq', count: 1, prompt: 'Géographie' }, 'seed')).rejects.toThrow()
})
