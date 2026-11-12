import { expect, it } from 'vitest'
import { SQLiteDatabase } from './sqlite'

it('supports positional parameters, result counts and transaction rollback', async () => {
  const db = new SQLiteDatabase(':memory:')
  try {
    await db.run('CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT)')
    expect(await db.run('INSERT INTO entries (value) VALUES (?)', ['un'])).toMatchObject({ lastID: 1, changes: 1 })
    await expect(db.transaction(async () => {
      await db.run('INSERT INTO entries (value) VALUES (?)', ['deux'])
      throw new Error('annulé')
    })).rejects.toThrow('annulé')
    expect(await db.get('SELECT value FROM entries WHERE id = ?', [1])).toEqual({ value: 'un' })
    expect(await db.all('SELECT value FROM entries')).toEqual([{ value: 'un' }])
  } finally { await db.close() }
})

it('waits for shared storage readiness before starting a transaction', async () => {
  let release!: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  const db = new SQLiteDatabase(':memory:', ready)
  let started = false
  try {
    const transaction = db.transaction(async () => { started = true })
    await Promise.resolve()
    expect(started).toBe(false)
    release()
    await transaction
    expect(started).toBe(true)
  } finally { await db.close() }
})

it('binds booleans as SQLite integers', async () => {
  const db = new SQLiteDatabase(':memory:')
  try {
    expect(await db.get('SELECT ? AS yes, ? AS no', [true, false])).toEqual({ yes: 1, no: 0 })
  } finally { await db.close() }
})

it('binds dates as epoch milliseconds', async () => {
  const db = new SQLiteDatabase(':memory:')
  try {
    expect(await db.get('SELECT ? AS instant', [new Date('2024-01-02T03:04:05.000Z')])).toEqual({ instant: 1704164645000 })
  } finally { await db.close() }
})
