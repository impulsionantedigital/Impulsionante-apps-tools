import type { Campo } from './tipos'

/**
 * O valor com que um campo nasce no questionário.
 *
 * O `padrao` declarado pelo decreto vence sempre. Na ausência dele, 'NÃO'
 * quando estiver entre as opções, senão a primeira opção. Campo que não é
 * seleção nasce vazio.
 *
 * 🔴 Existe para a tela nunca mostrar um select em branco: o motor lê resposta
 * vazia como 'NÃO' em silêncio, e o advogado veria um traço onde o cálculo
 * considerou uma resposta.
 */
export function padraoDoCampo(campo: Campo): string {
  if (campo.tipo !== 'selecao') return ''
  if (campo.padrao) return campo.padrao
  if (campo.opcoes.includes('NÃO')) return 'NÃO'
  return campo.opcoes[0] ?? ''
}
