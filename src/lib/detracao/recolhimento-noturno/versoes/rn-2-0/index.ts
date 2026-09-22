// src/lib/detracao/recolhimento-noturno/versoes/rn-2-0/index.ts
//
// 🔴 A VERSÃO RN-2.0 DA CALCULADORA DE RECOLHIMENTO NOTURNO — CONGELADA.
//
// Este diretório é um instantâneo fechado: motor, tipos, formulário, feriados e petição de UMA
// versão da regra. Depois que uma versão entra em uso, o que está aqui NÃO MUDE — nem correção de
// bug, nem melhoria de mensagem, nem renomeação. Se a regra precisa mudar, nasce uma versão nova em
// `../rn-3-0/` e esta fica exatamente como está.
//
// 🔴 POR QUE CONGELAR, e não converter entradas antigas para o formato novo:
//
// Um cálculo salvo é um DOCUMENTO — pode ter virado petição protocolada. Se a fórmula muda, o
// número daquele documento tem de continuar reproduzível, palavra por palavra, senão ninguém
// consegue defender o que foi juntado aos autos. Converter a entrada para o formato novo (o que a
// tentativa anterior fazia) conserta a tela mas PERDE o documento: o número que aparece passa a ser
// o da fórmula nova, e o antigo só sobrevive como JSON no banco, sem como ser reconstruído.
//
// Com a versão congelada, abrir um cálculo é carregar o pacote que o produziu: o formulário que o
// membro preencheu, o motor que calculou, e o resumo que ele leu. Nada se converte, porque nada
// precisa caber no formato de outra versão.
//
// ⚠️ Adicionar uma versão nova: crie `../rn-X-Y/` copiando a estrutura desta, ajuste o que a regra
// nova exige, e registre-a em `../registro.ts` (no TOPO do array). Nada mais precisa mudar — a
// escolha do motor passa a ser pela versão gravada no cálculo.

import { calcular } from './motor'
import { gerarTextoPeticao } from './peticao'
import { segmentoFormularioEmBranco, entradaFormularioParaCalculo, segmentoParaRegra } from './formulario'
import { mesmoResultado } from './comparar'
import type { VersaoRecolhimento } from '../contrato'
import type { EntradaCalculo } from './tipos'
import type { EntradaFormulario, SegmentoFormulario } from './formulario'

export const VERSAO = 'RN-2.0' as const


export const rn20: VersaoRecolhimento = {
  versao: VERSAO,
  desde: '2026-10',
  resumo: 'Contagem de dias com feriados nacionais e total em anos/meses/dias',
  calcular,
  mesmoResultado,
  gerarTextoPeticao,
  formulario: {
    emBranco: segmentoFormularioEmBranco,
    paraCalculo: entradaFormularioParaCalculo,
    segmentoParaRegra,
  },
}
