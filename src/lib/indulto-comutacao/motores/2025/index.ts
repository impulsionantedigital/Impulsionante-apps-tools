import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2025 } from './questionario'
import { INCISOS_INDULTO_2025, INCISOS_COMUTACAO_2025, AVISOS_2025 } from './incisos'

/**
 * Decreto nº 12.970/2025 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 *
 * ⚠️ ESQUELETO. A Task 6 substitui `calcular` pelo transcrito de validacao/2025/.
 */
export const motor2025: MotorDecreto = {
  id: 'indulto-comutacao-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '0.1.0',
  dataBase: '2025-12-25',
  questionario: QUESTIONARIO_2025,
  incisos: { indulto: INCISOS_INDULTO_2025, comutacao: INCISOS_COMUTACAO_2025 },
  avisos: AVISOS_2025,
  calcular() {
    const todos = [...INCISOS_INDULTO_2025, ...INCISOS_COMUTACAO_2025]
    return {
      incisos: todos.map((m) => ({
        id: m.id,
        geral: 'nao_preenche' as const,
        especial: m.temRegraEspecial ? ('nao_preenche' as const) : ('sem_previsao' as const),
      })),
      resumo: {
        totalImposto: 0,
        totalCumprido: 0,
        penaCumpridaImpeditivos: 0,
        remanescente: 0,
        fracoes: {
          doisTercosImpeditivos: 0,
          umQuinto: 0,
          umQuarto: 0,
          umTerco: 0,
          metade: 0,
        },
      },
      avisos: [],
    }
  },
}
