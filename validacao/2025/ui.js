/* UI da Calculadora de Indulto e Comutação — Decreto 12.970/2025 */
(function () {
  'use strict';

  var SN = ['SIM', 'NÃO'];
  var SNA = ['SIM', 'NÃO', 'NÃO SE APLICA'];

  // Seções do questionário. tipo: text | tempo | select | date | number
  var SECOES = [
    { titulo: 'Identificação', campos: [
      { k: 'sentenciado', tipo: 'text', label: 'Sentenciado' },
      { k: 'execucao', tipo: 'text', label: 'Execução nº' },
      { k: 'unidade', tipo: 'text', label: 'Unidade prisional' }
    ]},
    { titulo: 'Penas impostas (em 25/12/2025)', hint: 'Some as penas por categoria de crime. Impeditivo = hediondo/equiparado.', campos: [
      { k: 'penaImpeditiva', tipo: 'tempo', label: 'Total de penas de crimes IMPEDITIVOS' },
      { k: 'penaViolencia', tipo: 'tempo', label: 'Total de penas de crimes COM VIOLÊNCIA ou grave ameaça' },
      { k: 'penaSemViolencia', tipo: 'tempo', label: 'Total de penas de crimes SEM VIOLÊNCIA ou grave ameaça' }
    ]},
    { titulo: 'Pena cumprida (até 25/12/2025)', campos: [
      { k: 'penaCumpridaSEEU', tipo: 'tempo', label: 'Total já considerado no Sistema (SEEU)' },
      { k: 'penaCumpridaNaoSEEU', tipo: 'tempo', label: 'Total não lançado no Sistema (prisão cautelar, domiciliar, especial, recolhimento noturno)' }
    ]},
    { titulo: 'Perfil do sentenciado', campos: [
      { k: 'sexo', tipo: 'select', label: 'Sexo', opcoes: ['MASCULINO', 'FEMININO'] },
      { k: 'dataNascimento', tipo: 'date', label: 'Data de nascimento' },
      { k: 'reincidente', tipo: 'select', label: 'Reincidente em 25/12/2025?', opcoes: SN },
      { k: 'regime', tipo: 'select', label: 'Regime prisional em 25/12/2025', opcoes: ['FECHADO', 'SEMIABERTO', 'ABERTO'] },
      { k: 'dataUltimaPrisao', tipo: 'date', label: 'Data da última prisão' },
      { k: 'diasRemicao', tipo: 'number', label: 'Total de dias de remição após a última prisão' }
    ]},
    { titulo: 'Regime, tempo e situação prisional', campos: [
      { k: 'tempoSemiaberto', tipo: 'tempo', label: 'Se em regime semiaberto: tempo cumprido ininterruptamente nesse regime (somar remição)' },
      { k: 'tempoSemiabertoAberto', tipo: 'tempo', label: 'Se em regime aberto: tempo cumprido no semiaberto + aberto somados (somar remição)' },
      { k: 'livramentoCondicional', tipo: 'select', label: 'Em livramento condicional em 25/12/2025?', opcoes: SN },
      { k: 'monitoramentoSV56', tipo: 'select', label: 'Em monitoramento eletrônico (Súmula Vinculante 56/STF)? Há quanto tempo?',
        opcoes: ['NÃO', 'HÁ MENOS DE 01 ANO E 06 MESES', 'ENTRE 01 ANO E 06 MESES E 03 ANOS', 'HÁ MAIS DE 03 ANOS'] },
      { k: 'programaEgressos', tipo: 'select', label: 'Inserido em programa de acompanhamento de egressos? Há quanto tempo?',
        opcoes: ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'] }
    ]},
    { titulo: 'Educação e trabalho', campos: [
      { k: 'saidasOuTrabalhoExterno', tipo: 'select', label: '5 saídas temporárias OU trabalho externo ≥12 meses nos 3 anos anteriores?', opcoes: SN },
      { k: 'estudo', tipo: 'select', label: 'Frequentou/frequentava curso em 25/12/2025?',
        opcoes: ['NÃO', 'MENOS DE 12 MESES', 'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS', 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS'] },
      { k: 'concluiuCurso', tipo: 'select', label: 'Concluiu curso (fund./médio/superior/prof.) nos 3 anos anteriores?', opcoes: SN }
    ]},
    { titulo: 'Condições pessoais e familiares', campos: [
      { k: 'deficiencia', tipo: 'select', label: 'É pessoa com deficiência?', opcoes: SN },
      { k: 'condicoesGravesSaude', tipo: 'select', label: 'Condição grave de saúde (paraplegia, HIV terminal, gestação de alto risco, doença grave, TEA grau 3, etc.)?', opcoes: SN },
      { k: 'gestante', tipo: 'select', label: 'É mulher gestante?', opcoes: SN },
      { k: 'filhoAte16', tipo: 'select', label: 'É mulher com filho(a) até 16 anos?', opcoes: SN },
      { k: 'filhoDeficiencia', tipo: 'select', label: 'É mulher com filho(a) com deficiência?', opcoes: SN },
      { k: 'filhoDeficienciaCuidados', tipo: 'select', label: 'Esse filho(a) com deficiência necessita dos cuidados da mãe?', opcoes: SN },
      { k: 'filhoDoencaCronica', tipo: 'select', label: 'É mulher com filho(a) com doença crônica grave?', opcoes: SN },
      { k: 'filhoDoencaCronicaCuidados', tipo: 'select', label: 'Esse filho(a) com doença crônica necessita dos cuidados da mãe?', opcoes: SN },
      { k: 'homemUnicoResponsavel', tipo: 'select', label: 'É homem único responsável por filho(a) <16 anos, com doença crônica grave ou deficiência?', opcoes: SN },
      { k: 'imprescindivelCrianca', tipo: 'select', label: 'É imprescindível aos cuidados de criança até 12 anos ou com doença grave/deficiência?', opcoes: SN },
      { k: 'avoNetos', tipo: 'select', label: 'É avó com netos até 16 anos (ou qualquer idade se deficiência) que necessitam de seus cuidados?', opcoes: SN }
    ]},
    { titulo: 'Histórico e vedações', campos: [
      { k: 'faltaGraveAno', tipo: 'select', label: 'Falta grave entre 25/12/2024 e 25/12/2025?', opcoes: SN },
      { k: 'faltaGraveExecucao', tipo: 'select', label: 'Falta grave durante toda a execução?', opcoes: SN },
      { k: 'colaboracaoPremiada', tipo: 'select', label: 'Firmou acordo de colaboração premiada?', opcoes: SN },
      { k: 'faccao', tipo: 'select', label: 'Integra ou integrou facção criminosa?', opcoes: SN },
      { k: 'rdd', tipo: 'select', label: 'Em Regime Disciplinar Diferenciado (RDD) em 25/12/2025?', opcoes: SN },
      { k: 'presidioFederal', tipo: 'select', label: 'Em presídio federal ou unidade de segurança máxima em 25/12/2025?', opcoes: SN },
      { k: 'periodoLiberdade2Anos', tipo: 'select', label: 'Período em liberdade supera dois anos?', opcoes: SN },
      { k: 'respondendoOutroCrimeViolento', tipo: 'select', label: 'Respondendo/condenado por outro crime com violência ou grave ameaça?', opcoes: SN },
      { k: 'crimeContraCrianca', tipo: 'select', label: 'Crime com violência/grave ameaça foi contra filho, criança ou adolescente?', opcoes: SN }
    ]},
    { titulo: 'Regime aberto / restritiva de direitos', campos: [
      { k: 'penasSubstituidas', tipo: 'select', label: 'Alguma pena substituída por restritiva de direito ou com sursis?', opcoes: SN },
      { k: 'condenacaoAberto', tipo: 'select', label: 'Tem condenação em regime aberto?', opcoes: SN }
    ]},
    { titulo: 'Crime contra o patrimônio e multa', campos: [
      { k: 'crimePatrimonio', tipo: 'select', label: 'Tem crime contra o patrimônio sem violência ou grave ameaça?', opcoes: SN },
      { k: 'reparouDano', tipo: 'select', label: 'Reparou o dano até 25/12/2025 (ou não há necessidade)?', opcoes: SNA },
      { k: 'valorBemSalarioMinimo', tipo: 'select', label: 'Valor do bem não supera um salário-mínimo à época do fato?', opcoes: SNA },
      { k: 'valorMulta', tipo: 'number', label: 'Valor da pena de multa (exceto crimes impeditivos), em R$' },
      { k: 'hipossuficiente', tipo: 'select', label: 'Sentenciado hipossuficiente (Art. 12, §2º)?', opcoes: SN }
    ]},
    { titulo: 'Requisitos da data do fato', hint: 'ATENÇÃO: responder "NÃO" bloqueia tanto o indulto quanto a comutação.', campos: [
      { k: 'cumpriu23ImpeditivoDataFato', tipo: 'select', label: 'Cumpriu 2/3 do crime impeditivo até 25/12/2025, contado da data do crime?', opcoes: SNA, def: 'SIM' },
      { k: 'cumpriuFracaoViolenciaDataFato', tipo: 'select', label: 'Cumpriu a fração do crime com violência/grave ameaça a partir da data do delito?', opcoes: SN, def: 'SIM' }
    ]},
    { titulo: 'Observações', campos: [
      { k: 'observacoes', tipo: 'text', label: 'Observações (livre)' }
    ]}
  ];

  // Metadados dos incisos para exibição do resultado
  var INCISOS_INDULTO = [
    ['art9_I', 'Art. 9º, I', 'Pena ≤ 8 anos, sem violência: 1/5 (não reinc.) ou 1/3 (reinc.).'],
    ['art9_II', 'Art. 9º, II', 'Pena ≤ 12 anos, sem violência: 1/3 (não reinc.) ou 1/2 (reinc.).'],
    ['art9_III', 'Art. 9º, III', 'Pena ≤ 4 anos, com violência: 1/3 (não reinc.) ou 1/2 (reinc.).'],
    ['art9_IV', 'Art. 9º, IV', 'Cumprimento ininterrupto de 15 anos (não reinc.) ou 20 anos (reinc.).'],
    ['art9_V', 'Art. 9º, V', 'Cumprimento não ininterrupto de 20/25 anos, com período em liberdade ≤ 2 anos.'],
    ['art9_VI', 'Art. 9º, VI', 'Regime semiaberto ininterrupto: 10 anos (não reinc.) ou 15 anos (reinc.).'],
    ['art9_VII', 'Art. 9º, VII', 'Regime aberto/restritiva/sursis: 1/6 (não reinc.) ou 1/5 (reinc.).'],
    ['art9_VIII', 'Art. 9º, VIII', 'Livramento/aberto, remanescente ≤ 6 anos (não reinc.) ou 4 anos (reinc.).'],
    ['art9_IX', 'Art. 9º, IX', 'Aberto/restritiva/livramento/sursis + programa de egressos ≥ 2 anos.'],
    ['art9_X', 'Art. 9º, X', 'Semiaberto com monitoramento (SV 56/STF) há mais de 3 anos.'],
    ['art9_XI', 'Art. 9º, XI', 'Pena ≤ 12 anos, semiaberto/aberto, 1/3 ou 1/2 + 5 saídas ou trabalho externo.'],
    ['art9_XII', 'Art. 9º, XII', 'Pena ≤ 12 anos + curso em andamento (12/18 meses).'],
    ['art9_XIII', 'Art. 9º, XIII', 'Pena ≤ 12 anos + curso concluído nos 3 anos anteriores.'],
    ['art9_XIV', 'Art. 9º, XIV', 'Crime patrimonial sem violência, bem ≤ salário-mínimo, cumpriu 3 meses.'],
    ['art9_XV', 'Art. 9º, XV', 'Crime patrimonial sem violência, com reparação do dano.'],
    ['art9_XVI', 'Art. 9º, XVI', 'Condições pessoais graves de saúde/deficiência.'],
    ['art10', 'Art. 10', 'Indulto natalino especial às mulheres presas (requisitos cumulativos).'],
    ['art12', 'Art. 12', 'Indulto coletivo às pessoas condenadas a pena de multa.']
  ];
  var INCISOS_COMUT = [
    ['art11_I', 'Art. 11, I', 'Mulher reincidente, pena ≤ 8 anos, sem violência — comutação de 1/4.'],
    ['art11_II', 'Art. 11, II', 'Mulher não reincidente, com filho — comutação de 2/3.'],
    ['art11_III', 'Art. 11, III', 'Mulher reincidente, com filho — comutação de 1/2.'],
    ['art13', 'Art. 13', 'Comutação de 1/5 da remanescente (1/5 cumprido / 1/4 se reinc.).'],
    ['art13_4', 'Art. 13, §4º', 'Comutação de 2/3 para o perfil do Art. 9º, §2º.']
  ];

  var NOTAS = [
    'Esta ferramenta não dispensa conhecimento técnico sobre o assunto.',
    'Em nenhuma hipótese o indulto ou a comutação atingem crimes impeditivos.',
    'Indulto do Art. 9º (I, II, XIV, XV) e do Art. 10 não alcança crimes cometidos com violência ou grave ameaça.',
    'A comutação do Art. 11 é calculada somente para crimes sem violência ou grave ameaça.'
  ];

  // ---- render form ----
  // default de um campo select: c.def > 'NÃO' (se existir) > primeira opção
  function defaultFor(c) {
    if (c.def) return c.def;
    if (c.opcoes && c.opcoes.indexOf('NÃO') !== -1) return 'NÃO';
    return c.opcoes ? c.opcoes[0] : '';
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var a in attrs) e.setAttribute(a, attrs[a]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function renderForm() {
    var root = document.getElementById('form');
    SECOES.forEach(function (sec) {
      var card = el('div');
      card.appendChild(el('div', { class: 'sec-title' }, sec.titulo));
      if (sec.hint) card.appendChild(el('p', { class: 'hint', style: 'color:#B3261E;font-size:13px;margin:-8px 0 12px' }, sec.hint));
      var grid = el('div', { class: 'grid' });
      sec.campos.forEach(function (c) {
        var f = el('div', { class: 'field' + (c.tipo === 'tempo' || c.tipo === 'text' ? ' full' : '') });
        f.appendChild(el('label', { for: 'f_' + c.k }, c.label));
        if (c.tipo === 'tempo') {
          var t = el('div', { class: 'tempo' });
          ['anos', 'meses', 'dias'].forEach(function (u) {
            var wrap = el('div');
            wrap.appendChild(el('span', { class: 'u' }, u));
            wrap.appendChild(el('input', { type: 'number', min: '0', id: 'f_' + c.k + '_' + u, 'data-tempo': c.k, 'data-u': u, value: '0' }));
            t.appendChild(wrap);
          });
          f.appendChild(t);
        } else if (c.tipo === 'select') {
          var s = el('select', { id: 'f_' + c.k, 'data-k': c.k });
          var dft = defaultFor(c);
          c.opcoes.forEach(function (o) {
            var opt = el('option', { value: o }, o);
            if (dft === o) opt.setAttribute('selected', '');
            s.appendChild(opt);
          });
          f.appendChild(s);
        } else if (c.tipo === 'date') {
          f.appendChild(el('input', { type: 'date', id: 'f_' + c.k, 'data-k': c.k }));
        } else if (c.tipo === 'number') {
          f.appendChild(el('input', { type: 'number', min: '0', id: 'f_' + c.k, 'data-k': c.k, value: '0' }));
        } else {
          f.appendChild(el('input', { type: 'text', id: 'f_' + c.k, 'data-k': c.k }));
        }
        grid.appendChild(f);
      });
      card.appendChild(grid);
      root.appendChild(card);
    });
  }

  function coletar() {
    var input = {};
    document.querySelectorAll('[data-k]').forEach(function (e) {
      input[e.getAttribute('data-k')] = e.value;
    });
    var tempos = {};
    document.querySelectorAll('[data-tempo]').forEach(function (e) {
      var k = e.getAttribute('data-tempo'), u = e.getAttribute('data-u');
      tempos[k] = tempos[k] || {};
      tempos[k][u] = Number(e.value) || 0;
    });
    for (var k in tempos) input[k] = tempos[k];
    return input;
  }

  // ---- render resultado ----
  function badge(valor, caption) {
    var cls = 'b-no', txt = valor;
    if (valor === 'Preenche os requisitos') { cls = 'b-ok'; }
    else if (valor === 'Não preenche os requisitos') { cls = 'b-no'; }
    else if (valor === 'A analisar') { cls = 'b-an'; }
    else if (valor === 'Sem previsão no Decreto') { cls = 'b-na'; }
    return '<span class="badge ' + cls + '"><span class="cap">' + caption + '</span>' + txt + '</span>';
  }

  function incisoCard(id, lbl, texto, r, comut) {
    var v = r.incisos[id];
    var badges = badge(v.geral, 'Regra Geral');
    if (v.especial) badges += badge(v.especial, 'Regra Especial §2º');
    var html = '<div class="inciso"><div class="top">' +
      '<div><div class="lbl">' + lbl + '</div><div class="q" style="font-size:13px;color:#555">' + texto + '</div>' +
      '</div><div class="badges">' + badges + '</div></div>';
    if (comut && v.situacao === 'Preenche os requisitos') {
      html += '<div class="comut">' +
        '<div class="c-item"><div class="k">Comutação</div><div class="v">' + v.comutacaoTxt + '</div></div>' +
        '<div class="c-item"><div class="k">Pena após comutação</div><div class="v">' + v.penaAposTxt + '</div></div>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function calcular() {
    var input = coletar();
    var r = MotorIndulto.calcular(input);
    var body = document.getElementById('resultado-body');
    var h = '';

    // resumo
    h += '<div class="resumo">' +
      box('Total de penas impostas', r.resumo.totalPenasImpostas) +
      box('Total de pena cumprida', r.resumo.totalPenaCumprida) +
      box('Pena remanescente', r.resumo.penaRemanescente) +
      box('Pena cumprida (impeditivos)', r.resumo.penaCumpridaImpeditivos) +
      '</div>';

    h += '<div class="sec-title">Indulto — Art. 9º, 10 e 12</div>';
    INCISOS_INDULTO.forEach(function (i) { h += incisoCard(i[0], i[1], i[2], r, false); });

    h += '<div class="sec-title">Comutação — Art. 11 e 13</div>';
    INCISOS_COMUT.forEach(function (i) {
      var v = r.incisos[i[0]];
      // para comutação, o "situacao" é o veredito; monta badge a partir dele
      var badges = badge(v.situacao, 'Situação');
      var html = '<div class="inciso"><div class="top">' +
        '<div><div class="lbl">' + i[1] + '</div><div class="q" style="font-size:13px;color:#555">' + i[2] + '</div></div>' +
        '<div class="badges">' + badges + '</div></div>';
      if (v.situacao === 'Preenche os requisitos') {
        html += '<div class="comut">' +
          '<div class="c-item"><div class="k">Comutação</div><div class="v">' + v.comutacaoTxt + '</div></div>' +
          '<div class="c-item"><div class="k">Pena total após comutação</div><div class="v">' + v.penaAposTxt + '</div></div>' +
          '</div>';
      }
      html += '</div>';
      h += html;
    });

    // avisos
    if (r.avisos && r.avisos.length) {
      h += '<div class="avisos"><h3>Pontos a validar juridicamente</h3><ul>';
      r.avisos.forEach(function (a) { h += '<li>' + a + '</li>'; });
      h += '</ul></div>';
    }

    // notas
    h += '<div class="notas"><strong>Notas</strong>';
    NOTAS.forEach(function (n, i) { h += '<p>' + (i + 1) + '. ' + n + '</p>'; });
    h += '</div>';

    body.innerHTML = h;
    document.getElementById('resultado').style.display = 'block';
    document.getElementById('resultado').scrollIntoView({ behavior: 'smooth' });
  }

  function box(k, v) {
    return '<div class="box"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  // mapa k -> default (calculado a partir das seções)
  var DEFAULTS = {};
  SECOES.forEach(function (sec) { sec.campos.forEach(function (c) { if (c.tipo === 'select') DEFAULTS[c.k] = defaultFor(c); }); });

  function limpar() {
    document.querySelectorAll('#form input, #form select').forEach(function (e) {
      if (e.type === 'number') e.value = '0';
      else if (e.tagName === 'SELECT') e.value = DEFAULTS[e.getAttribute('data-k')];
      else e.value = '';
    });
    document.getElementById('resultado').style.display = 'none';
  }

  function exemplo() {
    limpar();
    setVal('penaSemViolencia', { anos: 6 });
    setVal('penaCumpridaSEEU', { anos: 2 });
    document.getElementById('f_dataNascimento').value = '1980-01-01';
    document.getElementById('f_dataUltimaPrisao').value = '2023-01-01';
    document.getElementById('f_reincidente').value = 'NÃO';
    document.getElementById('f_regime').value = 'FECHADO';
    calcular();
  }

  function setVal(k, obj) {
    ['anos', 'meses', 'dias'].forEach(function (u) {
      var e = document.getElementById('f_' + k + '_' + u);
      if (e) e.value = obj[u] || 0;
    });
  }

  window.calcular = calcular;
  window.limpar = limpar;
  window.exemplo = exemplo;

  renderForm();
})();
