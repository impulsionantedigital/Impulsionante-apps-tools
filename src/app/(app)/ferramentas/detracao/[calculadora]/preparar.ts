// src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts
import { z } from 'zod'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

// Módulo SEM `'use server'` de propósito, mesma razão do `preparar.ts` do CIC: é lógica pura
// (validação + recálculo), testável direto, sem sessão nem rede.

const Intervalo = z.object({ inicio: z.string().min(1), fim: z.string().min(1) })
const IntervaloComMotivo = Intervalo.extend({
  motivo: z.string().trim().min(1, 'Descreva o motivo da exclusão.'),
})

const Segmento = z.object({
  inicio: z.string().min(1),
  fim: z.string().min(1),
  horaInicioNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  horaFimNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  diasSemanaNoturno: z.array(z.string()),
  diasFolgaIntegral: z.array(z.string()),
  feriadosIntegral: z.array(z.string()),
  intervalosAdicionais: z.array(Intervalo),
  intervalosExcluidos: z.array(IntervaloComMotivo),
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
    const resultado = calcular(entrada)
    return { titulo: r.data.titulo, entrada, resultado }
  } catch (err) {
    console.error('[detracao] preparar', detalheSeguro(err))
    return { erro: 'Confira os dados do cálculo — datas, horários e intervalos.' }
  }
}
