import { describe, expect, test } from 'vitest'
import { generateStructured, StructuredOutputError, toText } from '../structured'

// Faux modèle scripté : rend les réponses dans l'ordre et garde les appels reçus.
function scripted(...replies: Array<unknown>) {
  const calls: Array<{ messages: any[]; options: any }> = []
  const answer = async (messages: any[], options: any) => {
    calls.push({ messages, options })
    const next = replies.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { model: { invoke: answer, call: answer } as any, calls }
}

const messages = [{ role: 'user' as const, content: 'donne-moi une liste' }]
const strict = [{ role: 'user' as const, content: 'STRICT' }]
const numbers = (v: unknown) => (Array.isArray(v) && v.length && v.every(n => typeof n === 'number') ? (v as number[]) : null)

describe('generateStructured', () => {
  test('rend la valeur validée et demande toujours reasoning none', async () => {
    const { model, calls } = scripted({ content: '[1,2,3]' })
    expect(await generateStructured({ model, messages, shape: 'array', validate: numbers })).toEqual([1, 2, 3])
    expect(calls).toHaveLength(1)
    expect(calls[0].options.reasoning).toBe('none')
  })

  test('keepReasoning: true ne transmet pas reasoning au modèle', async () => {
    const { model, calls } = scripted('[1]')
    await generateStructured({ model, messages, shape: 'array', validate: numbers, keepReasoning: true })
    expect('reasoning' in calls[0].options).toBe(false)
  })

  test('retire les balises de code et le texte autour', async () => {
    const { model } = scripted('Voici :\n```json\n[4,5]\n```')
    expect(await generateStructured({ model, messages, shape: 'array', validate: numbers })).toEqual([4, 5])
  })

  test('extrait un objet entouré de prose', async () => {
    const { model } = scripted({ content: [{ text: 'Réponse : {"a":1} merci' }] })
    expect(await generateStructured({ model, messages, shape: 'object', validate: v => v as { a: number } })).toEqual({ a: 1 })
  })

  test('une réponse tronquée est récupérée par le repli du service', async () => {
    const { model, calls } = scripted('{"answer":"début')
    const out = await generateStructured({ model, messages, shape: 'object', validate: () => null, salvage: raw => ({ salvaged: raw }) })
    expect(out).toEqual({ salvaged: '{"answer":"début' })
    expect(calls).toHaveLength(1)
  })

  test('invalide puis valide : le second essai utilise la consigne stricte', async () => {
    const { model, calls } = scripted('[1,"x"', '[7]')
    const out = await generateStructured({ model, messages, retryMessages: strict, shape: 'array', validate: numbers })
    expect(out).toEqual([7])
    expect(calls[0].messages).toBe(messages)
    expect(calls[1].messages).toBe(strict)
  })

  test('invalide deux fois : erreur claire en français avec la dernière réponse', async () => {
    const { model, calls } = scripted('rien', 'toujours rien')
    const error = await generateStructured({ model, messages, shape: 'array', validate: numbers }).catch(e => e)
    expect(error).toBeInstanceOf(StructuredOutputError)
    expect(error.message).toMatch(/réponse exploitable/)
    expect(error.raw).toBe('toujours rien')
    expect(calls).toHaveLength(2)
  })

  test('attempts: 1 ne réessaie pas', async () => {
    const { model, calls } = scripted('rien', '[1]')
    await expect(generateStructured({ model, messages, shape: 'array', validate: numbers, attempts: 1 })).rejects.toBeInstanceOf(StructuredOutputError)
    expect(calls).toHaveLength(1)
  })

  test('une erreur du modèle ou une annulation remonte telle quelle', async () => {
    const boom = new Error('provider down')
    const { model } = scripted(boom)
    await expect(generateStructured({ model, messages, shape: 'array', validate: numbers })).rejects.toBe(boom)
    const controller = new AbortController()
    controller.abort(new Error('annulé'))
    await expect(generateStructured({ model: scripted('[1]').model, messages, shape: 'array', validate: numbers, signal: controller.signal })).rejects.toThrow('annulé')
  })

  test('toText lit chaînes, contenus par morceaux et générations', () => {
    expect(toText('a')).toBe('a')
    expect(toText({ content: [{ text: 'a' }, 'b'] })).toBe('ab')
    expect(toText({ generations: [{ text: 'g' }] })).toBe('g')
    expect(toText(null)).toBe('')
  })
})
