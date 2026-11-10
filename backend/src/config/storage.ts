import path from 'node:path'

// La base et les caches restent privés ; seuls les documents sont publiés.
export const publicStorage = ['uploads', 'smartnotes', 'podcasts'].map(directory => ({
  route: `/storage/${directory}`,
  directory: path.resolve(process.cwd(), 'storage', directory),
}))
