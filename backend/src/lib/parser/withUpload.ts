import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMultipart, type UpFile } from './upload'
import { RevisionError } from '../../services/revision/service'

type Options = {
  prefix: string
  maxFiles: number
  fileSize: number
  /** Refuse un envoi qui n'a pas exactement un fichier. */
  exactlyOne?: boolean
  /** Lit le champ `q` comme un JSON de métadonnées. */
  metadata?: boolean
  tooBigMessage: string
  code?: string
  noFileMessage?: string
}

// Reçoit un envoi multipart dans un dossier temporaire, supprimé quoi qu'il arrive à la fin de `handle`.
export async function withUpload<M = undefined, T = unknown>(req: any, options: Options, handle: (upload: { files: UpFile[]; metadata: M }) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), options.prefix))
  try {
    let upload: Awaited<ReturnType<typeof parseMultipart>>
    try { upload = await parseMultipart(req, { directory, limits: { files: options.maxFiles, fileSize: options.fileSize, fields: 1, fieldSize: 4096 } }) }
    catch { throw new RevisionError(options.tooBigMessage, options.code) }
    let metadata: any
    if (options.metadata) {
      try { metadata = JSON.parse(upload.q) } catch { throw new RevisionError('Matière et titre du chapitre requis.') }
    }
    if (options.exactlyOne && upload.files.length !== 1) throw new RevisionError(options.noFileMessage ?? 'Choisis un fichier.', options.code)
    return await handle({ files: upload.files, metadata })
  } finally { await rm(directory, { recursive: true, force: true }) }
}
