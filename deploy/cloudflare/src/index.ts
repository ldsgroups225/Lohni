import { Container, getContainer } from '@cloudflare/containers'

type Env = { BACKEND: DurableObjectNamespace<Backend>; BACKEND_ENV: string }

export class Backend extends Container<Env> {
  defaultPort = 5000
  // shortcut: the container disk (SQLite, storage/) is wiped when it sleeps or redeploys; move to D1/R2 before real users.
  sleepAfter = '6h'
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = { ...JSON.parse(env.BACKEND_ENV), HOST: '0.0.0.0', PORT: '5000' }
  }
}

// One shared instance: the backend keeps all devices in one SQLite file.
export default {
  fetch: (request: Request, env: Env) => getContainer(env.BACKEND, 'main').fetch(request),
}
