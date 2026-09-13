import { CAMPOS, type TipoModelo } from '@/lib/email/tipos'

// Função pura: monta os valores do e-mail que o botão "Enviar teste para mim" enfileira.
// Cada campo do modelo vira «CAMPO» — visível a olho nu na mensagem recebida, para quem está
// revisando o modelo enxergar de imediato onde cada campo cai no texto — e depois
// MEMBER_EMAIL/MEMBER_NAME são sobrescritos com quem pediu o teste, para o e-mail chegar
// numa caixa real mesmo quando o modelo também usa esses dois campos.
export function valoresDeTeste(tipo: TipoModelo, email: string): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const campo of CAMPOS[tipo]) valores[campo] = `«${campo}»`
  valores.MEMBER_EMAIL = email
  valores.MEMBER_NAME = 'Teste'
  return valores
}
