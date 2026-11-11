// Styled replacement for window.confirm: native <dialog> gives focus trap, Escape and backdrop for free.
export function confirmDialog(message: string, confirmLabel = 'Supprimer', signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(false); return }
    const dialog = document.createElement('dialog')
    dialog.setAttribute('role', 'alertdialog')
    dialog.className = 'm-auto w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-2xl backdrop:bg-black/50'
    const text = document.createElement('p')
    text.className = 'mb-6'
    text.textContent = message
    const row = document.createElement('div')
    row.className = 'flex justify-end gap-3'
    const make = (label: string, value: boolean, cls: string) => {
      const b = document.createElement('button')
      b.type = 'button'; b.textContent = label
      b.className = `rounded-xl px-4 py-3 ${cls}`
      b.onclick = () => dialog.close(String(value))
      return b
    }
    row.append(make('Annuler', false, 'border border-border'), make(confirmLabel, true, 'bg-danger text-on-danger font-semibold'))
    dialog.append(text, row)
    const abort = () => dialog.close('false')
    signal?.addEventListener('abort', abort, { once: true })
    dialog.addEventListener('close', () => { signal?.removeEventListener('abort', abort); resolve(dialog.returnValue === 'true'); dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
  })
}
