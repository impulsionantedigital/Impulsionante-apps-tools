import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2025 } from './questionario'

/**
 * Decreto nº 12.970/2025 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 *
 * ⚠️ ESQUELETO. As Tasks 5 e 6 substituem incisos, avisos e calcular pelos
 * transcritos de validacao/2025/.
 */
export const motor2025: MotorDecreto = {
  id: 'indulto-comutacao-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '0.1.0',
  dataBase: '2025-12-25',
  questionario: QUESTIONARIO_2025,
  incisos: {
    indulto: [
      {
        id: 'art9_I',
        rotulo: 'Art. 9º, I',
        descricao: 'Pena ≤ 8 anos, sem violência: 1/5 (não reinc.) ou 1/3 (reinc.).',
        temRegraEspecial: true,
      },
    ],
    comutacao: [],
  },
  avisos: {
    fixos: ['Esta ferramenta não dispensa conhecimento técnico sobre o assunto.'],
    validarJuridicamente: [
      'A "pena após a comutação" usa a pena total imposta como base (fórmula original).',
    ],
  },
  calcular() {
    return {
      incisos: [{ id: 'art9_I', geral: 'nao_preenche', especial: 'nao_preenche' }],
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
