// src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts
import { z } from 'zod'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-0/tipos'

// Módulo SEM `'use server'` de propósito, mesma razão do `preparar.ts` do CIC: é lógica pura
// (validação + recálculo), testável direto, sem sessão nem rede.

const Segmento = z.object({
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  horaInicioNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  horaFimNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  diasSemanaNoturno: z.array(z.string()),
  diasFolgaIntegral: z.array(z.string()),
  feriadosIntegral: z.array(z.string()),
  incluirFeriadosUteis: z.boolean().default(false),
})

export const Dados = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'Dê um título ao cálculo — o nº de execução serve.')
    .max(200, 'Use no máximo 200 caracteres no título.'),
  entrada: z.object({
    timezone: z.string().trim().min(1, 'Informe o fuso horário.'),
    segmentos: z.array(Segmento).min(1, 'Informe ao menos um segmento de regra.'),
    observacoes: z.string().optional(),
    monitoramentoEletronico: z.enum(['sim', 'nao', 'nao_informado']).optional(),
  }),
})

/** Valida, e RECALCULA — nunca lança. O cliente manda a entrada, nunca o resultado (ver Global
 *  Constraints do plano): o que fica gravado é sempre produto do motor desta versão.
 *
 *  🔴 O motor usado aqui é o da versão ATUAL do registro, e o resultado é gravado junto do rótulo
 *  dela (`acoes.ts`). É o par (rótulo, resultado) que, mais tarde, permite reabrir o cálculo com o
 *  motor que o produziu — ver `versoes/registro.ts`.
 *
 *  🔴 `calcular` roda dentro do `try`: uma entrada forjada (data fora do formato, horário
 *  inválido) faz o motor lançar, e uma action nunca pode lançar. */
export function preparar(
  bruto: unknown,
): { erro: string } | { titulo: string; entrada: EntradaCalculo; resultado: ResultadoCalculo } {
  const r = Dados.safeParse(bruto)
  if (!r.success) {
    return { erro: r.error.issues[0]?.message ?? 'Confira os dados do cálculo.' }
  }
  try {
    const entrada = r.data.entrada as EntradaCalculo
    const resultado = versaoAtual().calcular(entrada)
    return { titulo: r.data.titulo, entrada, resultado }
  } catch (err) {
    console.error('[detracao] preparar', detalheSeguro(err))
    return { erro: 'Confira os dados do cálculo — datas e horários.' }
  }
}
