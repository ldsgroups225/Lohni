import type SQLite from '@keyv/sqlite'
import { createKeyv } from './keyv-store'

const db = createKeyv('sqlite://storage/database.sqlite')

export const keyvReady = (db.store as SQLite).ready
export default db
