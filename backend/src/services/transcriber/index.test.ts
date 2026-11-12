import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create, invoke, clientOptions } = vi.hoisted(() => ({ create: vi.fn(), invoke: vi.fn(), clientOptions: [] as any[] }))
vi.mock('openai', () => ({
  OpenAI: vi.fn(function (this: any, opts: any) {
    clientOptions.push(opts)
    this.audio = { transcriptions: { create } }
  }),
}))
vi.mock('../../utils/llm/llm', () => ({ default: { invoke } }))
vi.mock('node:fs', async (orig) => ({ ...(await orig<typeof import('node:fs')>()), default: { ...(await orig<typeof import('node:fs')>()), createReadStream: vi.fn(() => 'stream') } }))

import { transcribeAudio } from '.'

const longText = 'Aujourd’hui nous étudions la photosynthèse, le processus par lequel les plantes fabriquent leur matière.'

describe('transcribeAudio', () => {
  beforeEach(() => { create.mockReset(); invoke.mockReset(); clientOptions.length = 0 })

  it('transcrit en français via OpenRouter et renvoie les fiches générées', async () => {
    create.mockResolvedValue({ text: longText })
    invoke.mockResolvedValue({ content: '```json\n{"summary":"Résumé","keyPoints":["P1"],"topics":["Biologie"],"categories":["SVT"],"searchableKeywords":["chlorophylle"],"studyGuide":{"mainConcepts":["C1"],"importantTerms":[{"term":"T","definition":"D"}],"questions":["Q ?"],"takeaways":["À retenir"]}}\n```' })

    const result = await transcribeAudio('/tmp/a.webm')

    expect(clientOptions[0]).toMatchObject({ baseURL: 'https://openrouter.ai/api/v1' })
    expect(create).toHaveBeenCalledWith({ file: 'stream', model: 'openai/gpt-4o-mini-transcribe', language: 'fr' })
    expect(result.text).toBe(longText)
    expect(result.studyMaterials).toEqual({
      summary: 'Résumé', keyPoints: ['P1'], topics: ['Biologie'], categories: ['SVT'], searchableKeywords: ['chlorophylle'],
      studyGuide: { mainConcepts: ['C1'], importantTerms: [{ term: 'T', definition: 'D' }], questions: ['Q ?'], takeaways: ['À retenir'] },
    })
  })

  it('renvoie la transcription sans fiches si leur génération échoue', async () => {
    create.mockResolvedValue({ text: longText })
    invoke.mockRejectedValue(new Error('402'))
    const result = await transcribeAudio('/tmp/a.webm')
    expect(result).toEqual({ text: longText })
  })

  it('ne génère pas de fiches pour une transcription trop courte', async () => {
    create.mockResolvedValue({ text: 'Bonjour.' })
    const result = await transcribeAudio('/tmp/a.webm')
    expect(result).toEqual({ text: 'Bonjour.' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('traduit l’échec du service en message français', async () => {
    create.mockRejectedValue(new Error('401 invalid key'))
    await expect(transcribeAudio('/tmp/a.webm')).rejects.toThrow('La transcription a échoué. Réessaie dans un instant.')
  })
})
