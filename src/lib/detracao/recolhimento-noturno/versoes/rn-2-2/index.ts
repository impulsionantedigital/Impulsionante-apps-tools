// src/lib/detracao/recolhimento-noturno/versoes/rn-2-2/index.ts
//
// 🔴 A VERSÃO RN-2.2 DA CALCULADORA DE RECOLHIMENTO NOTURNO — CONGELADA.
//
// O que mudou em relação à RN-2.1:
//
//   • Os feriados MUNICIPAIS E ESTADUAIS passam a ter NOME, e não só data. O resumo os lista, e
//     "09/07/2025" sozinho não diz de que feriado se trata nem permite conferir contra o calendário
//     da comarca.
//   • Esses feriados passam a APARECER na lista de feriados considerados, ao lado dos nacionais.
//     Antes só os nacionais eram listados — o resumo dizia "6 feriados" enquanto o membro havia
//     informado 8, e parecia que os dois extras tinham sido ignorados.
//
// 🔴 O CÁLCULO NÃO MUDOU. A precedência (folga integral → feriado → regra noturna), a contagem por
// dia e a conversão em anos/meses/dias são IDÊNTICAS às da RN-2.1 — o que mudou é o que a entrada
// carrega (o nome) e o que o resultado LISTA. O total de dias é o mesmo para a mesma decisão, e há
// teste que compara as duas versões.
//
// ⚠️ Depois de entrar em uso, esta pasta NÃO MUDE. Correção ou regra nova vira `../rn-2-3/`.
import { calcular } from './motor'
import { gerarTextoPeticao } from './peticao'
import { segmentoFormularioEmBranco, entradaFormularioParaCalculo, segmentoParaRegra } from './formulario'
import { mesmoResultado } from './comparar'
import type { VersaoRecolhimento } from '../contrato'
import type { EntradaCalculo } from './tipos'
import type { EntradaFormulario, SegmentoFormulario } from './formulario'

export const VERSAO = 'RN-2.2' as const


export const rn22: VersaoRecolhimento = {
  versao: VERSAO,
  desde: '2026-10',
  resumo: 'Modo simples único, com feriados municipais e estaduais no próprio formulário',
  calcular,
  mesmoResultado,
  gerarTextoPeticao,
  formulario: {
    emBranco: segmentoFormularioEmBranco,
    paraCalculo: entradaFormularioParaCalculo,
    segmentoParaRegra,
  },
}
