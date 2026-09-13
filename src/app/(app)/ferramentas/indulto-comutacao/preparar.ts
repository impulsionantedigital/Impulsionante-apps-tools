import { z } from 'zod'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import type { Entrada, MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

// Módulo SEM `'use server'` de propósito: `preparar` é lógica pura (validação,
// minimização de dado e recálculo), não uma server action, e por isso pode ser
// importada e testada diretamente — inclusive por um teste que não passa por
// sessão nem por rede.

export const Dados = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'Dê um título ao cálculo — o nº de execução serve.')
    .max(200, 'Use no máximo 200 caracteres no título.'),
  decretoId: z.string().trim().min(1, 'Escolha o decreto.'),
  entrada: z.record(z.string(), z.unknown()),
})

/** Todas as chaves de campo que o questionário deste motor declara. */
function chavesDoQuestionario(motor: MotorDecreto): Set<string> {
  const chaves = new Set<string>()
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) chaves.add(campo.chave)
  }
  return chaves
}

/**
 * Só as chaves que o próprio motor conhece — minimização de dado pessoal (LGPD,
 * spec §9). Uma chave fora do questionário é descartada em silêncio: o motor
 * nunca a lê, então gravá-la só aumentaria o que a tabela guarda sobre o
 * sentenciado sem nenhum uso.
 */
function filtrarEntrada(bruto: Record<string, unknown>, motor: MotorDecreto): Entrada {
  const chaves = chavesDoQuestionario(motor)
  const entrada: Entrada = {}
  for (const [chave, valor] of Object.entries(bruto)) {
    if (chaves.has(chave)) entrada[chave] = valor as Entrada[string]
  }
  return entrada
}

/**
 * Valida, filtra e RECALCULA — nunca lança.
 *
 * O cliente manda a entrada, nunca o resultado: o que fica gravado é sempre
 * produto do motor desta versão, e um cliente adulterado não consegue escrever
 * um resultado inventado com aparência de auditoria.
 *
 * 🔴 `motor.calcular` roda dentro do `try`: uma entrada forjada (um objeto no
 * lugar de string, um BigInt, etc.) pode fazer o motor lançar, e uma action
 * nunca pode lançar — só redirecionar por sessão/licença. Ver `acoes.ts`.
 */
export function preparar(
  bruto: unknown,
): { erro: string } | { motor: MotorDecreto; titulo: string; entrada: Entrada; resultado: Resultado } {
  const r = Dados.safeParse(bruto)
  if (!r.success) {
    return { erro: r.error.issues[0]?.message ?? 'Confira os dados do cálculo.' }
  }
  const motor = motorPorId(r.data.decretoId)
  if (!motor) return { erro: 'Este decreto não está disponível na calculadora.' }
  const entrada = filtrarEntrada(r.data.entrada, motor)

  try {
    const resultado = motor.calcular(entrada)
    return { motor, titulo: r.data.titulo, entrada, resultado }
  } catch (err) {
    console.error('[indulto-comutacao] preparar', detalheSeguro(err))
    return { erro: 'Confira os dados do cálculo.' }
  }
}
