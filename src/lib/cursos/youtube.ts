const PADRAO_ID = /^[A-Za-z0-9_-]{11}$/

export function extrairIdYoutube(entrada: string): string | null {
  const valor = entrada.trim()
  if (!valor) return null
  if (PADRAO_ID.test(valor)) return valor

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1)
    return PADRAO_ID.test(id) ? id : null
  }

  if (url.hostname.endsWith('youtube.com')) {
    const v = url.searchParams.get('v')
    if (v && PADRAO_ID.test(v)) return v
    const partes = url.pathname.split('/').filter(Boolean)
    const embedIdx = partes.indexOf('embed')
    if (embedIdx >= 0 && PADRAO_ID.test(partes[embedIdx + 1] ?? '')) return partes[embedIdx + 1]
  }

  return null
}
