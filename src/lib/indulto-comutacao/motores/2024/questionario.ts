// O questionário do Decreto 12.338/2024, transcrito da aba "Questionario" de
// validacao/2024/planilha.xlsx (a versão COMERCIAL).
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO. Não o compartilhe com 2025 ou 2026, mesmo que
// a maioria dos campos se repita: as regras, os incisos e os textos são
// específicos de cada decreto, e um campo movido daqui muda a tela já validada.
//
// 🔴 AS CHAVES SÃO AS QUE O MOTOR LÊ, por nome. Renomear `penaViolencia` para
// algo mais bonito faz o motor ler `undefined` — sem erro, com número errado.
//
// 🔴 A REDAÇÃO É A DE 2024, mesmo onde a de 2025 parece melhor. Aqui se pergunta
// "TEM pena substituída"; em 2025, "TODAS as penas foram substituídas". A
// fórmula é a mesma, o sentido para quem responde não é.
//
// Toda pergunta é apurada "em 25/12/2024", a data-base do decreto.

import type { Secao } from '../../tipos'

const SN = ['SIM', 'NÃO'] as const
const SNA = ['SIM', 'NÃO', 'NÃO SE APLICA'] as const
const EGRESSA = ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'] as const
const MONITORACAO = [
  'NÃO',
  'HÁ MENOS DE 01 ANO E 06 MESES',
  'ENTRE 01 ANO E 06 MESES E 03 ANOS',
  'HÁ MAIS DE 03 ANOS',
] as const
const ESTUDO = [
  'NÃO',
  'MENOS DE 12 MESES',
  'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS',
  'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS',
] as const

export const QUESTIONARIO_2024: Secao[] = [
  {
    id: 'identificacao',
    titulo: 'Identificação',
    campos: [
      { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
      { tipo: 'texto', chave: 'execucao', rotulo: 'Execução nº' },
      { tipo: 'texto', chave: 'unidade', rotulo: 'Unidade Prisional' },
    ],
  },
  {
    // 🔴 O perfil vem LOGO ABAIXO da identificação, antes das penas. A ordem das seções
    // é a ordem em que a tela desenha o questionário — o motor não depende dela (lê cada
    // campo pela chave, onde quer que esteja), mas a numeração do produto e o relato do
    // usuário "card 2" dependem.
    id: 'perfil',
    titulo: 'Perfil do sentenciado',
    campos: [
      { tipo: 'selecao', chave: 'sexo', rotulo: 'Sexo', opcoes: ['MASCULINO', 'FEMININO'] },
      { tipo: 'data', chave: 'dataNascimento', rotulo: 'Data de nascimento' },
      { tipo: 'selecao', chave: 'reincidente', rotulo: 'Reincidente?', opcoes: SN },
    ],
  },
  {
    id: 'penas-impostas',
    titulo: 'Penas impostas (em 25/12/2024)',
    aviso:
      'Some as penas por categoria de crime. Impeditivo = hediondo/equiparado + crimes previstos no Art. 1º.',
    campos: [
      {
        tipo: 'tempo',
        chave: 'penaImpeditiva',
        rotulo: 'Total de penas de crimes IMPEDITIVOS em 25/12/2024',
      },
      {
        tipo: 'tempo',
        chave: 'penaViolencia',
        rotulo: 'Total de penas de crimes COM VIOLÊNCIA ou grave ameaça em 25/12/2024',
      },
      {
        tipo: 'tempo',
        chave: 'penaSemViolencia',
        rotulo: 'Total de penas de crimes SEM VIOLÊNCIA ou grave ameaça em 25/12/2024',
      },
    ],
  },
  {
    id: 'pena-cumprida',
    titulo: 'Pena cumprida (até 25/12/2024)',
    campos: [
      {
        tipo: 'tempo',
        chave: 'penaCumpridaSEEU',
        rotulo: 'Total de pena cumprida até 25/12/2024 já considerada no Sistema',
      },
      {
        tipo: 'tempo',
        chave: 'penaCumpridaNaoSEEU',
        rotulo:
          'Total de pena cumprida até 25/12/2024 não lançada no Sistema (prisão cautelar, prisão domiciliar, prisão especial ou recolhimento domiciliar noturno, com ou sem monitoramento eletrônico)',
      },
    ],
  },
  {
    // 🔴 `regime`, `livramentoCondicional` e `dataUltimaPrisao` abrem esta seção (o perfil
    // agora termina na reincidência). Mudaram de SEÇÃO, não de CHAVE nem de ROTULO: o motor
    // lê as chaves por nome e a tela só desenha a ordem declarada aqui.
    id: 'regime-situacao',
    titulo: 'Regime, tempo e situação prisional',
    campos: [
      {
        tipo: 'selecao',
        chave: 'regime',
        rotulo: 'Regime prisional em 25/12/2024',
        opcoes: ['FECHADO', 'SEMIABERTO', 'ABERTO'],
      },
      {
        tipo: 'selecao',
        chave: 'livramentoCondicional',
        rotulo: 'Sentenciado em livramento condicional em 25/12/2024?',
        opcoes: SN,
      },
      { tipo: 'data', chave: 'dataUltimaPrisao', rotulo: 'Data da última prisão' },
      {
        tipo: 'numero',
        chave: 'diasRemicao',
        rotulo: 'Total de dias de remição após a data da última prisão',
      },
      {
        tipo: 'tempo',
        chave: 'tempoSemiaberto',
        rotulo:
          'Se estava no regime semiaberto em 25/12/2024, quanto tempo de pena cumprido ininterruptamente nesse regime? (somar remição concedida no período)',
      },
      {
        tipo: 'tempo',
        chave: 'tempoSemiabertoAberto',
        rotulo:
          'Se estava no regime aberto em 25/12/2024, quanto tempo de pena cumprido no regime semiaberto e aberto somados? (somar remição concedida no período)',
      },
      {
        tipo: 'selecao',
        chave: 'monitoramentoSV56',
        rotulo:
          'Estava em 25/12/2024 em monitoramento eletrônico, cuja liberação tenha ocorrido com fundamento na Súmula Vinculante nº 56 do STF (falta de vaga em estabelecimento penal adequado)? Se sim, há quanto tempo?',
        opcoes: MONITORACAO,
      },
      {
        tipo: 'selecao',
        chave: 'programaEgressos',
        rotulo:
          'Estava em 25/12/2024 inserida como pré-egressas ou egressas em programa de acompanhamento compatível com a Política de Atenção a Pessoas Egressas do Sistema Prisional? Se sim, há quanto tempo?',
        opcoes: EGRESSA,
      },
    ],
  },
  // 🔴 Estes dois vieram de DEPOIS de "Histórico e vedações" (17/09/2026, a pedido do dono do
  // produto): são desdobramentos do que se acabou de responder em "Regime, tempo e situação
  // prisional", e ficam ao lado dele. A ordem é de TELA — o motor lê cada campo pela chave,
  // onde quer que esteja —, mas os specs de questionário travam a lista. A REDAÇÃO É A DE
  // 2024: não copie o texto de 2025 ("Todas as penas foram substituídas" vs "Tem pena
  // substituída"), que a fórmula é a mesma e o sentido para quem responde não é.
  {
    id: 'aberto-restritiva',
    titulo: 'Regime aberto / restritiva de direitos',
    campos: [
      {
        tipo: 'selecao',
        chave: 'penasSubstituidas',
        rotulo: 'Tem pena substituída por restritiva de direito ou beneficiadas com a suspensão condicional da pena?',
        opcoes: SN,
      },
      { tipo: 'selecao', chave: 'condenacaoAberto', rotulo: 'Tem condenação em regime aberto?', opcoes: SN },
    ],
  },
  {
    id: 'patrimonio-multa',
    titulo: 'Crime contra o patrimônio e multa',
    campos: [
      {
        tipo: 'selecao',
        chave: 'crimePatrimonio',
        rotulo: 'Tem crime contra o patrimônio cometido sem violência ou grave ameaça?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'reparouDano',
        rotulo: 'Reparou o dano até 25/12/2024 ou não há necessidade de reparação?',
        opcoes: SNA,
      },
      {
        tipo: 'selecao',
        chave: 'valorBemSalarioMinimo',
        rotulo: 'Valor do bem estimado do crime contra o patrimônio não é superior a um salário-mínimo à época do fato?',
        opcoes: SNA,
      },
      {
        tipo: 'numero',
        chave: 'valorMulta',
        rotulo: 'Valor da pena de multa (exceto dos crimes impeditivos)',
      },
      {
        tipo: 'selecao',
        chave: 'hipossuficiente',
        rotulo: 'Sentenciado hipossuficiente nos termos do Art. 9, §2º?',
        opcoes: SN,
      },
    ],
  },
  {
    id: 'educacao-trabalho',
    titulo: 'Educação e trabalho',
    campos: [
      {
        tipo: 'selecao',
        chave: 'saidasOuTrabalhoExterno',
        rotulo:
          'Sentenciado obteve 05 saídas temporárias ou trabalhou externamente por, no mínimo, doze meses nos três anos anteriores, contados retroativamente a 25/12/2024?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'estudo',
        rotulo:
          'Frequentou, ou estava frequentando, curso de ensino fundamental, médio, superior, profissionalizante ou de requalificação profissional em 25/12/2024?',
        opcoes: ESTUDO,
      },
      {
        tipo: 'selecao',
        chave: 'concluiuCurso',
        rotulo:
          'Concluiu, durante a execução da pena, curso de ensino fundamental, médio, superior ou profissionalizante, certificado por autoridade educacional local, nos três anos anteriores a 25/12/2024?',
        opcoes: SN,
      },
    ],
  },
  {
    id: 'pessoais-familiares',
    titulo: 'Condições pessoais e familiares',
    campos: [
      {
        tipo: 'selecao',
        chave: 'deficiencia',
        rotulo:
          'É pessoa com deficiência (aquela que tem impedimento de longo prazo de natureza física, mental, intelectual ou sensorial, o qual, em interação com uma ou mais barreiras, pode obstruir sua participação plena e efetiva na sociedade em igualdade de condições com as demais pessoas)?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'condicoesGravesSaude',
        rotulo:
          'Sentenciado com paraplegia, tetraplegia, monoplegia, hemiplegia, ostomia, amputação, paralisia, cegueira ou outra deficiência física que acarrete comprometimento análogo, desde que essas condições não sejam anteriores à prática do crime; infectadas pelo vírus HIV, em estágio terminal; gestantes, cuja gravidez seja considerada de alto risco; acometidas de doença grave, crônica ou altamente contagiosa, que apresentem grave limitação ambulatorial ou severa restrição para participação regular nas atividades oferecidas pela unidade prisional ou, ainda, que exijam cuidados contínuos que não possam ser adequadamente prestados no estabelecimento; ou com transtorno do espectro autista severo (grau 3) ou neurodiversas em condição análoga?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'gestanteOuFilho14',
        rotulo:
          'É mulher gestante ou que tem filho ou filha com até 14 anos de idade ou com doença crônica grave ou deficiência?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'mulherFilho12',
        rotulo:
          'É mulher e possui filhos de até 12 anos de idade ou de qualquer idade, se pessoa com deficiência que comprovadamente necessite de seus cuidados?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'mulherFilho16',
        rotulo:
          'É mulher e possui filho menor de 16 anos de idade ou de qualquer idade, se pessoa com deficiência ou com doença crônica grave que necessite de seus cuidados?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'homemUnicoResponsavel',
        rotulo:
          'É homem e o único responsável pelos cuidados de filho ou filha menor de 14 anos de idade ou com doença crônica grave ou deficiência?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'imprescindivelCrianca',
        rotulo:
          'É pessoa imprescindível aos cuidados de criança de até 12 anos de idade ou com doença grave ou deficiência?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'avoNetos',
        rotulo:
          'É avó que possuam netos de até doze anos de idade ou de qualquer idade, se pessoa com deficiência, nos termos do disposto no art. 2º da Lei nº 13.146, de 6 de julho de 2015, que comprovadamente necessite de seus cuidados e esteja sob sua responsabilidade?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'justicaRestaurativa',
        rotulo:
          'É pessoa que tenha se submetido, no curso da execução da pena, a programas de justiça restaurativa reconhecidos pelo Poder Judiciário ou por órgãos do Poder Executivo com atribuição em matéria penitenciária, mediante atestado de conclusão do procedimento e resolução satisfatória do conflito firmada por responsável pelo programa, em conformidade com o disposto na Resolução nº 225, de 31 de maio de 2016, do Conselho Nacional de Justiça?',
        opcoes: SN,
      },
    ],
  },
  {
    id: 'historico-vedacoes',
    titulo: 'Histórico e vedações',
    campos: [
      {
        tipo: 'selecao',
        chave: 'periodoLiberdade2Anos',
        rotulo:
          'Período em liberdade supera dois anos? (analisar todos os períodos em que houver interrupção no cumprimento de pena)',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'faltaGraveAno',
        rotulo: 'Falta grave cometida entre 25/12/2023 à 25/12/2024?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'faltaGraveExecucao',
        rotulo: 'Falta grave cometida durante toda execução de pena?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'colaboracaoPremiada',
        rotulo: 'Sentenciado firmou acordo de colaboração premiada?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'faccao',
        rotulo: 'Integra ou integrou facção criminosa?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'rdd',
        rotulo: 'Estava em Regime Disciplinar Diferenciado (RDD) em 25/12/2024?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'presidioFederal',
        rotulo: 'Estava em presídio federal ou em unidade de segurança máxima em 25/12/2024?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'crimeContraCrianca',
        rotulo: 'O crime praticado com violência ou grave ameaça foi contra filho, filha, criança ou adolescente?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'respondendoOutroCrimeViolento',
        rotulo:
          'Em 25/12/2024 estava respondendo ou foi condenado pela prática de outro crime cometido mediante violência ou grave ameaça a pessoa?',
        opcoes: SN,
      },
    ],
  },
  {
    id: 'data-do-fato',
    titulo: 'Requisitos da data do fato',
    aviso: 'ATENÇÃO: responder "NÃO" bloqueia tanto o indulto quanto a comutação.',
    campos: [
      {
        tipo: 'selecao',
        chave: 'cumpriu23ImpeditivoDataFato',
        rotulo:
          'O condenado cumpriu 2/3 do crime impeditivo até o dia 25/12/2024, contando a partir da data do crime?',
        opcoes: SNA,
        padrao: 'SIM',
        ajuda: 'Cuidado! Ao selecionar "NÃO", a Calculadora bloqueará tanto o Indulto quanto a Comutação.',
      },
      {
        tipo: 'selecao',
        chave: 'cumpriuFracaoViolenciaDataFato',
        rotulo:
          'O condenado cumpriu a fração indicada no inciso referente ao crime cometido com violência ou grave ameaça a partir da data do delito?',
        opcoes: SNA,
        padrao: 'SIM',
        ajuda: 'Cuidado! Ao selecionar "NÃO", a Calculadora bloqueará tanto o Indulto quanto a Comutação.',
      },
    ],
  },
  {
    id: 'observacoes',
    titulo: 'Observações',
    campos: [{ tipo: 'texto', chave: 'observacoes', rotulo: 'Observações' }],
  },
]

// Movida para `../../padrao` — serve a todo motor, não só ao de 2025. O
// reexport fica porque o teste desta task importa dali.
export { padraoDoCampo } from '../../padrao'
