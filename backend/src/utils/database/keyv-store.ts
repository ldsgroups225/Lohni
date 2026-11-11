import Keyv from 'keyv'
import SQLite from '@keyv/sqlite'

export function createKeyv(uri: string) {
  return new Keyv({ store: new SQLite({ uri, driver: 'better-sqlite3' }), namespace: 'keyv' })
}
