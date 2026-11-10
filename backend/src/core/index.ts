import cors from 'cors';
import path from 'path'
import { mkdirSync } from 'node:fs'
import { publicStorage } from '../config/storage'
import server from '../utils/server/server'
import { registerRoutes } from './router'
import { loggerMiddleware } from './middleware'

process.loadEnvFile(path.resolve(process.cwd(), '.env'))

const app = server()

app.use(loggerMiddleware)
app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Local-Date'],
  credentials: true,
}));
app.options('*', cors());
for (const { route, directory } of publicStorage) {
  mkdirSync(directory, { recursive: true })
  app.use(app.serverStatic(route, directory))
}

registerRoutes(app)

app.listen(Number.parseInt(process.env.PORT || '5000'), () => {
  console.log(`[lohni] running on ${process.env.VITE_BACKEND_URL}`)
})
