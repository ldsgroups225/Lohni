export function deSubject(subject: string) {
  return `${/^(?:[aàâäeéèêëiîïoôöuùûüyÿ]|histoire|humanit)/i.test(subject) ? 'd’' : 'de '}${subject}`
}
