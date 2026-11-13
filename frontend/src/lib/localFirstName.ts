import { cachedDevice } from './cachedDevice'

export function readFirstName(draft = false): string {
  const device = cachedDevice()
  if (!device) return ''
  try { return (draft ? sessionStorage : localStorage).getItem(`lohni-first-name:${device}`) ?? '' } catch { return '' }
}

export function writeFirstName(value: string, draft = false): boolean {
  const device = cachedDevice()
  if (!device) return !value
  try {
    const storage = draft ? sessionStorage : localStorage
    if (value) storage.setItem(`lohni-first-name:${device}`, value)
    else storage.removeItem(`lohni-first-name:${device}`)
    return true
  } catch { return false }
}
