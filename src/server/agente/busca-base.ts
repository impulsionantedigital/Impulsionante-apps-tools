import 'server-only'
import { admin } from '@/server/supabase'
import { embedar } from '@/server/agente/embed'
import { ORCAMENTO_BUSCA_MS } from '@/server/agente/orcamento'
import {
  POR_PAGINA_LISTA,
  POR_PAGINA_LISTA_COM_TEMA,
  TETO_SECAO,
  type AchadoDaBase,
  type FonteDoAchado,
  type ItemDaLista,
} from '@/lib/canais/bloco-conhecimento'
import { cortarNoTeto } from '@/lib/canais/grafema'


const TETO_CONSULTA = 1000


const LIMITE = 5


const LIMITE_POR_CONSULTA = 8


const MAX_CONSULTAS = 3


const TETO_JUNTOS = 16

// A busca automática do turno junta duas consultas de LIMITE cada e guarda até isto.
const LIMITE_DO_TURNO = 8


const MAX_TERMOS = 3
const TETO_TERMO = 200
const TETO_TEMA = 300


const SOBREPOSICAO_MAX = 200
const SOBREPOSICAO_MIN = 20


export type TiposDaBusca = ReadonlyArray<'fato' | 'playbook'> | null


export const TIPOS_DO_BLOCO_AUTOMATICO: TiposDaBusca = ['fato']


function fonteDe(documento: unknown, caminho: unknown, pagina: unknown): FonteDoAchado | null {
  if (documento === null || documento === undefined || String(documento).trim() === '') return null
  return {
    documento: String(documento),
    caminho: caminho === null || caminho === undefined ? '' : String(caminho),
    pagina: typeof pagina === 'number' && Number.isFinite(pagina) ? pagina : null,
  }
}

export async function buscarNaBase(
  ws: string,
  consulta: string,
  opts: { conversaId: string | null; tipos: TiposDaBusca; assistenteId: string | null; limite?: number; sinal?: AbortSignal },
): Promise<AchadoDaBase[] | 'indisponivel'> {
  const texto = (consulta ?? '').trim().slice(0, TETO_CONSULTA)
  const prazo = opts.sinal ?? AbortSignal.timeout(ORCAMENTO_BUSCA_MS)
  try {
    const vetor = await embedar(texto, { ws, conversaId: opts.conversaId, sinal: prazo })

    const { data, error } = await admin()
      .rpc('base_conhecimento_buscar', {
        p_ws: ws,
        p_query: texto,
        p_embedding: vetor?.vetor ?? null,
        p_versao: vetor?.versao ?? null,
        p_limite: opts.limite ?? LIMITE,
        p_tipos: opts.tipos === null ? null : [...opts.tipos],
        p_assistente: opts.assistenteId,
      })
      .abortSignal(prazo)
    if (error || !data) return 'indisponivel'

    return (
      data as Array<{
        id?: string
        titulo?: string
        conteudo?: string
        tipo?: string
        documento?: string | null
        caminho_titulos?: string | null
        pagina?: number | null
      }>
    ).map((l) => ({
      id: String(l.id ?? ''),
      titulo: String(l.titulo ?? ''),
      conteudo: String(l.conteudo ?? ''),
      tipo: l.tipo === 'playbook' ? 'playbook' : 'fato',
      fonte: fonteDe(l.documento, l.caminho_titulos, l.pagina),
    }))
  } catch {
    return 'indisponivel'
  }
}

// Junta os resultados de varias consultas intercalando (1º de cada, depois 2º de cada…), sem
// repetir id, e corta em TETO_JUNTOS.
export function juntarConsultas(listas: AchadoDaBase[][]): AchadoDaBase[] {
  const vistos = new Set<string>()
  const juntos: AchadoDaBase[] = []
  const maior = Math.max(0, ...listas.map((l) => l.length))
  for (let i = 0; i < maior && juntos.length < TETO_JUNTOS; i++) {
    for (const lista of listas) {
      const a = lista[i]
      if (!a || vistos.has(a.id)) continue
      vistos.add(a.id)
      juntos.push(a)
      if (juntos.length >= TETO_JUNTOS) break
    }
  }
  return juntos
}

export async function buscarVarias(
  ws: string,
  consultas: string[],
  opts: { conversaId: string | null; assistenteId: string | null },
): Promise<AchadoDaBase[] | 'indisponivel'> {
  const limpas = consultas
    .map((c) => (typeof c === 'string' ? c.trim().slice(0, TETO_CONSULTA) : ''))
    .filter(Boolean)
    .slice(0, MAX_CONSULTAS)
  if (limpas.length === 0) return []
  const prazo = AbortSignal.timeout(ORCAMENTO_BUSCA_MS)
  const resultados = await Promise.all(
    limpas.map((c) =>
      buscarNaBase(ws, c, {
        conversaId: opts.conversaId,
        tipos: null,
        assistenteId: opts.assistenteId,
        limite: LIMITE_POR_CONSULTA,
        sinal: prazo,
      }),
    ),
  )
  const ok = resultados.filter((r): r is AchadoDaBase[] => r !== 'indisponivel')
  if (ok.length === 0) return 'indisponivel'
  return juntarConsultas(ok)
}

/**
 * Busca automática do turno: roda as consultas em paralelo com o mesmo filtro de tipos e junta
 * intercalando, a primeira consulta na frente. Só fica indisponível se todas falharem.
 */
export async function buscarDoTurno(
  ws: string,
  consultas: string[],
  opts: { conversaId: string | null; tipos: TiposDaBusca; assistenteId: string | null },
): Promise<AchadoDaBase[] | 'indisponivel'> {
  const limpas = consultas.map((c) => (c ?? '').trim()).filter(Boolean).slice(0, 2)
  if (limpas.length === 0) return []
  const prazo = AbortSignal.timeout(ORCAMENTO_BUSCA_MS)
  const resultados = await Promise.all(limpas.map((c) => buscarNaBase(ws, c, { ...opts, sinal: prazo })))
  const ok = resultados.filter((r): r is AchadoDaBase[] => r !== 'indisponivel')
  if (ok.length === 0) return 'indisponivel'
  return juntarConsultas(ok).slice(0, LIMITE_DO_TURNO)
}

// `total: null` = pagina alem do fim (zero linhas, total desconhecido).
export async function listarPorTermos(
  ws: string,
  termos: string[],
  opts: { assistenteId: string | null; pagina: number; tema?: string; conversaId: string | null },
): Promise<{ total: number | null; itens: ItemDaLista[]; porPagina: number } | 'indisponivel'> {
  const limpos = termos
    .map((t) => (typeof t === 'string' ? t.trim().slice(0, TETO_TERMO) : ''))
    .filter(Boolean)
    .slice(0, MAX_TERMOS)
  const tema = (opts.tema ?? '').trim().slice(0, TETO_TEMA)
  const pagina = Math.max(1, Math.floor(Number(opts.pagina)) || 1)
  const porPagina = tema ? POR_PAGINA_LISTA_COM_TEMA : POR_PAGINA_LISTA
  if (limpos.length === 0) return { total: 0, itens: [], porPagina }

  const prazo = AbortSignal.timeout(ORCAMENTO_BUSCA_MS)
  try {
    // Embedding do tema falhou → segue sem tema: a lista vem completa, so sem a ordem por
    // relevancia.
    let vetor: { vetor: number[]; versao: string } | null = null
    if (tema) {
      try {
        vetor = await embedar(tema, { ws, conversaId: opts.conversaId, sinal: prazo })
      } catch {
        vetor = null
      }
    }

    const { data, error } = await admin()
      .rpc('base_secoes_por_termos', {
        p_ws: ws,
        p_termos: limpos,
        p_assistente: opts.assistenteId,
        p_limite: porPagina,
        p_deslocamento: (pagina - 1) * porPagina,
        p_embedding: vetor?.vetor ?? null,
        p_versao: vetor?.versao ?? null,
      })
      .abortSignal(prazo)
    if (error || !data) return 'indisponivel'

    const linhas = data as Array<{
      id?: string
      documento?: string | null
      titulo?: string | null
      caminho_titulos?: string | null
      pagina?: number | null
      recorte?: string | null
      total?: number | string | null
    }>
    if (linhas.length === 0) return { total: pagina > 1 ? null : 0, itens: [], porPagina }
    const total = Number(linhas[0].total ?? linhas.length)
    return {
      total: Number.isFinite(total) ? total : linhas.length,
      porPagina,
      itens: linhas.map((l) => ({
        id: String(l.id ?? ''),
        titulo: String(l.titulo ?? ''),
        fonte: fonteDe(l.documento, l.caminho_titulos, l.pagina),
        recorte: String(l.recorte ?? ''),
      })),
    }
  } catch {
    return 'indisponivel'
  }
}

// Acrescenta `proximo` a `acumulado` tirando a sobreposicao: o trecho seguinte pode comecar
// repetindo ate SOBREPOSICAO_MAX caracteres do fim do anterior.
export function juntarSemSobreposicao(acumulado: string, proximo: string): string {
  if (!acumulado) return proximo
  if (!proximo) return acumulado
  const max = Math.min(SOBREPOSICAO_MAX, acumulado.length, proximo.length)
  for (let n = max; n >= SOBREPOSICAO_MIN; n--) {
    if (acumulado.endsWith(proximo.slice(0, n))) return acumulado + proximo.slice(n)
  }
  return `${acumulado}\n${proximo}`
}

// Le a secao (ou os vizinhos) de um trecho: parte do alvo e vai acrescentando anterior e
// seguinte, alternando, enquanto couber em TETO_SECAO. `cortado` = sobrou trecho de fora.
export async function lerSecao(
  ws: string,
  trechoId: string,
  modo: 'secao' | 'vizinhos',
  opts: { assistenteId: string | null },
): Promise<{ fonte: FonteDoAchado | null; texto: string; cortado: boolean } | 'nao_encontrado' | 'indisponivel'> {
  const prazo = AbortSignal.timeout(ORCAMENTO_BUSCA_MS)
  try {
    const { data, error } = await admin()
      .rpc('base_secao_do_trecho', {
        p_ws: ws,
        p_trecho: trechoId,
        p_assistente: opts.assistenteId,
        p_modo: modo === 'vizinhos' ? 'vizinhos' : 'secao',
      })
      .abortSignal(prazo)
    if (error || !data) return 'indisponivel'
    const linhas = data as Array<{
      documento?: string | null
      caminho_titulos?: string | null
      pagina?: number | null
      conteudo?: string | null
      alvo?: boolean | null
    }>
    return juntarSecao(linhas)
  } catch {
    return 'indisponivel'
  }
}

export function juntarSecao(
  linhas: Array<{ documento?: string | null; caminho_titulos?: string | null; pagina?: number | null; conteudo?: string | null; alvo?: boolean | null }>,
): { fonte: FonteDoAchado | null; texto: string; cortado: boolean } | 'nao_encontrado' {
  const i = linhas.findIndex((l) => l.alvo === true)
  if (i < 0) return 'nao_encontrado'
  const alvo = linhas[i]
  const fonte = fonteDe(alvo.documento, alvo.caminho_titulos, alvo.pagina)
  const textos = linhas.map((l) => String(l.conteudo ?? ''))
  const montar = (de: number, ate: number) => {
    let t = ''
    for (let k = de; k <= ate; k++) t = juntarSemSobreposicao(t, textos[k])
    return t
  }

  let de = i
  let ate = i
  let texto = textos[i]
  if (texto.length > TETO_SECAO) {
    return { fonte, texto: `${cortarNoTeto(texto, TETO_SECAO - 1)}…`, cortado: true }
  }
  let vezDoAnterior = true
  while (de > 0 || ate < textos.length - 1) {
    const podeAnterior = de > 0
    const podeSeguinte = ate < textos.length - 1
    const anterior: boolean = vezDoAnterior ? podeAnterior : !podeSeguinte
    const [nDe, nAte] = anterior ? [de - 1, ate] : [de, ate + 1]
    const candidato = montar(nDe, nAte)
    if (candidato.length > TETO_SECAO) break
    de = nDe
    ate = nAte
    texto = candidato
    vezDoAnterior = !anterior
  }
  return { fonte, texto, cortado: de > 0 || ate < textos.length - 1 }
}
