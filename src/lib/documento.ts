/**
 * CPF e CNPJ, incluindo o CNPJ alfanumérico da Receita Federal, em que os 12 primeiros
 * caracteres podem ser letras e o dígito verificador usa o código ASCII menos 48.
 *
 * Guardado sempre NORMALIZADO: sem pontuação e com letras em maiúscula. A formatação com pontos
 * é só da tela — é isso que torna confiável a comparação com o que chega da Hotmart.
 */
export function normalizar(valor: string): string {
  return valor.trim().toUpperCase().replace(/[.\/\-\s]/g, '')
}

export function tipo(documento: string): 'cpf' | 'cnpj' | null {
  if (/^\d{11}$/.test(documento)) return 'cpf'
  if (/^[0-9A-Z]{12}\d{2}$/.test(documento)) return 'cnpj'
  return null
}

function digito(base: string, pesos: readonly number[]): string {
  const soma = [...base].reduce((total, c, i) => total + (c.charCodeAt(0) - 48) * pesos[i], 0)
  const resto = soma % 11
  return String(resto < 2 ? 0 : 11 - resto)
}

const PESOS_CPF = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const
const PESOS_CNPJ = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const

export function ehValido(documento: string): boolean {
  // Repetidos (000…, 111…) passam na aritmética do dígito verificador e são lixo clássico.
  if (/^(.)\1+$/.test(documento)) return false
  const t = tipo(documento)
  if (t === 'cpf') {
    const base = documento.slice(0, 9)
    const a = digito(base, PESOS_CPF)
    return documento === base + a + digito(base + a, PESOS_CPF_2)
  }
  if (t === 'cnpj') {
    const base = documento.slice(0, 12)
    const a = digito(base, PESOS_CNPJ)
    return documento === base + a + digito(base + a, PESOS_CNPJ_2)
  }
  return false
}

export function formatar(documento: string): string {
  const t = tipo(documento)
  if (t === 'cpf') return documento.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4')
  if (t === 'cnpj') return documento.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
  return documento
}
