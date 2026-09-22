import type { DetalheAcesso, EstadoAcesso } from './acesso'

/**
 * Quantos dias antes do vencimento um acesso COMPRADO passa a avisar.
 *
 * 🔴 A degustação não usa este número: ela avisa sempre, desde o primeiro dia. O prazo dela é
 * curto por definição, e "faltam 7 dias" num trial de 3 dias seria um aviso que nunca apareceria.
 */
export const DIAS_DE_AVISO_DE_VENCIMENTO = 7

/**
 * Qual recado a tela do produto dá sobre o acesso, e o que ele oferece.
 *
 * `checkout` é nulo quando não há botão — e nulo também quando o produto ainda tem o marcador de
 * substituição no catálogo: sem endereço de venda, mostrar botão não levaria a lugar nenhum.
 */
export type AvisoAcesso =
  | { tipo: 'nada' }
  | { tipo: 'vencendo'; diasRestantes: number }
  | { tipo: 'trial'; diasRestantes: number | null }
  | { tipo: 'expirado' }
  | { tipo: 'trialExpirado' }

/**
 * Decide o aviso. Função pura de propósito: a regra é do domínio, e a tela só a desenha — assim as
 * cinco situações ficam fixadas em teste, sem precisar renderizar nada.
 *
 * 🔴 A ordem das perguntas É a regra. `degustou` vem antes de `estado`, porque um trial VENCIDO
 * precisa de recado próprio: "sua degustação acabou" converte de um jeito que "acesso expirado"
 * não converte, e `detalhe.trial` já é `false` nesse caso (ele responde sobre o acesso de AGORA).
 */
export function avisoDeAcesso(args: {
  estado: EstadoAcesso
  detalhe: DetalheAcesso
}): AvisoAcesso {
  const { estado, detalhe } = args

  // Nunca teve acesso: a tela nem existe (há redirecionamento antes de chegar aqui).
  if (estado === 'nunca') return { tipo: 'nada' }

  if (estado === 'encerrado') {
    // Já degustou alguma vez neste produto: o recado é de degustação, não de renovação.
    return detalhe.degustou ? { tipo: 'trialExpirado' } : { tipo: 'expirado' }
  }

  // Daqui para baixo o acesso está ativo.
  if (detalhe.trial) return { tipo: 'trial', diasRestantes: detalhe.diasRestantes }
  // Acesso comprado e folgado: a tela fica limpa.
  if (detalhe.diasRestantes === null || detalhe.diasRestantes > DIAS_DE_AVISO_DE_VENCIMENTO) {
    return { tipo: 'nada' }
  }
  return { tipo: 'vencendo', diasRestantes: detalhe.diasRestantes }
}

/** O texto de cada aviso. Separado da decisão, para a regra poder ser testada sem o texto junto. */
export function textoDoAviso(aviso: AvisoAcesso): { titulo: string; corpo: string; acao: string } | null {
  const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dia(s)`)
  switch (aviso.tipo) {
    case 'nada':
      return null
    case 'vencendo':
      return {
        titulo: 'Seu acesso está perto de vencer.',
        corpo:
          `Faltam ${dias(aviso.diasRestantes)} para o seu acesso terminar. ` +
          'Se a cobrança é recorrente, confira se o cartão está ativo e com limite; ' +
          'se o pagamento foi por Pix, faça o próximo antes do vencimento. ' +
          'A renovação é feita na Hotmart — este CRM não cobra. ' +
          'Os cálculos que você já tem continuam guardados, mas criar e editar param quando o prazo acabar.',
        // 🔴 Este aviso NÃO leva botão: quem ainda tem acesso renova na Hotmart, e um botão aqui
        // competiria com o trabalho da pessoa. O botão é para quem perdeu o acesso ou experimenta.
        acao: 'Renove na Hotmart antes do vencimento',
      }
    case 'trial':
      return {
        titulo: 'Você recebeu acesso Bônus a este produto.',
        corpo:
          'Seu acesso é uma degustação' +
          (aviso.diasRestantes === null ? '' : ` de ${dias(aviso.diasRestantes)}`) +
          '. Você está usando todos os recursos, sem as limitações de uma demonstração. ' +
          'Quando o prazo acabar, criar e editar param — os cálculos que você fizer agora ficam guardados. ' +
          'Para garantir o seu acesso, escolha um dos planos disponíveis.',
        acao: 'Escolher um plano',
      }
    case 'expirado':
      return {
        titulo: 'Seu acesso expirou.',
        corpo:
          'Os cálculos que você já fez continuam aqui, disponíveis para consulta. ' +
          'Para criar novos cálculos ou editar os antigos, renove o acesso.',
        acao: 'Renovar o acesso',
      }
    case 'trialExpirado':
      return {
        titulo: 'Sua degustação terminou.',
        corpo:
          'Os cálculos que você fez durante a degustação continuam guardados e disponíveis para consulta. ' +
          'Para continuar criando e editando, assine o acesso completo.',
        acao: 'Assinar agora',
      }
  }
}
