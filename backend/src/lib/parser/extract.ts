import fs from 'fs'
import mammoth from 'mammoth'
import pdf from 'pdf-parse'
import { marked } from 'marked'

export async function extractText(filePath: string, mime: string) {
  const raw = fs.readFileSync(filePath)
  if (mime.includes('pdf')) {
    // pdf.js attend un tableau d’octets sans décalage de tampon Node.
    const data = await pdf(new Uint8Array(raw))
    return data.text
  }
  if (mime.includes('markdown')) {
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
