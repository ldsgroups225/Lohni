export function cachedDevice() {
  try { return localStorage.getItem('lohni-device-id') } catch { return null }
}
