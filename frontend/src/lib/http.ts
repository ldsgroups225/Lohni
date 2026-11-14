import { env } from "../config/env";

// Appel HTTP partagé par api.ts et le client de révision.
const timeoutCtl = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

export class APIError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string, readonly chapterId?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function req<T = unknown>(
  url: string,
  init: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const { timeout = env.timeout, ...rest } = init;
  const { signal, done } = timeoutCtl(timeout);
  try {
    let r: Response;
    try { r = await fetch(url, { ...rest, signal: rest.signal ? AbortSignal.any([signal, rest.signal]) : signal }); }
    catch (error) {
      if (signal.aborted && !rest.signal?.aborted) throw new APIError('Le chargement prend trop de temps. Réessaie dans un instant.', 0, 'TIMEOUT');
      if (error instanceof TypeError) throw new APIError('Connexion impossible. Vérifie ta connexion et réessaie.', 0, 'NETWORK');
      throw error;
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let detail: { error?: unknown; code?: unknown; chapterId?: unknown } | undefined;
      try { detail = JSON.parse(txt); } catch { /* Non-JSON responses keep their HTTP status. */ }
      throw new APIError(typeof detail?.error === "string" ? detail.error : r.status >= 500 ? 'Le serveur ne répond pas correctement. Réessaie.' : 'La demande a échoué. Réessaie.',
        r.status, typeof detail?.code === 'string' ? detail.code : undefined, typeof detail?.chapterId === 'string' ? detail.chapterId : undefined);
    }
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return (await r.json()) as T;
    return (await r.text()) as unknown as T;
  } finally {
    done();
  }
}
