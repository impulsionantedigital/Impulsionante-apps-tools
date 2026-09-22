// O questionário do Decreto 12.970/2025, transcrito de validacao/2025/ui.js
// (SECOES, linhas 9-95).
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO. Não o compartilhe com 2024 ou 2026, mesmo que
// a maioria dos campos se repita: as regras, os incisos e os textos são
// específicos de cada decreto, e um campo movido daqui muda a tela já validada.
//
// 🔴 AS CHAVES SÃO AS QUE O MOTOR LÊ, por nome. Renomear `penaViolencia` para
// algo mais bonito faz o motor ler `undefined` — sem erro, com número errado.
//
// Toda pergunta é apurada "em 25/12/2025", a data-base do decreto.

import type { Secao } from '../../tipos'

const SN = ['SIM', 'NÃO'] as const
const SNA = ['SIM', 'NÃO', 'NÃO SE APLICA'] as const

export const QUESTIONARIO_2025: Secao[] = [
  {
    id: 'identificacao',
    titulo: 'Identificação',
    campos: [
      { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
      { tipo: 'texto', chave: 'execucao', rotulo: 'Execução nº' },
      { tipo: 'texto', chave: 'unidade', rotulo: 'Unidade prisional' },
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
      { tipo: 'selecao', chave: 'reincidente', rotulo: 'Reincidente em 25/12/2025?', opcoes: SN },
    ],
  },
  {
    id: 'penas-impostas',
    titulo: 'Penas impostas (em 25/12/2025)',
    aviso: 'Some as penas por categoria de crime. Impeditivo = hediondo/equiparado + crimes previstos no Art. 1º.',
    campos: [
      { tipo: 'tempo', chave: 'penaImpeditiva', rotulo: 'Total de penas de crimes IMPEDITIVOS' },
      { tipo: 'tempo', chave: 'penaViolencia', rotulo: 'Total de penas de crimes COM VIOLÊNCIA ou grave ameaça' },
      { tipo: 'tempo', chave: 'penaSemViolencia', rotulo: 'Total de penas de crimes SEM VIOLÊNCIA ou grave ameaça' },
    ],
  },
  {
    id: 'pena-cumprida',
    titulo: 'Pena cumprida (até 25/12/2025)',
    campos: [
      { tipo: 'tempo', chave: 'penaCumpridaSEEU', rotulo: 'Total já considerado no Sistema (SEEU)' },
      {
        tipo: 'tempo',
        chave: 'penaCumpridaNaoSEEU',
        rotulo: 'Total não lançado no Sistema (prisão cautelar, domiciliar, especial, recolhimento noturno)',
      },
    ],
  },
  {
    // 🔴 `regime`, `livramentoCondicional` e `dataUltimaPrisao` abrem esta seção (o perfil
    // agora termina na reincidência). Mudaram de SEÇÃO, não de CHAVE nem de ROTULO: o motor
    // lê as chaves por nome e a tela só desenha a ordem declarada aqui. Nada além da posição
    // destes três pode mudar sem revisar o `movimentacao` dos campos.
    id: 'regime-situacao',
    titulo: 'Regime, tempo e situação prisional',
    campos: [
      { tipo: 'selecao', chave: 'regime', rotulo: 'Regime prisional em 25/12/2025', opcoes: ['FECHADO', 'SEMIABERTO', 'ABERTO'] },
      { tipo: 'selecao', chave: 'livramentoCondicional', rotulo: 'Em livramento condicional em 25/12/2025?', opcoes: SN },
      { tipo: 'data', chave: 'dataUltimaPrisao', rotulo: 'Data da última prisão' },
      { tipo: 'numero', chave: 'diasRemicao', rotulo: 'Total de dias de remição após a última prisão' },
      {
        tipo: 'tempo',
        chave: 'tempoSemiaberto',
        rotulo: 'Se em regime semiaberto: tempo cumprido ininterruptamente nesse regime (somar remição)',
      },
      {
        tipo: 'tempo',
        chave: 'tempoSemiabertoAberto',
        rotulo: 'Se em regime aberto: tempo cumprido no semiaberto + aberto somados (somar remição)',
      },
      {
        tipo: 'selecao',
        chave: 'monitoramentoSV56',
        rotulo: 'Em monitoramento eletrônico (Súmula Vinculante 56/STF)? Há quanto tempo?',
        opcoes: ['NÃO', 'HÁ MENOS DE 01 ANO E 06 MESES', 'ENTRE 01 ANO E 06 MESES E 03 ANOS', 'HÁ MAIS DE 03 ANOS'],
      },
      {
        tipo: 'selecao',
        chave: 'programaEgressos',
        rotulo: 'Inserido em programa de acompanhamento de egressos? Há quanto tempo?',
        opcoes: ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'],
      },
      {
        tipo: 'selecao',
        chave: 'justicaRestaurativa',
        rotulo:
          'É pessoa que tenha se submetido, no curso da execução da pena, a programas de justiça restaurativa reconhecidos pelo Poder Judiciário ou por órgãos do Poder Executivo com atribuição em matéria penitenciária, mediante atestado de conclusão do procedimento e resolução satisfatória do conflito firmada por responsável pelo programa?',
        ajuda: 'Em conformidade com o disposto na Resolução nº 225, de 31 de maio de 2016, do Conselho Nacional de Justiça.',
        opcoes: SN,
      },
    ],
  },
  // 🔴 Estes dois vieram de DEPOIS de "Histórico e vedações" (17/09/2026, a pedido do dono do
  // produto): "Regime aberto / restritiva" e "Crime contra o patrimônio e multa" são
  // desdobramentos do que se acabou de responder em "Regime, tempo e situação prisional",
  // e ficam ao lado dele. A ordem das seções é ordem de TELA — o motor lê cada campo pela
  // chave, onde quer que esteja —, mas os specs de questionário travam a lista.
  {
    id: 'aberto-restritiva',
    titulo: 'Regime aberto / restritiva de direitos',
    campos: [
      {
        tipo: 'selecao',
        chave: 'penasSubstituidas',
        rotulo: 'Todas as penas foram substituídas por restritiva de direito ou com sursis?',
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
        rotulo: 'Todos os crimes são contra o patrimônio sem violência ou grave ameaça?',
        opcoes: SN,
      },
      { tipo: 'selecao', chave: 'reparouDano', rotulo: 'Reparou o dano até 25/12/2025 (ou não há necessidade)?', opcoes: SNA },
      {
        tipo: 'selecao',
        chave: 'valorBemSalarioMinimo',
        rotulo: 'Valor do bem não supera um salário-mínimo à época do fato?',
        opcoes: SNA,
      },
      { tipo: 'numero', chave: 'valorMulta', rotulo: 'Valor da pena de multa (exceto crimes impeditivos), em R$' },
      { tipo: 'selecao', chave: 'hipossuficiente', rotulo: 'Sentenciado hipossuficiente (Art. 12, §2º)?', opcoes: SN },
    ],
  },
  {
    id: 'educacao-trabalho',
    titulo: 'Educação e trabalho',
    campos: [
      {
        tipo: 'selecao',
        chave: 'saidasOuTrabalhoExterno',
        rotulo: '5 saídas temporárias OU trabalho externo ≥12 meses nos 3 anos anteriores?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'estudo',
        rotulo: 'Frequentou/frequentava curso em 25/12/2025?',
        opcoes: ['NÃO', 'MENOS DE 12 MESES', 'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS', 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS'],
      },
      { tipo: 'selecao', chave: 'concluiuCurso', rotulo: 'Concluiu curso (fund./médio/superior/prof.) nos 3 anos anteriores?', opcoes: SN },
    ],
  },
  {
    id: 'pessoais-familiares',
    titulo: 'Condições pessoais e familiares',
    campos: [
      { tipo: 'selecao', chave: 'deficiencia', rotulo: 'É pessoa com deficiência?', opcoes: SN },
      {
        tipo: 'selecao',
        chave: 'condicoesGravesSaude',
        rotulo: 'Condição grave de saúde (paraplegia, HIV terminal, gestação de alto risco, doença grave, TEA grau 3, etc.)?',
        opcoes: SN,
      },
      { tipo: 'selecao', chave: 'gestante', rotulo: 'É mulher gestante?', opcoes: SN },
      { tipo: 'selecao', chave: 'filhoAte16', rotulo: 'É mulher com filho(a) até 16 anos?', opcoes: SN },
      { tipo: 'selecao', chave: 'filhoDeficiencia', rotulo: 'É mulher com filho(a) com deficiência?', opcoes: SN },
      {
        tipo: 'selecao',
        chave: 'filhoDeficienciaCuidados',
        rotulo: 'Esse filho(a) com deficiência necessita dos cuidados da mãe?',
        opcoes: SN,
      },
      { tipo: 'selecao', chave: 'filhoDoencaCronica', rotulo: 'É mulher com filho(a) com doença crônica grave?', opcoes: SN },
      {
        tipo: 'selecao',
        chave: 'filhoDoencaCronicaCuidados',
        rotulo: 'Esse filho(a) com doença crônica necessita dos cuidados da mãe?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'homemUnicoResponsavel',
        rotulo: 'É homem único responsável por filho(a) <16 anos, com doença crônica grave ou deficiência?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'imprescindivelCrianca',
        rotulo: 'É imprescindível aos cuidados de criança até 12 anos ou com doença grave/deficiência?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'avoNetos',
        rotulo: 'É avó com netos até 16 anos (ou qualquer idade se deficiência) que necessitam de seus cuidados?',
        opcoes: SN,
      },
    ],
  },
  {
    id: 'historico-vedacoes',
    titulo: 'Histórico e vedações',
    campos: [
      { tipo: 'selecao', chave: 'faltaGraveAno', rotulo: 'Falta grave entre 25/12/2024 e 25/12/2025?', opcoes: SN },
      { tipo: 'selecao', chave: 'faltaGraveExecucao', rotulo: 'Falta grave durante toda a execução?', opcoes: SN },
      { tipo: 'selecao', chave: 'colaboracaoPremiada', rotulo: 'Firmou acordo de colaboração premiada?', opcoes: SN },
      { tipo: 'selecao', chave: 'faccao', rotulo: 'Integra ou integrou facção criminosa?', opcoes: SN },
      { tipo: 'selecao', chave: 'rdd', rotulo: 'Em Regime Disciplinar Diferenciado (RDD) em 25/12/2025?', opcoes: SN },
      {
        tipo: 'selecao',
        chave: 'presidioFederal',
        rotulo: 'Em presídio federal ou unidade de segurança máxima em 25/12/2025?',
        opcoes: SN,
      },
      { tipo: 'selecao', chave: 'periodoLiberdade2Anos', rotulo: 'Período em liberdade supera dois anos?', opcoes: SN },
      {
        tipo: 'selecao',
        chave: 'respondendoOutroCrimeViolento',
        rotulo: 'Respondendo/condenado por outro crime com violência ou grave ameaça?',
        opcoes: SN,
      },
      {
        tipo: 'selecao',
        chave: 'crimeContraCrianca',
        rotulo: 'Crime com violência/grave ameaça foi contra filho, criança ou adolescente?',
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
        rotulo: 'Cumpriu 2/3 do crime impeditivo até 25/12/2025, contado da data do crime?',
        opcoes: SNA,
        padrao: 'SIM',
      },
      {
        tipo: 'selecao',
        chave: 'cumpriuFracaoViolenciaDataFato',
        rotulo: 'Cumpriu a fração do crime com violência/grave ameaça a partir da data do delito?',
        opcoes: SN,
        padrao: 'SIM',
      },
    ],
  },
  {
    id: 'observacoes',
    titulo: 'Observações',
    campos: [{ tipo: 'texto', chave: 'observacoes', rotulo: 'Observações (livre)' }],
  },
]

// Movida para `../../padrao` — serve a todo motor, não só ao de 2025. O
// reexport fica porque o teste desta task importa dali.
export { padraoDoCampo } from '../../padrao'
