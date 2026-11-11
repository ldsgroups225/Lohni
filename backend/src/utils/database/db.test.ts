import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@langchain/core/documents'
import { expect, it } from 'vitest'
import { getRetriever, saveDocuments } from './db'

it('retrieves saved documents and refreshes the cache when replaced', async () => {
  const previous = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'lohni-documents-'))
  const embeddings = {
    embedDocuments: async (texts: string[]) => texts.map(() => [1, 0]),
    embedQuery: async () => [1, 0],
  }
  try {
    process.chdir(dir)
    await saveDocuments('test', [new Document({ pageContent: 'premier' })], embeddings)
    expect((await (await getRetriever('test', embeddings)).invoke('question'))[0].pageContent).toBe('premier')
    await saveDocuments('test', [new Document({ pageContent: 'second' })], embeddings)
    expect((await (await getRetriever('test', embeddings)).invoke('question'))[0].pageContent).toBe('second')
  } finally {
    process.chdir(previous)
    rmSync(dir, { recursive: true, force: true })
  }
})
