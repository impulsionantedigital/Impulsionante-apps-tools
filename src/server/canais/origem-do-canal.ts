






import { SLUG_CLOUD, SLUG_EVOLUTION, SLUG_INSTAGRAM, SLUG_UAZAPI } from '@/server/canais/types'


const ORIGEM_PADRAO = 'whatsapp'


const ORIGEM_POR_PROVIDER: Record<string, string> = Object.assign(Object.create(null), {
  
  
  
  
  [SLUG_UAZAPI]: 'whatsapp',
  [SLUG_CLOUD]: 'whatsapp',
  
  
  
  [SLUG_INSTAGRAM]: 'instagram',
  [SLUG_EVOLUTION]: 'whatsapp',
})


export function origemDoCanal(provider: string): string {
  return ORIGEM_POR_PROVIDER[provider] ?? ORIGEM_PADRAO
}


export const ORIGENS_DE_CANAL: readonly string[] = [
  ...new Set([...Object.values(ORIGEM_POR_PROVIDER), ORIGEM_PADRAO]),
]
