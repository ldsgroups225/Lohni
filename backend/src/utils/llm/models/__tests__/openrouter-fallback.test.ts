import { describe, it, expect, vi } from 'vitest'

const calls: { model: string; reasoning: unknown; invoke: ReturnType<typeof vi.fn> }[] = []
vi.mock('@langchain/openai', () => {
  const ChatOpenAI = vi.fn(function (this: any, opts: any) {
    this.invoke = vi.fn()
    calls.push({ model: opts.model, reasoning: opts.modelKwargs?.reasoning, invoke: this.invoke })
  })
  return { ChatOpenAI, OpenAIEmbeddings: vi.fn() }
})

import { makeLLM } from '../openrouter'

const client = (model: string, reasoning: boolean) => {
  const found = calls.find(c => c.model === model && !!c.reasoning === reasoning)
  if (!found) throw new Error(`client absent : ${model}`)
  return found
}

describe('openrouter fallback', () => {
  it('essaie chaque modèle dans l’ordre jusqu’à une réponse', async () => {
    calls.length = 0
    const llm = makeLLM({ openrouter_model: 'a/haiku, b/deepseek ,openrouter/free' })
    expect(calls.filter(c => !c.reasoning).map(c => c.model)).toEqual(['a/haiku', 'b/deepseek', 'openrouter/free'])
    calls[0].invoke.mockRejectedValue(new Error('402 credits'))
    calls[1].invoke.mockRejectedValue(new Error('402 credits'))
    calls[2].invoke.mockResolvedValue({ content: 'ok' })
    await expect(llm.invoke([{ role: 'user', content: 'x' }])).resolves.toEqual({ content: 'ok' })
    expect(calls[2].invoke).toHaveBeenCalledOnce()
  })

  it('relance la dernière erreur si tous les modèles échouent', async () => {
    calls.length = 0
    const llm = makeLLM({ openrouter_model: 'a/x,b/y' })
    calls[0].invoke.mockRejectedValue(new Error('first'))
    calls[1].invoke.mockRejectedValue(new Error('last'))
    await expect(llm.invoke([{ role: 'user', content: 'x' }])).rejects.toThrow('last')
  })
})

it('utilise le client sans raisonnement seulement sur demande', async () => {
  calls.length = 0
  const llm = makeLLM({ openrouter_model: 'a/x' })
  const normal = client('a/x', false)
  const disabled = client('a/x', true)
  expect(disabled.reasoning).toEqual({ effort: 'none' })
  normal.invoke.mockResolvedValue('normal')
  disabled.invoke.mockResolvedValue('disabled')
  await expect(llm.invoke([], { reasoning: 'none' })).resolves.toBe('disabled')
  await expect(llm.call([])).resolves.toBe('normal')
})

it('reprend le même modèle si le raisonnement est obligatoire', async () => {
  calls.length = 0
  const llm = makeLLM({ openrouter_model: 'a/x,b/y' })
  client('a/x', true).invoke.mockRejectedValue(Object.assign(new Error('Reasoning is mandatory for this endpoint'), { status: 400 }))
  const normal = client('a/x', false)
  normal.invoke.mockResolvedValue('ok')
  await expect(llm.call([], { reasoning: 'none' })).resolves.toBe('ok')
  expect(normal.invoke).toHaveBeenCalledOnce()
  expect(client('b/y', true).invoke).not.toHaveBeenCalled()
})

it('passe au modèle suivant pour les autres erreurs', async () => {
  calls.length = 0
  const llm = makeLLM({ openrouter_model: 'a/x,b/y' })
  client('a/x', true).invoke.mockRejectedValue(new Error('autre erreur'))
  client('b/y', true).invoke.mockResolvedValue('ok')
  await expect(llm.invoke([], { reasoning: 'none' })).resolves.toBe('ok')
  expect(client('a/x', false).invoke).not.toHaveBeenCalled()
})
