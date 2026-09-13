// O que a tela mostra em cada cartão do Decreto 12.970/2025, transcrito de
// validacao/2025/ui.js (INCISOS_INDULTO, INCISOS_COMUT e NOTAS).
//
// `temRegraEspecial: false` significa que o §2º NÃO TEM PREVISÃO para aquele
// dispositivo — a tela mostra "Sem previsão no Decreto", que é diferente de
// "não preenche os requisitos". O valor sai do engine.js: é false exatamente
// onde ele escreve `especial: 'Sem previsão no Decreto'`.

import type { MetaInciso } from '../../tipos'

export const INCISOS_INDULTO_2025: MetaInciso[] = [
  {
    id: 'art9_I',
    rotulo: 'Art. 9º, I',
    descricao: 'Pena ≤ 8 anos, sem violência: 1/5 (não reinc.) ou 1/3 (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_II',
    rotulo: 'Art. 9º, II',
    descricao: 'Pena ≤ 12 anos, sem violência: 1/3 (não reinc.) ou 1/2 (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_III',
    rotulo: 'Art. 9º, III',
    descricao: 'Pena ≤ 4 anos, com violência: 1/3 (não reinc.) ou 1/2 (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_IV',
    rotulo: 'Art. 9º, IV',
    descricao: 'Cumprimento ininterrupto de 15 anos (não reinc.) ou 20 anos (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_V',
    rotulo: 'Art. 9º, V',
    descricao: 'Cumprimento não ininterrupto de 20/25 anos, com período em liberdade ≤ 2 anos.',
    temRegraEspecial: true,
  },
  {
    id: 'art9_VI',
    rotulo: 'Art. 9º, VI',
    descricao: 'Regime semiaberto ininterrupto: 10 anos (não reinc.) ou 15 anos (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_VII',
    rotulo: 'Art. 9º, VII',
    descricao: 'Regime aberto/restritiva/sursis: 1/6 (não reinc.) ou 1/5 (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_VIII',
    rotulo: 'Art. 9º, VIII',
    descricao: 'Livramento/aberto, remanescente ≤ 6 anos (não reinc.) ou 4 anos (reinc.).',
    temRegraEspecial: true,
  },
  {
    id: 'art9_IX',
    rotulo: 'Art. 9º, IX',
    descricao: 'Aberto/restritiva/livramento/sursis + programa de egressos ≥ 2 anos.',
    temRegraEspecial: true,
  },
  {
    id: 'art9_X',
    rotulo: 'Art. 9º, X',
    descricao: 'Semiaberto com monitoramento (SV 56/STF) há mais de 3 anos.',
    temRegraEspecial: true,
  },
  {
    id: 'art9_XI',
    rotulo: 'Art. 9º, XI',
    descricao: 'Pena ≤ 12 anos, semiaberto/aberto, 1/3 ou 1/2 + 5 saídas ou trabalho externo.',
    temRegraEspecial: true,
  },
  {
    id: 'art9_XII',
    rotulo: 'Art. 9º, XII',
    descricao: 'Pena ≤ 12 anos + curso em andamento (12/18 meses).',
    temRegraEspecial: false,
  },
  {
    id: 'art9_XIII',
    rotulo: 'Art. 9º, XIII',
    descricao: 'Pena ≤ 12 anos + curso concluído nos 3 anos anteriores.',
    temRegraEspecial: false,
  },
  {
    id: 'art9_XIV',
    rotulo: 'Art. 9º, XIV',
    descricao: 'Crime patrimonial sem violência, bem ≤ salário-mínimo, cumpriu 3 meses.',
    temRegraEspecial: false,
  },
  {
    id: 'art9_XV',
    rotulo: 'Art. 9º, XV',
    descricao: 'Crime patrimonial sem violência, com reparação do dano.',
    temRegraEspecial: false,
  },
  {
    id: 'art9_XVI',
    rotulo: 'Art. 9º, XVI',
    descricao: 'Condições pessoais graves de saúde/deficiência.',
    temRegraEspecial: false,
  },
  {
    id: 'art10',
    rotulo: 'Art. 10',
    descricao: 'Indulto natalino especial às mulheres presas (requisitos cumulativos).',
    temRegraEspecial: false,
  },
  {
    id: 'art12',
    rotulo: 'Art. 12',
    descricao: 'Indulto coletivo às pessoas condenadas a pena de multa.',
    temRegraEspecial: false,
  },
]

export const INCISOS_COMUTACAO_2025: MetaInciso[] = [
  {
    id: 'art11_I',
    rotulo: 'Art. 11, I',
    descricao: 'Mulher reincidente, pena ≤ 8 anos, sem violência — comutação de 1/4.',
    temRegraEspecial: false,
  },
  {
    id: 'art11_II',
    rotulo: 'Art. 11, II',
    descricao: 'Mulher não reincidente, com filho — comutação de 2/3.',
    temRegraEspecial: false,
  },
  {
    id: 'art11_III',
    rotulo: 'Art. 11, III',
    descricao: 'Mulher reincidente, com filho — comutação de 1/2.',
    temRegraEspecial: false,
  },
  {
    id: 'art13',
    rotulo: 'Art. 13',
    descricao: 'Comutação de 1/5 da remanescente (1/5 cumprido / 1/4 se reinc.).',
    temRegraEspecial: false,
  },
  {
    id: 'art13_4',
    rotulo: 'Art. 13, §4º',
    descricao: 'Comutação de 2/3 para o perfil do Art. 9º, §2º.',
    temRegraEspecial: false,
  },
]

export const AVISOS_2025 = {
  // NOTAS do ui.js
  fixos: [
    'Esta ferramenta não dispensa conhecimento técnico sobre o assunto.',
    'Em nenhuma hipótese o indulto ou a comutação atingem crimes impeditivos.',
    'Indulto do Art. 9º (I, II, XIV, XV) e do Art. 10 não alcança crimes cometidos com violência ou grave ameaça.',
    'A comutação do Art. 11 é calculada somente para crimes sem violência ou grave ameaça.',
  ],
  // As ambiguidades herdadas da planilha. As duas primeiras são o `avisos` do
  // engine.js, literais; as duas últimas saíram da auditoria do porte (Task 6) e
  // não têm contraparte no engine — são pontos que o motor sempre teve e que
  // ninguém nunca mostrou ao advogado.
  validarJuridicamente: [
    'A "pena após a comutação" usa a pena total imposta como base (fórmula original), sem descontar o tempo já cumprido — revisar interpretação jurídica.',
    'A base da comutação do Art. 13 e §4º usa o maior valor entre pena cumprida e pena remanescente — a comutação legalmente incide sobre a remanescente.',
    'No Art. 9º, VIII, a regra especial do §2º DOBRA o teto da pena remanescente (de 6 anos para 12, ou de 4 para 8) em vez de reduzi-lo à metade, ao contrário de todos os outros incisos. A planilha faz assim porque ali o §2º incide sobre um teto, e não sobre uma fração exigida de cumprimento — reduzir pela metade tornaria o §2º mais restritivo para o perfil vulnerável. É interpretação, não transcrição: conferir contra o texto do Decreto.',
    'Nos incisos do Art. 11, responder "NÃO SE APLICA" à reincidência satisfaz TANTO o requisito de "reincidente obrigatório" (I e III) quanto o de "não reincidente obrigatório" (II), porque a fórmula original testa a diferença e não a igualdade. Se a reincidência for controvertida nos autos, responder "SIM" ou "NÃO" em vez de "NÃO SE APLICA".',
  ],
}
