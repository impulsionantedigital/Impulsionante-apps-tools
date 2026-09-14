// Modelos de petição do Decreto 12.970/2025 — TEXTO JURÍDICO confirmado pelo usuário em
// 14/09/2026 (indulto: modelo enviado pronto; comutação: Seção 3 revisada nesta sessão para a
// regra real do decreto — 2/3 para crime impeditivo; 1/5 se primário ou 1/4 se reincidente para
// crime permissivo, a mesma lógica de `c13`/`c13_4` em `motor.ts`). Mudar a REDAÇÃO aqui é
// decisão jurídica do usuário, não refatoração de código.
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO — mesmo aviso de `questionario.ts`/`incisos.ts`/`motor.ts`.
// Campo sem fonte de dado no questionário (vara, comarca, nome do advogado, OAB, cidade)
// permanece como texto para o advogado preencher à mão — não é bug, é limite real do que o
// cálculo sabe.

import type { DadosPeticao, MotorDecreto } from '../../tipos'
import type { Tempo } from '../../tempo'
import { dias, fmtDias } from '../../tempo'
import { primeiroAplicavel } from '../../enquadramentos'
import { formatarAnexoTexto } from '../../anexo-texto'

const NUMERO_DECRETO = '12.970/2025'

function hoje(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function dataBaseFormatada(motor: MotorDecreto): string {
  const [ano, mes, dia] = motor.dataBase.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Percentual com uma casa decimal; `0` quando o denominador é zero (evita `Infinity`/`NaN`). */
function pct(numerador: number, denominador: number): string {
  if (denominador <= 0) return '0'
  return (Math.round((numerador / denominador) * 1000) / 10).toString()
}

/** Trata ausência/vazio do campo como 'NÃO' — o padrão real de `padraoDoCampo` para esses
 *  campos (`opcoes: ['SIM','NÃO']`, sem `padrao` customizado), nunca o fato adverso. */
function equivaleANao(v: unknown): boolean {
  return v == null || v === '' || v === 'NÃO'
}

function anexarAnexo(corpo: string, motor: MotorDecreto, dados: DadosPeticao): string {
  return `${corpo}\n\n---\n\n${formatarAnexoTexto(motor, dados.entrada, dados.resultado, dados.titulo)}`
}

export function gerarPeticaoIndulto2025(motor: MotorDecreto, dados: DadosPeticao): string {
  const { entrada, resultado } = dados
  const enquadramento = primeiroAplicavel(motor, resultado, 'indulto')
  if (!enquadramento) return ''

  const sentenciado = String(entrada.sentenciado ?? '').trim() || '[NOME DO SENTENCIADO]'
  const execucao = String(entrada.execucao ?? '').trim() || '[NÚMERO DA EXECUÇÃO]'
  const penaImpeditivaDias = dias(entrada.penaImpeditiva as Tempo | null | undefined)
  const penaCumpridaImpeditivos = resultado.resumo.penaCumpridaImpeditivos
  const doisTercos = resultado.resumo.fracoes.doisTercosImpeditivos

  const secao3 =
    penaImpeditivaDias > 0
      ? `3. DA EXISTÊNCIA DE CRIME IMPEDITIVO E DO CUMPRIMENTO DO REQUISITO DE 2/3

O sentenciado possui condenação por crime impeditivo à concessão do indulto, nos termos do Decreto nº ${NUMERO_DECRETO}.

Todavia, a existência de crime impeditivo não afasta, por si só, a possibilidade de concessão do indulto em relação às demais penas, devendo ser observada a regra específica estabelecida no Decreto.

No caso concreto, a pena referente ao crime impeditivo corresponde a ${fmtDias(penaImpeditivaDias)}, tendo o sentenciado cumprido, até a data de referência do Decreto, ${fmtDias(penaCumpridaImpeditivos)}, correspondente a ${pct(penaCumpridaImpeditivos, penaImpeditivaDias)}% da respectiva pena.

Considerando que o Decreto exige o cumprimento de 2/3 (dois terços) da pena relativa ao crime impeditivo, verifica-se que o requisito encontra-se preenchido, conforme demonstrado:

- Pena do crime impeditivo: ${fmtDias(penaImpeditivaDias)};
- 2/3 da pena: ${fmtDias(doisTercos)};
- Tempo efetivamente cumprido: ${fmtDias(penaCumpridaImpeditivos)};
- Requisito de 2/3: preenchido.

Desse modo, embora exista condenação por crime impeditivo, o requisito específico previsto no Decreto foi satisfeito, não havendo óbice à análise e ao reconhecimento do indulto em relação às demais penas que preencham os requisitos do ato presidencial.`
      : `3. DA AUSÊNCIA DE CRIME IMPEDITIVO

O sentenciado não possui condenação por crime impeditivo à concessão do indulto, não havendo, portanto, óbice algum sob esse aspecto.`

  const semFaltaGrave = equivaleANao(entrada.faltaGraveAno) && equivaleANao(entrada.faltaGraveExecucao)
  const secao4 = `4. DA AUSÊNCIA DE FALTA GRAVE IMPEDITIVA

Quanto ao requisito relacionado à conduta carcerária, verifica-se que ${
    semFaltaGrave
      ? 'não consta falta grave no período previsto pelo Decreto'
      : 'a falta grave registrada não se encontra dentro do período impeditivo estabelecido pelo Decreto'
  }.

Assim, também sob esse aspecto, não há impedimento ao reconhecimento do direito ao indulto.`

  const corpo = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ___ VARA DE EXECUÇÕES PENAIS DA COMARCA DE __________

Execução Penal nº ${execucao}

${sentenciado}, já qualificado nos autos da execução penal em epígrafe, por intermédio de seu advogado, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no Decreto nº ${NUMERO_DECRETO}, requerer o

RECONHECIMENTO DO DIREITO AO INDULTO

pelos fundamentos a seguir expostos.

1. DO DECRETO APLICÁVEL

O sentenciado encontra-se em execução de pena abrangida pelo Decreto nº ${NUMERO_DECRETO}, que estabelece as hipóteses e os requisitos para a concessão do indulto.

No caso concreto, mostra-se aplicável o disposto no ${enquadramento.rotulo} do referido Decreto (${enquadramento.descricao}), que prevê a concessão do indulto ao condenado que preencher os requisitos nele estabelecidos.

2. DO PREENCHIMENTO DO REQUISITO OBJETIVO

Na data de referência estabelecida pelo Decreto, ${dataBaseFormatada(motor)}, o sentenciado havia cumprido ${fmtDias(resultado.resumo.totalCumprido)} de pena.

A pena considerada para fins de análise corresponde a ${fmtDias(resultado.resumo.totalImposto)}, sendo que o Decreto exige o cumprimento de ${enquadramento.descricao}

Conforme cálculo de liquidação da pena, considerando-se o tempo de prisão efetivamente cumprido, a detração e os dias de remição regularmente reconhecidos, o requisito temporal encontra-se preenchido.

Assim, o requisito objetivo previsto no Decreto está devidamente satisfeito.

${secao3}

${secao4}

5. DO PREENCHIMENTO DOS DEMAIS REQUISITOS

Analisados os demais requisitos estabelecidos pelo Decreto nº ${NUMERO_DECRETO}, verifica-se que o sentenciado também atende às condições previstas para a concessão do indulto.

Em síntese:

- Data de referência: ${dataBaseFormatada(motor)};
- Pena total: ${fmtDias(resultado.resumo.totalImposto)};
- Pena cumprida até a data de referência: ${fmtDias(resultado.resumo.totalCumprido)};
- Requisito temporal exigido: ${enquadramento.descricao}

Portanto, estando presentes os requisitos estabelecidos no Decreto, o sentenciado faz jus ao reconhecimento do direito ao indulto.

6. DOS PEDIDOS

Diante do exposto, requer:

a) o reconhecimento de que o sentenciado preenche os requisitos previstos no Decreto nº ${NUMERO_DECRETO}, ${enquadramento.rotulo};

b) o reconhecimento do direito ao indulto, com a consequente declaração de extinção da pena alcançada pelo ato presidencial, nos termos da legislação aplicável;

c) seja determinada a atualização do cálculo de liquidação da pena no SEEU, com o correto lançamento do indulto e dos respectivos efeitos;

Termos em que,
Pede deferimento.

[Cidade], ${hoje()}.

[NOME DO ADVOGADO]
OAB/[UF] nº [_____]`

  return anexarAnexo(corpo, motor, dados)
}

export function gerarPeticaoComutacao2025(motor: MotorDecreto, dados: DadosPeticao): string {
  const { entrada, resultado } = dados
  const enquadramento = primeiroAplicavel(motor, resultado, 'comutacao')
  if (!enquadramento) return ''

  const sentenciado = String(entrada.sentenciado ?? '').trim() || '[NOME DO SENTENCIADO]'
  const execucao = String(entrada.execucao ?? '').trim() || '[NÚMERO DA EXECUÇÃO]'
  const reincidente = entrada.reincidente === 'SIM'
  const penaImpeditivaDias = dias(entrada.penaImpeditiva as Tempo | null | undefined)
  const ehImpeditivo = penaImpeditivaDias > 0

  const penaConsiderada = ehImpeditivo ? resultado.resumo.penaCumpridaImpeditivos : resultado.resumo.totalCumprido
  const fracaoExigidaDias = ehImpeditivo
    ? resultado.resumo.fracoes.doisTercosImpeditivos
    : reincidente
      ? resultado.resumo.fracoes.umQuarto
      : resultado.resumo.fracoes.umQuinto
  const fracaoExigidaRotulo = ehImpeditivo ? '2/3' : reincidente ? '1/4' : '1/5'
  const basePena = ehImpeditivo ? penaImpeditivaDias : resultado.resumo.totalImposto

  const secao3 = `3. DO PREENCHIMENTO DO REQUISITO TEMPORAL, CONFORME A NATUREZA DO CRIME E A REINCIDÊNCIA

O Decreto nº ${NUMERO_DECRETO} estabelece frações distintas para a comutação de pena, a depender da natureza do crime e da condição de reincidência do sentenciado:

- crimes impeditivos (hediondos ou equiparados): exige-se o cumprimento de 2/3 (dois terços) da pena;
- crimes não impeditivos (permissivos): exige-se o cumprimento de 1/5 (um quinto) da pena, se o sentenciado for primário, ou de 1/4 (um quarto) da pena, se reincidente.

No caso concreto, o sentenciado é ${reincidente ? 'reincidente' : 'primário'}, e sua condenação enquadra-se como ${ehImpeditivo ? 'crime impeditivo' : 'crime permissivo'}, de modo que a fração temporal aplicável corresponde a ${fracaoExigidaRotulo} da pena.

A pena considerada para essa fração corresponde a ${fmtDias(basePena)}, tendo o sentenciado cumprido, até a data de referência do Decreto, ${fmtDias(penaConsiderada)}, correspondente a ${pct(penaConsiderada, basePena)}% da respectiva pena.

Considerando a fração exigida, verifica-se que o requisito temporal encontra-se preenchido, conforme demonstrado:

- Pena considerada: ${fmtDias(basePena)};
- Fração exigida (${fracaoExigidaRotulo}): ${fmtDias(fracaoExigidaDias)};
- Tempo efetivamente cumprido: ${fmtDias(penaConsiderada)};
- Requisito temporal: preenchido.

Assim, estando cumprida a fração exigida para essa categoria de pena, deve ser reconhecido o direito à comutação, desde que igualmente preenchidos os demais requisitos objetivos e subjetivos previstos no Decreto.`

  const semFaltaGrave = equivaleANao(entrada.faltaGraveAno) && equivaleANao(entrada.faltaGraveExecucao)
  const secao4 = `4. DA AUSÊNCIA DE FALTA GRAVE IMPEDITIVA

Quanto ao requisito relacionado à conduta carcerária, verifica-se que ${
    semFaltaGrave
      ? 'não consta falta grave no período previsto pelo Decreto'
      : 'a falta grave registrada não se encontra dentro do período impeditivo estabelecido pelo Decreto'
  }.

Assim, também sob esse aspecto, não há impedimento ao reconhecimento do direito à comutação.`

  const corpo = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ___ VARA DE EXECUÇÕES PENAIS DA COMARCA DE __________

Execução Penal nº ${execucao}

${sentenciado}, já qualificado nos autos da execução penal em epígrafe, por intermédio de seu advogado, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no Decreto nº ${NUMERO_DECRETO}, requerer o

RECONHECIMENTO DO DIREITO À COMUTAÇÃO

pelos fundamentos a seguir expostos.

1. DO DECRETO APLICÁVEL

O sentenciado encontra-se em execução de pena abrangida pelo Decreto nº ${NUMERO_DECRETO}, que estabelece as hipóteses e os requisitos para a concessão da comutação.

No caso concreto, mostra-se aplicável o disposto no ${enquadramento.rotulo} do referido Decreto (${enquadramento.descricao}), que prevê a concessão da comutação ao condenado que preencher os requisitos nele estabelecidos.

2. DO PREENCHIMENTO DO REQUISITO OBJETIVO

Na data de referência estabelecida pelo Decreto, ${dataBaseFormatada(motor)}, o sentenciado havia cumprido ${fmtDias(resultado.resumo.totalCumprido)} de pena.

A pena considerada para fins de análise corresponde a ${fmtDias(resultado.resumo.totalImposto)}, sendo que o Decreto exige o cumprimento de ${enquadramento.descricao}

Conforme cálculo de liquidação da pena, considerando-se o tempo de prisão efetivamente cumprido, a detração e os dias de remição regularmente reconhecidos, o requisito temporal encontra-se preenchido.

Assim, o requisito objetivo previsto no Decreto está devidamente satisfeito.

${secao3}

${secao4}

5. DO PREENCHIMENTO DOS DEMAIS REQUISITOS

Analisados os demais requisitos estabelecidos pelo Decreto nº ${NUMERO_DECRETO}, verifica-se que o sentenciado também atende às condições previstas para a concessão da comutação.

Em síntese:

- Data de referência: ${dataBaseFormatada(motor)};
- Pena total: ${fmtDias(resultado.resumo.totalImposto)};
- Pena cumprida até a data de referência: ${fmtDias(resultado.resumo.totalCumprido)};
- Requisito temporal exigido: ${enquadramento.descricao}

Portanto, estando presentes os requisitos estabelecidos no Decreto, o sentenciado faz jus ao reconhecimento do direito à comutação.

6. DOS PEDIDOS

Diante do exposto, requer:

a) o reconhecimento de que o sentenciado preenche os requisitos previstos no Decreto nº ${NUMERO_DECRETO}, ${enquadramento.rotulo}, para a comutação;

b) o reconhecimento do direito à comutação, com a consequente redução da pena alcançada pelo ato presidencial, nos termos da legislação aplicável;

c) seja determinada a atualização do cálculo de liquidação da pena no SEEU, com o correto lançamento da comutação e dos respectivos efeitos;

Termos em que,
Pede deferimento.

[Cidade], ${hoje()}.

[NOME DO ADVOGADO]
OAB/[UF] nº [_____]`

  return anexarAnexo(corpo, motor, dados)
}
