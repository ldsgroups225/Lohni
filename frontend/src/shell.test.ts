/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('shell mobile', () => {
  it('configure le document pour une PWA couvrant les zones sûres', () => {
    const html = readFileSync('frontend/index.html', 'utf8')
    expect(html).toMatch(/name="viewport"[^>]*content="[^"]*viewport-fit=cover/)
    expect(html).toMatch(/name="apple-mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="default"/)
  })

  it('utilise la hauteur dynamique dans les pages et le shell', () => {
    const files = ['frontend/src/App.tsx', ...readdirSync('frontend/src/pages').filter(file => file.endsWith('.tsx')).map(file => join('frontend/src/pages', file))]
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b(?:min-h-screen|h-screen)\b/)
  })
})
