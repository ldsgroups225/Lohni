import { beforeEach, expect, test, vi } from 'vitest'
import { makeScript } from './index'
import llm from '../../utils/llm/llm'

vi.mock('../../utils/llm/llm', () => ({ default: { invoke: vi.fn() } }))

beforeEach(() => { vi.mocked(llm.invoke).mockReset() })

const script = { title: 'La photosynthèse', summary: 'Résumé', segments: [{ spk: 'A', md: 'Bonjour !' }, { spk: 'B', md: 'Salut !' }] }

test('un script tronqué est redemandé au lieu d’être remplacé par un faux script', async () => {
  vi.mocked(llm.invoke)
    .mockResolvedValueOnce({ content: '{ "title": "La photosynthèse", "segments": [ {"spk":"A","md":"Bon' } as any)
    .mockResolvedValue({ content: JSON.stringify(script) } as any)
  expect(await makeScript('La photosynthèse', 'La photosynthèse')).toEqual(script)
})

test('le script est demandé en français, en texte parlé sans Markdown', async () => {
  vi.mocked(llm.invoke).mockResolvedValue({ content: JSON.stringify(script) } as any)
  await makeScript('La photosynthèse', 'La photosynthèse')
  const system = String((vi.mocked(llm.invoke).mock.calls[0][0] as any)[0].content)
  expect(system).toMatch(/in French/)
  expect(system).not.toMatch(/Use markdown/)
})

test('un script toujours invalide échoue avec un message en français', async () => {
  vi.mocked(llm.invoke).mockResolvedValue({ content: 'pas de JSON' } as any)
  await expect(makeScript('La photosynthèse', 'La photosynthèse')).rejects.toThrow(/podcast/i)
})

test('une panne du modèle est journalisée et expliquée en français', async () => {
  const cause = new Error('provider HTTP 402')
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    vi.mocked(llm.invoke).mockRejectedValue(cause)
    await expect(makeScript('Sujet')).rejects.toThrow('Le script du podcast n’a pas pu être généré. Réessaie.')
    expect(log).toHaveBeenCalledWith(expect.any(String), cause)
  } finally { log.mockRestore() }
})
