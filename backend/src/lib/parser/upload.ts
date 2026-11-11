import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Busboy from 'busboy'
import { extractText } from './extract'
import { embedTextFromFile } from '../ai/embed'
import { OllamaEmbeddings } from '@langchain/ollama'
import { OpenAIEmbeddings } from '@langchain/openai'

const str = path.join(process.cwd(), 'storage', 'uploads')
if (!fs.existsSync(str)) fs.mkdirSync(str, { recursive: true })

export type UpFile = { path: string; filename: string; mimeType: string }

export function parseMultipart(req: any, options?: { directory: string; limits: { files: number; fileSize: number; fields: number; fieldSize: number } }): Promise<{ q: string; chatId?: string; files: UpFile[] }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: options?.limits })
    let q = ''
    let chatId = ''
    const files: UpFile[] = []
    let pending = 0
    let ended = false
    let failed = false
    const done = () => { if (!failed && ended && pending === 0) resolve({ q, chatId: chatId || undefined, files }) }

    bb.on('field', (n, v, info) => {
      if (info.valueTruncated) { failed = true; reject(new Error('Les informations du fichier sont trop longues.')) }
      if (n === 'q') q = v
      if (n === 'chatId') chatId = v
    })
    bb.on('filesLimit', () => { failed = true; reject(new Error('Choisis un seul fichier par import.')) })
    bb.on('fieldsLimit', () => { failed = true; reject(new Error('Trop de champs dans cet import.')) })
    bb.on('file', (_n, file, info: any) => {
      pending++
      const filename = info?.filename || 'file'
      const mimeType = info?.mimeType || info?.mime || 'application/octet-stream'
      const fp = path.join(options?.directory ?? str, `${randomUUID()}-${path.basename(filename)}`)
      const ws = fs.createWriteStream(fp)
      file.on('limit', () => { failed = true; reject(new Error('Le fichier dépasse la limite de 10 Mo.')) })
      file.on('error', e => { failed = true; reject(e) })
      ws.on('error', e => { failed = true; reject(e) })
      ws.on('finish', () => { files.push({ path: fp, filename, mimeType }); pending--; done() })
      file.pipe(ws)
    })
    bb.on('error', e => { failed = true; reject(e) })
    bb.on('finish', () => { ended = true; done() })
    req.on('aborted', () => { failed = true; reject(new Error('Import interrompu. Réessaie.')) })
    req.pipe(bb)
  })
}

export async function handleUpload(a: { filePath: string; filename?: string; contentType?: string; namespace?: string }): Promise<{ stored: string }> {
  const fp = a.filePath
  const mime = a.contentType || ''
  const ns = a.namespace || 'pagelm'
  const txt = await extractText(fp, mime)
  if (!txt?.trim()) throw new Error('No valid content extracted from file.')
  const out = `${fp}.txt`
  fs.writeFileSync(out, txt)
  const isO = process.env.LLM_PROVIDER === 'ollama'
  const _emb = isO
    ? new OllamaEmbeddings({ model: process.env.OLLAMA_MODEL || 'llama3' })
    : new OpenAIEmbeddings({ model: 'text-embedding-3-small', openAIApiKey: process.env.OPENROUTER_API_KEY, configuration: { baseURL: 'https://openrouter.ai/api/v1' } })
  await embedTextFromFile(out, ns)
  return { stored: out }
}
