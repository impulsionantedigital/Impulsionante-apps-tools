import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2024 } from './questionario'
import { INCISOS_INDULTO_2024, INCISOS_COMUTACAO_2024, AVISOS_2024 } from './incisos'
import { calcular2024 } from './motor'

/**
 * Decreto nº 12.338/2024 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 *
 * Sem `peticoes`: o Decreto 12.338/2024 ainda não tem modelo aprovado, e o
 * contrato torna o campo opcional justamente para isso. O botão "Petição" não
 * aparece até a Task 13.
 */
export const motor2024: MotorDecreto = {
  id: 'indulto-comutacao-2024',
  ano: 2024,
  rotulo: 'Decreto 12.338/2024 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2024-12-25',
  questionario: QUESTIONARIO_2024,
  incisos: { indulto: INCISOS_INDULTO_2024, comutacao: INCISOS_COMUTACAO_2024 },
  avisos: AVISOS_2024,
  calcular: calcular2024,
}
