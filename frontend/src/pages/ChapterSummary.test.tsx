// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import ChapterSummary from '../components/Revision/ChapterSummary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('consulter le résumé, copier son contenu et accéder aux cartes du chapitre', async () => {
  const copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  const onCards = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><ChapterSummary title="Photosynthèse" subject="SVT" summary={'Les **chloroplastes** captent la lumière.\n\n$$\nCO_2 + H_2O\n$$'} cards={[{ id: '1', answer: 'Elle produit du glucose.' }]} onBack={() => {}} onCards={onCards} /></MemoryRouter>))
    expect(host.querySelector('strong')?.textContent).toBe('chloroplastes')
    expect(host.querySelector('.katex-display')).not.toBeNull()
    expect(host.textContent).toContain('Généré par IA : peut contenir des erreurs')
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Copier le résumé"]')?.click() })
    expect(copy).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Résumé copié')
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === 'À retenir')?.click() })
    expect(host.textContent).toContain('Elle produit du glucose.')
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === 'Réviser avec les cartes')?.click() })
    expect(onCards).toHaveBeenCalledOnce()
  } finally { act(() => root.unmount()); host.remove() }
})

test('explique l’absence de cartes et les échecs de copie', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><ChapterSummary title="Fractions" subject="Mathématiques" summary="Une moitié" cards={[]} onBack={() => {}} onCards={() => {}} /></MemoryRouter>))
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Réviser avec les cartes')?.disabled).toBe(true)
    expect(host.textContent).toContain('Ajoute des cartes à ce chapitre')
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Copier le résumé"]')?.click() })
    expect(host.textContent).toContain('Impossible de copier le résumé')
  } finally { act(() => root.unmount()); host.remove() }
})
