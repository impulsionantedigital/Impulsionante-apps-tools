//
// Junta o metadado de cada dispositivo (`MotorDecreto.incisos`) com o veredito calculado
// (`Resultado.incisos`) — a mesma junção que `Resultado.tsx` já fazia inline para desenhar
// cartão, mas aqui reutilizável por quem só precisa SABER se há dispositivo aplicável, sem
// desenhar nada (ver `BotaoPeticao.tsx` e os geradores em `motores/*/peticoes.ts`).
//
// 🔴 Serve a TODOS os decretos: nada de `art9_I` ou de um decreto específico aqui.

import type { MetaInciso, MotorDecreto, Resultado, ResultadoInciso } from './tipos'

export type GrupoInciso = 'indulto' | 'comutacao'

export type EnquadramentoResolvido = MetaInciso & ResultadoInciso

/** Metadado + veredito de cada dispositivo do grupo, na ordem do decreto. Dispositivo sem
 *  veredito calculado (não deveria acontecer — ver teste de reconciliação do motor) é omitido. */
export function enquadramentosDe(
  motor: MotorDecreto,
  resultado: Resultado,
  grupo: GrupoInciso,
): EnquadramentoResolvido[] {
  const porId = new Map(resultado.incisos.map((i) => [i.id, i]))
  const resolvidos: EnquadramentoResolvido[] = []
  for (const meta of motor.incisos[grupo]) {
    const r = porId.get(meta.id)
    if (r) resolvidos.push({ ...meta, ...r })
  }
  return resolvidos
}

/** Há pelo menos um dispositivo do grupo cuja regra geral o sentenciado preenche? */
export function temAplicavel(motor: MotorDecreto, resultado: Resultado, grupo: GrupoInciso): boolean {
  return enquadramentosDe(motor, resultado, grupo).some((e) => e.geral === 'preenche')
}

/** O primeiro dispositivo do grupo, na ordem do decreto, cuja regra geral o sentenciado
 *  preenche — é nele que a petição se apoia quando o membro escolhe "Indulto" ou "Comutação"
 *  sem indicar um artigo específico. `null` quando nenhum se aplica. */
export function primeiroAplicavel(
  motor: MotorDecreto,
  resultado: Resultado,
  grupo: GrupoInciso,
): EnquadramentoResolvido | null {
  return enquadramentosDe(motor, resultado, grupo).find((e) => e.geral === 'preenche') ?? null
}
