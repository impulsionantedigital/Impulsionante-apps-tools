import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2025 } from './questionario'
import { INCISOS_INDULTO_2025, INCISOS_COMUTACAO_2025, AVISOS_2025 } from './incisos'
import { calcular2025 } from './motor'
import { gerarPeticaoIndulto2025, gerarPeticaoComutacao2025 } from './peticoes'

/**
 * Decreto nº 12.970/2025 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 */
export const motor2025: MotorDecreto = {
  id: 'indulto-comutacao-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2025-12-25',
  questionario: QUESTIONARIO_2025,
  incisos: { indulto: INCISOS_INDULTO_2025, comutacao: INCISOS_COMUTACAO_2025 },
  avisos: AVISOS_2025,
  calcular: calcular2025,
  peticoes: {
    indulto: (dados) => gerarPeticaoIndulto2025(motor2025, dados),
    comutacao: (dados) => gerarPeticaoComutacao2025(motor2025, dados),
  },
}
