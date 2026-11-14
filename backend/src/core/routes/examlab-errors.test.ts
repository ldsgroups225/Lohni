import { expect, test, vi } from 'vitest'
import { examRoutes } from './examlab'
import { loadAllExams } from '../../services/examlab/loader'

vi.mock('../../services/examlab/loader', () => ({ loadAllExams: vi.fn() }))

test('une panne interne renvoie un message français fixe, sans fuite, et est journalisée', async () => {
  const cause = new Error('détail interne SQL')
  vi.mocked(loadAllExams).mockImplementation(() => { throw cause })
  const routes: Record<string, any> = {}
  examRoutes({ ws: () => {}, post: () => {}, delete: () => {}, get: (p: string, h: any) => { routes[p] = h } })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const send = vi.fn()
  try {
    await routes['/exams']({}, { status: (code: number) => { expect(code).toBe(500); return { send } } })
    expect(log).toHaveBeenCalledWith(expect.any(String), cause)
    expect(send).toHaveBeenCalledWith({ ok: false, error: 'Impossible de charger les examens. Réessaie.' })
    expect(JSON.stringify(send.mock.calls)).not.toContain('détail interne')
  } finally { log.mockRestore() }
})
