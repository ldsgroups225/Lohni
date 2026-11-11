import sqlite3 from 'sqlite3'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

export class SQLiteDatabase {
    private db: sqlite3.Database
    private pending: Promise<unknown> = Promise.resolve()

    constructor(dbPath: string) {
        this.db = new sqlite3.Database(dbPath)
        this.db.configure('busyTimeout', 5000)
    }

    async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err)
                else resolve(this)
            })
        })
    }

    async get(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err)
                else resolve(row)
            })
        })
    }

    async all(sql: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err)
                else resolve(rows || [])
            })
        })
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err)
                else resolve()
            })
        })
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
export const sqlite = new SQLiteDatabase(dbPath)
