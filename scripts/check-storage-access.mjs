import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:5000'
for (const path of ['/storage/database.sqlite', '/storage/database.sqlite-wal', '/storage/uploads/../database.sqlite']) {
  assert.equal((await fetch(new URL(path, base))).status, 404, `${path} must stay private`)
}
for (const filePath of ['database.sqlite', '../database.sqlite']) {
  const response = await fetch(new URL('/api/companion/ask', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Lis ce document.', filePath }),
  })
  assert.equal(response.status, 404, `${filePath} must be inaccessible to the companion`)
}
console.log('SQLite files are inaccessible through HTTP and the companion.')
