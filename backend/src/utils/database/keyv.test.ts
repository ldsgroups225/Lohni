import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createKeyv } from './keyv-store'

describe('Keyv storage', () => {
  it('reads migrated data and persists new entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lohni-keyv-'))
    const path = join(dir, 'database.sqlite')
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT);
      INSERT INTO keyv VALUES ('keyv:chat:index', '{"value":["a"]}')`)
    old.close()
    const db = createKeyv(`sqlite://${path}`)
    try {
      expect(await db.get('chat:index')).toEqual(['a'])
      await db.set('chat:new', ['b'])
      expect(await db.get('chat:new')).toEqual(['b'])
    } finally {
      await db.disconnect()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
