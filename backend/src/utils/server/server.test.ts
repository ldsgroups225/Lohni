import http from 'node:http'
import { expect, test, vi } from 'vitest'
import server from './server.js'

test('regroupe les routes par méthode, y compris les routes toutes méthodes', () => {
  const app = server()
  app.get('/cours', () => {})
  app.get('/profil', () => {})
  app.all('/sante', () => {})
  expect(app.getRoutes()).toEqual({ GET: ['/cours', '/profil'], ALL: ['/sante'] })
})

test('route les paramètres répétés et rejette les chemins WebSocket de traversée', () => {
  let request: (req: any, res: any) => void = () => { throw new Error('Serveur non créé') }
  let upgrade: (req: any, socket: any, head: Buffer) => void = () => { throw new Error('Gestionnaire WebSocket absent') }
  const fakeServer = { on: (event: string, handler: typeof upgrade) => { if (event === 'upgrade') upgrade = handler } }
  const create = vi.spyOn(http, 'createServer').mockImplementation(((handler: typeof request) => { request = handler; return fakeServer }) as any)
  try {
    const app = server()
    app.get('/echo', (req: any, res: any) => res.json({ path: req.path, query: req.query }))
    const end = vi.fn()
    request({ url: '/echo?tag=a&tag=b', method: 'GET', headers: {}, socket: {} }, { writeHead: vi.fn(), end })
    expect(JSON.parse(end.mock.calls[0][0])).toEqual({ path: '/echo', query: { tag: ['a', 'b'] } })
    const socket = { destroy: vi.fn() }
    upgrade({ url: '/ws/../echo' }, socket, Buffer.alloc(0))
    expect(socket.destroy).toHaveBeenCalledOnce()
  } finally { create.mockRestore() }
})

test('laisse aux requêtes lentes plus de temps que le délai du client', () => {
  const fakeServer = { on: () => {}, setTimeout: vi.fn(), listen: vi.fn() }
  const create = vi.spyOn(http, 'createServer').mockImplementation((() => fakeServer) as any)
  try {
    server().listen(0)
    expect(fakeServer.setTimeout.mock.calls[0][0]).toBeGreaterThan(90000)
  } finally { create.mockRestore() }
})
