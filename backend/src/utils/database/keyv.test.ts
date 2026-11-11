import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createKeyv } from './keyv-store'
import { SQLiteDatabase } from './sqlite'
import type SQLite from '@keyv/sqlite'

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

it('initialises Keyv before revision writes to a new shared database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lohni-shared-sqlite-'))
  const path = join(dir, 'database.sqlite')
  const keyv = createKeyv(`sqlite://${path}`)
  const revision = new SQLiteDatabase(path, (keyv.store as SQLite).ready)
  try {
    await Promise.all([
      revision.transaction(async () => {
        await revision.run('CREATE TABLE revision_test (value TEXT)')
        await revision.run('INSERT INTO revision_test VALUES (?)', ['cours'])
      }),
      keyv.set('chat:index', ['a']),
    ])
    expect(await keyv.get('chat:index')).toEqual(['a'])
    expect(await revision.get('SELECT value FROM revision_test')).toEqual({ value: 'cours' })
  } finally {
    await keyv.disconnect()
    await revision.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
