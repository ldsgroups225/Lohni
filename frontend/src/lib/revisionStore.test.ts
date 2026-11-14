import { expect, test, vi } from 'vitest'

test('la synchro hors ligne n’enregistre ses réveils qu’une fois, même si le démarrage est appelé deux fois', async () => {
  const win = Object.assign(new EventTarget(), { setInterval: vi.fn(() => 1) })
  const add = vi.spyOn(win, 'addEventListener')
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { onLine: true, locks: {} })
  vi.resetModules()
  const { prepareRevisionStartup } = await import('./api')
  const store = await import('./revisionStore')
  expect(add).not.toHaveBeenCalled()
  prepareRevisionStartup(); store.prepareRevisionStartup()
  expect(add.mock.calls.map(([type]) => type).sort()).toEqual(['focus', 'online'])
  expect(win.setInterval).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
})
