import { createKeyv } from './keyv-store'

const db = createKeyv('sqlite://storage/database.sqlite')

export default db
