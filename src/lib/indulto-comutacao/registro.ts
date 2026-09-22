// O ponto onde um decreto novo é plugado.
//
// 🔴 IMPORTS ESTÁTICOS, sempre. Varredura de diretório não sobrevive ao bundler
// do Next: o motor some do build sem erro. Para acrescentar 2024 ou 2026, crie a
// pasta em motores/ e acrescente UMA linha no array abaixo.
//
// A ordem importa: do decreto mais recente para o mais antigo, e motorPadrao()
// devolve o primeiro.

import type { MotorDecreto } from './tipos'
import { motor2025 } from './motores/2025'
import { motor2024 } from './motores/2024'

export const REGISTRO: readonly MotorDecreto[] = [motor2025, motor2024]

export function motorPorId(id: string): MotorDecreto | null {
  return REGISTRO.find((m) => m.id === id) ?? null
}

export function motorPadrao(): MotorDecreto {
  return REGISTRO[0]
}
