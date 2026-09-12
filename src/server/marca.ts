import 'server-only'
import { cache } from 'react'
import { lerConfig } from '@/server/configuracoes'
import { urlSupabase } from '@/server/config-supabase'
import { derivarMarca, type Marca, type Paleta } from '@/lib/marca-cor'



export const NOME_PADRAO = 'Awave CRM'
export const ACCENT_PADRAO = '#3D5AFE'

export const CHAVE_NOME = 'marca_nome'
export const CHAVE_ACCENT = 'marca_accent'
export const CHAVE_LOGO = 'marca_logo'
export const CHAVE_FAVICON = 'marca_favicon'

export const BUCKET = 'marca'

export type MarcaDoDeploy = {
  nome: string
  
  accent: string
  
  tokens: Marca | null
  
  logo: string | null
  
  favicon: string | null
}


export function urlPublica(caminho: string): string {
  return `${urlSupabase()}/storage/v1/object/public/${BUCKET}/${caminho}`
}

const PADRAO: MarcaDoDeploy = {
  nome: NOME_PADRAO,
  accent: ACCENT_PADRAO,
  tokens: null,
  logo: null,
  favicon: null,
}

export const lerMarca = cache(async (): Promise<MarcaDoDeploy> => {
  
  
  
  
  let nome: string | null = null
  let accent: string | null = null
  let logo: string | null = null
  let favicon: string | null = null
  try {
    ;[nome, accent, logo, favicon] = await Promise.all([
      lerConfig(CHAVE_NOME),
      lerConfig(CHAVE_ACCENT),
      lerConfig(CHAVE_LOGO),
      lerConfig(CHAVE_FAVICON),
    ])
  } catch {
    return PADRAO
  }

  const cor = accent?.trim() || ACCENT_PADRAO
  const derivado = derivarMarca(cor)

  return {
    nome: nome?.trim() || NOME_PADRAO,
    accent: cor,
    
    
    tokens: 'erro' in derivado ? null : derivado,
    logo: logo?.trim() ? urlPublica(logo.trim()) : null,
    favicon: favicon?.trim() ? urlPublica(favicon.trim()) : null,
  }
})


export function cssDaMarca(m: MarcaDoDeploy): string {
  if (!m.tokens) return ''
  const vars = (p: Paleta) =>
    `--acento:${p.accent};--acento-hover:${p.hover};--acento-ativo:${p.active};` +
    `--acento-wash:${p.wash};--acento-linha:${p.line}`
  
  
  
  
  
  
  
  
  
  
  
  return `:root{${vars(m.tokens.escuro)}}:root[data-tema="claro"]{${vars(m.tokens.claro)}}`
}


export async function tituloDaPagina(secao?: string): Promise<string> {
  const { nome } = await lerMarca()
  return secao ? `${secao} — ${nome}` : nome
}
