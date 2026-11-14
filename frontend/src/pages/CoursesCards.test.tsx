// @vitest-environment jsdom
import { required } from '../test/required'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Courses from './Courses'

const api = vi.hoisted(() => ({ chapters: vi.fn(), progress: vi.fn(), updateCard: vi.fn(), deleteCard: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: { minimumSeenRatio: 0.5 } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le chapitre présente ses cartes, mène à sa révision et explique l’ajout indisponible', async () => {
  localStorage.setItem('lohni-device-id', 'chapitre-cartes')
  api.chapters.mockResolvedValue([{ id: '1', subject: 'SVT', title: 'Photosynthèse', status: 'Solide', mastery: 100, seenCards: 1, cards: [{ id: 'c', kind: 'basic', question: 'Où ?', answer: 'Dans les chloroplastes' }], summary: '' }])
  api.progress.mockResolvedValue({})
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><Courses /></MemoryRouter>))
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === '1 carte')?.click() })
    expect(host.textContent).toContain('Dans les chloroplastes')
    expect([...host.querySelectorAll('a')].find(link => link.textContent === 'Réviser ce chapitre')?.getAttribute('href')).toBe('/revision?chapter=1')
    expect([...host.querySelectorAll('button')].find(button => button.textContent === '+ Ajouter une carte')?.disabled).toBe(true)
    expect(host.textContent).toContain('Ajouter une carte à la main n’est pas encore disponible.')
  } finally { act(() => root.unmount()); host.remove(); localStorage.removeItem('lohni-device-id') }
})


test('modifier une carte affiche un aperçu formaté et protège la suppression', async () => {
  localStorage.setItem('lohni-device-id', 'edition-carte')
  const chapter = { id: '1', subject: 'SVT', title: 'Photosynthèse', status: 'Solide', mastery: 100, seenCards: 1, cards: [{ id: 'c', kind: 'basic', question: 'Où ?', answer: 'Dans les **chloroplastes**' }], summary: '' }
  api.chapters.mockResolvedValue([chapter]); api.progress.mockResolvedValue({}); api.updateCard.mockResolvedValue(null); api.deleteCard.mockResolvedValue(null)
  const show = HTMLDialogElement.prototype.showModal; const close = HTMLDialogElement.prototype.close
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.dispatchEvent(new Event('close')) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter><Courses /></MemoryRouter>))
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === '1 carte')?.click() })
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Modifier : Où ?"]')?.click())
    expect(host.querySelector('strong')?.textContent).toBe('chloroplastes')
    const question = required(host.querySelector('textarea'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')).set).call(question, '  '); question.dispatchEvent(new Event('input', { bubbles: true })) })
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Enregistrer')?.disabled).toBe(true)
    expect(host.textContent).toContain('Renseigne la question pour enregistrer.')
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')).set).call(question, 'Où se déroule-t-elle ?'); question.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(api.updateCard).toHaveBeenCalledWith('c', { kind: 'basic', question: 'Où se déroule-t-elle ?', answer: 'Dans les **chloroplastes**' })
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Modifier : Où ?"]')?.click())
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === 'Supprimer cette carte')?.click() })
    expect(api.deleteCard).not.toHaveBeenCalled()
    await act(async () => { [...document.querySelectorAll('dialog button')].find(button => button.textContent === 'Supprimer')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(api.deleteCard).toHaveBeenCalledWith('c')
  } finally { act(() => root.unmount()); host.remove(); localStorage.removeItem('lohni-device-id'); HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close }
})
