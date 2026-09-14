/**
 * Data e hora para a tela, sempre no fuso de Brasília.
 *
 * 🔴 O `timeZone` NÃO é decorativo. Onde isto é usado — a listagem dos cálculos — quem renderiza
 * é um componente de SERVIDOR, e o contentor do EasyPanel roda em UTC. Sem fuso explícito, um
 * cálculo salvo às 23h30 apareceria como 02h30 do dia seguinte: hora errada e data errada, para
 * um usuário que está no Brasil. Mesma convenção de `src/lib/vendas/formatos.ts`, que já formata
 * vencimento de venda assim.
 *
 * Em componente de cliente isto não é necessário — lá o fuso do navegador é o fuso certo — mas
 * usar aqui também não atrapalha, e evita que a mesma data apareça diferente em duas telas.
 */
const DATA_HORA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatarDataHora(quando: string | Date): string {
  const data = quando instanceof Date ? quando : new Date(quando)
  if (Number.isNaN(data.getTime())) return '—'
  return DATA_HORA_BR.format(data)
}
