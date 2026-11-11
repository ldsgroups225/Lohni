import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { expect, it } from 'vitest'
import { extractText } from './extract'

it('extracts both PDF pages without page markers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lohni-pdf-'))
  try {
    const pdf = await PDFDocument.create()
    pdf.addPage().drawText('First page')
    pdf.addPage().drawText('Second page')
    const path = join(dir, 'two-pages.pdf')
    writeFileSync(path, await pdf.save())
    const text = await extractText(path, 'application/pdf')
    expect(text).toContain('First page')
    expect(text).toContain('Second page')
    expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
