// O nome do assistente vai em cima de cada resposta que ele manda, para o cliente saber que
// quem fala é o assistente, e não uma pessoa do time. No WhatsApp ele sai em negrito
// (`*Nome:*`); em canal sem essa sintaxe, sai como texto simples (`Nome:`).
//
// O cabeçalho é gravado junto com a mensagem (é o que o cliente recebeu). Por isso ele precisa
// sair de novo antes de a mensagem voltar para o modelo como histórico, senão o modelo passa a
// escrever o próprio nome na resposta, e o cliente o vê duas vezes.

const TETO_NOME_NO_CABECALHO = 60

// `*Qualquer coisa:*` sozinho na primeira linha. Só reconhece a forma em negrito, que é a que
// o modelo não produz por conta própria numa primeira linha (ele não escreve título).
const CABECALHO_NEGRITO = /^\*[^*\n]{1,60}:\*[ \t]*(\r?\n|$)/

// Rótulo que versões antigas do histórico mostravam ao modelo e que ele às vezes copiava.
const ROTULO_ANTIGO = /^\[assistente\][ \t]*/i

function limparNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .replace(/[*\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TETO_NOME_NO_CABECALHO)
    .trim()
}

/** A linha de cabeçalho para o nome dado, ou '' quando não há nome. */
export function linhaDoCabecalho(nome: string | null | undefined, sintaxeWhatsapp: boolean): string {
  const limpo = limparNome(nome)
  if (!limpo) return ''
  return sintaxeWhatsapp ? `*${limpo}:*` : `${limpo}:`
}

/** Coloca o nome do assistente em cima do texto. Sem nome, devolve o texto como veio. */
export function comCabecalho(texto: string, nome: string | null | undefined, sintaxeWhatsapp: boolean): string {
  const linha = linhaDoCabecalho(nome, sintaxeWhatsapp)
  const corpo = semProprioNome(texto, nome)
  if (!linha) return corpo
  return corpo ? `${linha}\n${corpo}` : linha
}

/**
 * Tira o cabeçalho (e o rótulo antigo "[assistente]") do começo de uma mensagem do assistente.
 * A forma em negrito sai sempre; a forma simples (`Nome:`) só sai quando bate com o nome dado,
 * para não comer uma primeira linha legítima como "Ingredientes:".
 */
export function semCabecalho(texto: string, nome?: string | null): string {
  let t = (texto ?? '').replace(ROTULO_ANTIGO, '')
  const m = t.match(CABECALHO_NEGRITO)
  if (m) {
    t = t.slice(m[0].length)
  } else {
    const simples = linhaDoCabecalho(nome, false)
    if (simples) {
      const primeira = t.split(/\r?\n/, 1)[0] ?? ''
      if (primeira.trim() === simples) t = t.slice(primeira.length).replace(/^\r?\n/, '')
    }
  }
  return t.replace(ROTULO_ANTIGO, '')
}

// Para a resposta recém-gerada: tira só o rótulo antigo e uma primeira linha que seja o próprio
// nome (em negrito ou não), caso o modelo o tenha escrito. Outras primeiras linhas ficam.
function semProprioNome(texto: string, nome: string | null | undefined): string {
  let t = (texto ?? '').replace(ROTULO_ANTIGO, '')
  const formas = [linhaDoCabecalho(nome, true), linhaDoCabecalho(nome, false)].filter(Boolean)
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  if (formas.includes(primeira.trim())) t = t.slice(primeira.length).replace(/^\r?\n/, '')
  return t.trimStart()
}
