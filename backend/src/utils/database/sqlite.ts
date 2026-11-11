const Database = require('better-sqlite3')
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { keyvReady } from './keyv'

export class SQLiteDatabase {
    private db: any
    private pending: Promise<unknown>

    constructor(dbPath: string, ready: Promise<unknown> = Promise.resolve()) {
        this.pending = ready
        this.db = new Database(dbPath, { timeout: 0 })
    }

    private async execute<T>(operation: () => T): Promise<T> {
        const deadline = Date.now() + 5000
        for (;;) {
            try { return operation() } catch (error: any) {
                if (error.code !== 'SQLITE_BUSY' || Date.now() >= deadline) throw error
                await new Promise(resolve => setTimeout(resolve, 25))
            }
        }
    }

    async run(sql: string, params: any[] = []): Promise<{ lastID: number | bigint; changes: number }> {
        return this.execute(() => {
            const result = this.db.prepare(sql).run(...params)
            return { lastID: result.lastInsertRowid, changes: result.changes }
        })
    }

    async get(sql: string, params: any[] = []): Promise<any> {
        return this.execute(() => this.db.prepare(sql).get(...params))
    }

    async all(sql: string, params: any[] = []): Promise<any[]> {
        return this.execute(() => this.db.prepare(sql).all(...params))
    }

    async close(): Promise<void> {
        this.db.close()
    }

    transaction<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(async () => {
            await this.run('BEGIN IMMEDIATE')
            try {
                const value = await operation()
                await this.run('COMMIT')
                return value
            } catch (error) {
                await this.run('ROLLBACK')
                throw error
            }
        })
        this.pending = result.catch(() => {})
        return result
    }
}

const dbPath = path.join(process.cwd(), 'storage', 'database.sqlite')
mkdirSync(path.dirname(dbPath), { recursive: true })
export const sqlite = new SQLiteDatabase(dbPath, keyvReady)
