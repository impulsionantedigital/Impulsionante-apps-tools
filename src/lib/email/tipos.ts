export type TipoModelo =
  | 'boas_vindas'
  | 'recuperacao_senha'
  | 'entrega_produto'
  | 'pagamento_recebido'
  | 'degustacao_liberada'

export const TIPOS = [
  'boas_vindas',
  'recuperacao_senha',
  'entrega_produto',
  'pagamento_recebido',
  'degustacao_liberada',
] as const satisfies readonly TipoModelo[]

export const CAMPOS: Record<TipoModelo, readonly string[]> = {
  boas_vindas: ['MEMBER_NAME', 'MEMBER_EMAIL', 'TEMP_PASSWORD', 'LOGIN_URL'],
  recuperacao_senha: ['MEMBER_NAME', 'TEMP_PASSWORD', 'LOGIN_URL'],
  entrega_produto: ['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL'],
  pagamento_recebido: ['MEMBER_NAME', 'OFFER_NAME', 'PRODUCT_NAME', 'EXPIRES_AT', 'VALUE', 'TRANSACTION', 'LOGIN_URL'],
  // 🔴 Prazo PRÓPRIO do brinde. Não pode ser o `entrega_produto`: aquele manda um único
  // `EXPIRES_AT`, o vencimento mais TARDIO, e numa oferta mista — anual vendido, 7 dias de brinde —
  // o brinde morreria anunciado com a data da assinatura.
  degustacao_liberada: ['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL'],
}

export function ehTipoConhecido(valor: string): valor is TipoModelo {
  return (TIPOS as readonly string[]).includes(valor)
}
