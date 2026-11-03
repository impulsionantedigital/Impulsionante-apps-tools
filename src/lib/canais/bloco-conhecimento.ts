import { cortarNoTeto } from '@/lib/canais/grafema'
import { neutralizarCerca } from '@/lib/canais/historico-agente'
import type { RefsDaRodada } from '@/lib/canais/refs-da-rodada'

// De onde veio um trecho de documento. Card manual nao tem fonte (null).
export type FonteDoAchado = { documento: string; caminho: string; pagina: number | null }

export type AchadoDaBase = {
  id: string
  titulo: string
  conteudo: string
  tipo: 'fato' | 'playbook'
  fonte: FonteDoAchado | null
}

// Um item da lista e uma SECAO (um verbete inteiro), nunca um trecho solto.
export type ItemDaLista = { id: string; titulo: string; fonte: FonteDoAchado | null; recorte: string }

export const POR_PAGINA_LISTA = 25
export const POR_PAGINA_LISTA_COM_TEMA = 18
export const TETO_SECAO = 8_000

const ROTULO: Record<AchadoDaBase['tipo'], string> = { fato: 'conhecimento', playbook: 'playbook' }

function rotuloDe(tipo: string): string {
  return Object.hasOwn(ROTULO, tipo) ? ROTULO[tipo as AchadoDaBase['tipo']] : ROTULO.fato
}

const NADA = '[conhecimento] Nada encontrado na base.'
const FORA = '[conhecimento] Base indisponivel agora.'
const LISTA_FORA = '[lista] Base indisponivel agora.'
const SECAO_FORA = '[secao] Base indisponivel agora.'
const SECAO_NADA = '[secao] Trecho nao encontrado na base.'
const SECAO_CONTINUA = '[secao continua: use lerSecao modo vizinhos]'

export const TETO_BLOCO_CONHECIMENTO = 8_000

// Teto de cada pedaco que vem do usuario ou do documento na linha da lista: o rotulo no
// cabecalho e a fonte de cada item. O recorte e cortado pelo que sobrar do teto do bloco.
const TETO_ROTULO = 200
const TETO_FONTE = 150

// "Documento › Caminho (p. N)"; sem caminho, so o documento; sem pagina, sem o "(p. N)".
function textoDaFonte(f: FonteDoAchado): string {
  const caminho = umaLinha(f.caminho ?? '')
  const base = caminho ? `${umaLinha(f.documento)} › ${caminho}` : umaLinha(f.documento)
  return f.pagina !== null && f.pagina !== undefined ? `${base} (p. ${f.pagina})` : base
}

export function montarBlocoConhecimento(estado: { achados: AchadoDaBase[] } | 'indisponivel', refs?: RefsDaRodada): string {
  if (estado === 'indisponivel') return FORA
  if (estado.achados.length === 0) return NADA
  const linhas = estado.achados.map((a) => {
    const ref = refs ? ` ${refs.ref(a.id)}` : ''
    const fonte = a.fonte ? `Fonte: ${textoDaFonte(a.fonte)} | ` : ''
    return `[${rotuloDe(a.tipo)}${ref}] ${fonte}${umaLinha(a.titulo)}: ${umaLinha(a.conteudo)}`
  })
  return caberNoTeto(linhas).join('\n')
}

// `total: null` = a pagina pedida passou do fim (o banco nao devolveu linha nenhuma, entao nao
// se sabe o total). `porPagina` define a numeracao "mostrando de–ate"; padrao POR_PAGINA_LISTA.
export function montarBlocoLista(
  rotulo: string,
  estado: { total: number | null; pagina: number; itens: ItemDaLista[]; porPagina?: number } | 'indisponivel',
  refs: RefsDaRodada,
): string {
  if (estado === 'indisponivel') return LISTA_FORA
  const nome = `"${cortarComReticencias(umaLinha(rotulo), TETO_ROTULO)}"`
  const pagina = Math.max(1, Math.floor(estado.pagina) || 1)
  if (estado.total === null || (estado.itens.length === 0 && pagina > 1)) {
    return `[lista] ${nome}: pagina ${pagina} nao existe; volte para a pagina 1.`
  }
  if (estado.total === 0 || estado.itens.length === 0) return `[lista] ${nome}: nada encontrado na base.`

  const porPagina = estado.porPagina && estado.porPagina > 0 ? estado.porPagina : POR_PAGINA_LISTA
  const de = (pagina - 1) * porPagina + 1
  const ate = de + estado.itens.length - 1
  const faltam = Math.max(0, estado.total - ate)
  const cabecalho =
    `[lista] ${nome}: ${estado.total} secoes; mostrando ${de}–${ate}.` +
    (faltam > 0 ? ` Faltam ${faltam}: peca pagina ${pagina + 1}.` : '')

  // Cada item recebe a mesma fatia do que sobra do teto, para a pagina inteira caber sempre
  // (cortar itens do fim desmentiria o "mostrando de–ate" do cabecalho).
  const fatia = Math.floor((TETO_BLOCO_CONHECIMENTO - cabecalho.length) / estado.itens.length) - 1
  const linhas = estado.itens.map((item) => {
    const origem = item.fonte ? textoDaFonte(item.fonte) : umaLinha(item.titulo)
    const linha = `${refs.ref(item.id)} | ${cortarComReticencias(origem, TETO_FONTE)}: ${umaLinha(item.recorte)}`
    return cortarComReticencias(linha, fatia)
  })
  return caberNoTeto([cabecalho, ...linhas]).join('\n')
}

export function montarBlocoSecao(
  estado: { fonte: FonteDoAchado | null; texto: string; cortado: boolean } | 'nao_encontrado' | 'indisponivel',
): string {
  if (estado === 'indisponivel') return SECAO_FORA
  if (estado === 'nao_encontrado') return SECAO_NADA
  const cabecalho = estado.fonte ? `[secao] Fonte: ${textoDaFonte(estado.fonte)}` : '[secao]'
  const partes = [cabecalho, neutralizarCerca(estado.texto)]
  if (estado.cortado) partes.push(SECAO_CONTINUA)
  return partes.join('\n')
}

function cortarComReticencias(texto: string, teto: number): string {
  if (texto.length <= teto) return texto
  return `${cortarNoTeto(texto, Math.max(0, teto - 1))}…`
}

function caberNoTeto(linhas: string[]): string[] {
  const mantidas: string[] = []
  let total = 0
  for (const linha of linhas) {
    const custo = mantidas.length === 0 ? linha.length : linha.length + 1
    if (mantidas.length > 0 && total + custo > TETO_BLOCO_CONHECIMENTO) break
    mantidas.push(linha)
    total += custo
  }
  const unica = mantidas[0]
  if (mantidas.length === 1 && unica.length > TETO_BLOCO_CONHECIMENTO) {
    mantidas[0] = `${cortarNoTeto(unica, TETO_BLOCO_CONHECIMENTO - 1)}…`
  }
  return mantidas
}

function umaLinha(texto: string): string {
  return neutralizarCerca(texto ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
}
