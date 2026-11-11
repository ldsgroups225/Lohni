import fs from 'node:fs'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export async function extractText(filePath: string, mime: string) {
  const raw = fs.readFileSync(filePath)
  if (mime.includes('pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(raw) })
    try { return (await parser.getText({ pageJoiner: '' })).text } finally { await parser.destroy() }
  }
  if (mime.includes('markdown')) {
    const { marked } = await import('marked')
    return marked.parse(raw.toString())
  }
  if (mime.includes('plain')) {
    return raw.toString()
  }
  if (mime.includes('wordprocessingml') || mime.includes('msword') || mime.includes('vnd.oasis.opendocument.text')) {
    const r = await mammoth.extractRawText({ buffer: raw })
    return r.value
  }
  throw new Error('unsupported file type')
}
