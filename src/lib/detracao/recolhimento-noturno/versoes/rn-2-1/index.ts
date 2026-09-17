// src/lib/detracao/recolhimento-noturno/versoes/rn-2-1/index.ts
//
// 🔴 A VERSÃO RN-2.1 DA CALCULADORA DE RECOLHIMENTO NOTURNO — CONGELADA.
//
// O que mudou em relação à RN-2.0:
//
//   • O MODO SIMPLES PASSOU A SER O ÚNICO. Saíram o toggle "avançado", os múltiplos segmentos, o
//     fuso configurável, o monitoramento eletrônico e as observações. A tela edita UM período.
//   • Os feriados MUNICIPAIS E ESTADUAIS (`feriadosIntegral`) subiram para o modo simples. Eles já
//     eram lidos pelo motor desde a RN-2.0 — o que faltava era um jeito de preenchê-los sem
//     esconder-se atrás do modo avançado, que era o único lugar onde apareciam.
//
// 🔴 O CÁLCULO NÃO MUDOU. A precedência (folga integral → feriado → regra noturna), a contagem por
// dia, a conversão em anos/meses/dias e a lista nacional de `feriados.ts` são IDÊNTICAS às da
// RN-2.0. Esta versão difere na TELA e no que a entrada carrega — não na aritmética. É por isso que
// os números da RN-2.0 e da RN-2.1 batem para a mesma entrada, e há teste que compara as duas.
//
// ⚠️ Depois de entrar em uso, esta pasta NÃO MUDE. Correção ou regra nova vira `../rn-2-2/`.

import { calcular } from './motor'
import { gerarTextoPeticao } from './peticao'
import { segmentoFormularioEmBranco, entradaFormularioParaCalculo, segmentoParaRegra } from './formulario'
import { mesmoResultado } from './comparar'
import type { VersaoRecolhimento } from '../contrato'
import type { EntradaCalculo } from './tipos'
import type { EntradaFormulario, SegmentoFormulario } from './formulario'

export const VERSAO = 'RN-2.1' as const


export const rn21: VersaoRecolhimento = {
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
