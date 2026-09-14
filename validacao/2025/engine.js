/*
 * Motor de cálculo — Indulto e Comutação · Decreto nº 12.970/2025
 * Reimplementação fiel da aba "Cálculo" da planilha original (GPS da Pena).
 * Cada bloco referencia as células/fórmulas de origem para auditoria.
 *
 * Convenção de tempo de PENA: 30 dias/mês, 360 dias/ano (Sistema A da planilha).
 * Exceção: inciso IV usa dias-calendário reais (Sistema B) — ver campo F49.
 *
 * Correções aplicadas em relação à planilha original (bugs claros de fórmula):
 *  - L145:L149 (#VALUE!): quando não há comutação, "pena após" retorna null em vez de erro.
 *  - G149 referenciava F148 (linha errada) — corrigido para F149.
 *  - Inciso XI (M/Shalf): só testava I30 (tempo semiaberto+aberto somados),
 *    ignorando I28 (tempo só no semiaberto) — quem cumpriu o requisito
 *    inteiramente em regime semiaberto nunca preenche I30 e era sempre
 *    reprovado. Corrigido para aceitar I28 OU I30.
 * Ambiguidades jurídicas NÃO alteradas (apenas sinalizadas em `avisos`):
 *  - base da "pena após comutação" usa a pena total imposta (P9), não a remanescente.
 *  - base da comutação Art.13/§4º usa max(pena cumprida, remanescente).
 */

(function (root) {
  'use strict';

  var DIA_ANO = 360;
  var DIA_MES = 30;

  function dias(t) {
    if (!t) return 0;
    var a = Number(t.anos) || 0, m = Number(t.meses) || 0, d = Number(t.dias) || 0;
    return d + m * DIA_MES + a * DIA_ANO;
  }

  // "SIM"/"NÃO"/"NÃO SE APLICA" -> 1/2/3
  function sn(v) {
    var s = String(v || '').trim().toUpperCase();
    if (s === 'SIM') return 1;
    if (s === 'NÃO' || s === 'NAO') return 2;
    if (s === 'NÃO SE APLICA' || s === 'NAO SE APLICA') return 3;
    return 2;
  }

  function parseData(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    // aceita 'YYYY-MM-DD'
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function diffDiasReais(dataInicio, dataFim) {
    if (!dataInicio || !dataFim) return 0;
    return Math.round((dataFim - dataInicio) / 86400000);
  }

  // formata dias (base 360) em "X anos Y meses Z dias"
  function fmtDias(nDias) {
    if (nDias == null || isNaN(nDias)) return '-';
    var neg = nDias < 0;
    var n = Math.abs(nDias);
    var anos = Math.floor(n / DIA_ANO);
    var resto = n - anos * DIA_ANO;
    var meses = Math.floor(resto / DIA_MES);
    var d = Math.round(resto - meses * DIA_MES);
    if (d === 30) { d = 0; meses += 1; }
    if (meses === 12) { meses = 0; anos += 1; }
    return (neg ? '- ' : '') + anos + ' anos ' + meses + ' meses ' + d + ' dias';
  }

  function calcular(input) {
    input = input || {};

    // ---- Penas (dias, base 360) ----
    var N6 = dias(input.penaImpeditiva);       // crime IMPEDITIVO (hediondo)
    var N7 = dias(input.penaViolencia);        // COM violência/grave ameaça
    var N8 = dias(input.penaSemViolencia);     // SEM violência
    var N9 = N6 + N7 + N8;                      // total imposto
    var P6 = N6, P7 = N7, P8 = N8, P9 = N9;

    // Frações por categoria (linhas 6/7/8, colunas D..J da planilha)
    var D6 = N6 * 2 / 3;                         // 2/3 do impeditivo
    var E7 = N7 / 4, E8 = N8 / 4;                // 1/4
    var F7 = N7 / 3, F8 = N8 / 3;                // 1/3
    var G7 = N7 / 5, G8 = N8 / 5;                // 1/5
    var H7 = N7 / 2, H8 = N8 / 2;                // 1/2
    var I7 = N7 / 8, I8 = N8 / 8;                // 1/8
    var J7 = N7 / 6, J8 = N8 / 6;                // 1/6

    // ---- Pena cumprida ----
    var N11 = dias(input.penaCumpridaSEEU);
    var N12 = dias(input.penaCumpridaNaoSEEU);
    var N13 = N11 + N12;                         // total cumprido
    var P13 = N13;
    // pena cumprida descontando os 2/3 do hediondo (N14/P14)
    var P14 = (P13 - D6 >= P7 + P8) ? (P7 + P8) : (P13 - D6);
    // pena remanescente (N16/P16)
    var N16 = N9 - N13, P16 = P9 - P13;
    // pena remanescente descontando hediondo (N17/P17)
    var P17 = (P9 - P6) - (P13 - D6);

    // ---- Datas ----
    var DATA_BASE = new Date(2025, 11, 25);     // 25/12/2025
    var D53 = parseData(input.dataNascimento);  // nascimento
    var D49 = parseData(input.dataUltimaPrisao);
    var F49 = diffDiasReais(D49, DATA_BASE);    // dias-calendário reais desde última prisão
    var I25 = Number(input.diasRemicao) || 0;
    var I28 = dias(input.tempoSemiaberto);
    var I30 = dias(input.tempoSemiabertoAberto);

    // idade em 25/12/2025
    var LIM_60 = new Date(1965, 11, 25); // nascidos até aqui => >=60 anos
    var LIM_21 = new Date(2004, 11, 25); // nascidos a partir daqui => <=21 anos
    var idade60mais = D53 ? (D53 <= LIM_60) : false;
    var idade21menos = D53 ? (D53 >= LIM_21) : false;

    // ---- Flags do Questionário ----
    var I18 = sn(input.cumpriu23ImpeditivoDataFato == null ? 'SIM' : input.cumpriu23ImpeditivoDataFato); // E113 (default SIM, como na planilha)
    var I20 = sn(input.reincidente);                  // E35
    var I21 = sn(input.colaboracaoPremiada);          // E63
    var I22 = sn(input.faccao);                       // E65
    var I23 = sn(input.rdd);                          // E67
    var I24 = sn(input.presidioFederal);              // E69
    var I26 = sn(input.condicoesGravesSaude);         // E73
    var I31 = (String(input.sexo || '').trim().toUpperCase() === 'FEMININO') ? 1 : 2; // E31
    var I32 = sn(input.gestante);                     // E75
    var I33 = sn(input.filhoAte16);                   // E77
    var I34 = sn(input.filhoDeficiencia);             // E79
    var I35 = sn(input.filhoDeficienciaCuidados);     // E81
    var I36 = sn(input.filhoDoencaCronica);           // E83
    var I37 = sn(input.filhoDoencaCronicaCuidados);   // E85
    var I41 = sn(input.homemUnicoResponsavel);        // E87
    var I42 = sn(input.imprescindivelCrianca);        // E89
    var I43 = sn(input.avoNetos);                     // E91
    var I44 = sn(input.deficiencia);                  // E71
    var I45 = sn(input.justicaRestaurativa);          // E51
    var I46 = sn(input.crimeContraCrianca);           // E99
    var I47 = sn(input.periodoLiberdade2Anos);        // E55
    var I51 = sn(input.faltaGraveAno);                // E57
    var I52 = sn(input.faltaGraveExecucao);           // E59
    var I55 = sn(input.crimePatrimonio);              // E107
    var I56 = sn(input.reparouDano);                  // E109
    var I57 = sn(input.valorBemSalarioMinimo);        // E111
    var I60 = sn(input.hipossuficiente);              // E119
    var I62 = sn(input.saidasOuTrabalhoExterno);      // E93
    var I63 = (function () {                           // E37 regime
      var r = String(input.regime || '').trim().toUpperCase();
      if (r === 'FECHADO') return 1;
      if (r === 'SEMIABERTO') return 2;
      if (r === 'ABERTO') return 3;
      return 1;
    })();
    var I64 = sn(input.livramentoCondicional);        // E45
    var I65 = sn(input.penasSubstituidas);            // E103
    var I66 = sn(input.condenacaoAberto);             // E105
    var I67 = sn(input.respondendoOutroCrimeViolento);// E101
    var I68 = faixa(input.programaEgressos, ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS']); // E49
    var I69 = faixa(input.monitoramentoSV56, ['NÃO', 'HÁ MENOS DE 01 ANO E 06 MESES', 'ENTRE 01 ANO E 06 MESES E 03 ANOS', 'HÁ MAIS DE 03 ANOS']); // E47
    var I70 = faixa(input.estudo, ['NÃO', 'MENOS DE 12 MESES', 'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS', 'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS']); // E95
    var I71 = sn(input.concluiuCurso);                // E97
    var I72 = sn(input.cumpriuFracaoViolenciaDataFato == null ? 'SIM' : input.cumpriuFracaoViolenciaDataFato); // E115 (default SIM, como na planilha)
    var D59 = Number(input.valorMulta) || 0;          // E117

    // ---- Portões reutilizados ----
    var gates5 = !(I22 === 1 || I23 === 1 || I24 === 1 || I51 === 1 || I21 === 1); // E (5 impedimentos)
    var gates4 = !(I22 === 1 || I23 === 1 || I24 === 1 || I51 === 1);              // E do Art.13/§4º (sem colaboração)
    var hediondo = (N6 === 0) || (N13 >= N6 * 2 / 3);   // H (cumpriu 2/3 do impeditivo)
    var i18ok = (I18 === 1 || I18 === 3);               // G (2/3 impeditivo p/ data do fato)
    var i72ok = (I72 === 1 || I72 === 3);               // K (fração violência p/ data do fato)
    var temPenaNaoImped = !(N8 === 0 && N7 === 0);      // "não é só impeditivo"
    var elegivelP = idade60mais || I32 === 1 || I33 === 1 || I34 === 1 || I36 === 1 ||
                    I41 === 1 || I42 === 1 || I44 === 1 || I45 === 1;  // §2º (col P)
    var qOk = (I46 === 2);                              // crime não contra criança (col Q)

    function faixa(v, lista) {
      var s = String(v || '').trim().toUpperCase();
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].toUpperCase() === s) return i + 1;
      }
      return 1;
    }

    var texto = function (ok) { return ok ? 'Preenche os requisitos' : 'Não preenche os requisitos'; };
    var incisos = {};

    // ===================== ART. 9º =====================
    // Inciso I (linha 75) — pena ≤8a, sem violência, 1/5(não reinc)/1/3(reinc)
    (function () {
      var fracI = (I20 === 2) ? (D6 + G8 + G7 <= N13) : (D6 + F8 + F7 <= N13);
      var fracR = (I20 === 2) ? (D6 + G8 / 2 + G7 / 2 <= N13) : (D6 + F8 / 2 + F7 / 2 <= N13);
      var geral = gates5 && (N9 <= 8 * 360) && i18ok && hediondo && fracI && (N8 !== 0) && i72ok;
      var esp = gates5 && (N9 <= 8 * 360) && i18ok && hediondo && (N8 !== 0) && i72ok && elegivelP && qOk && fracR;
      incisos.art9_I = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso II (78) — pena ≤12a, sem violência, 1/3/1/2
    (function () {
      var fracI = (I20 === 2) ? (D6 + F8 + F7 <= N13) : (D6 + H8 + H7 <= N13);
      var fracR = (I20 === 2) ? (D6 + F8 / 2 + F7 / 2 <= N13) : (D6 + H8 / 2 + H7 / 2 <= N13);
      var geral = gates5 && (N9 <= 12 * 360) && i18ok && hediondo && fracI && (N8 !== 0) && i72ok;
      var esp = gates5 && (N9 <= 12 * 360) && i18ok && hediondo && (N8 !== 0) && i72ok && elegivelP && qOk && fracR;
      incisos.art9_II = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso III (81) — pena ≤4a, COM violência, 1/3/1/2
    (function () {
      var fracI = (I20 === 2) ? (D6 + F8 + F7 <= N13) : (D6 + H8 + H7 <= N13);
      var fracR = (I20 === 2) ? (D6 + F8 / 2 + F7 / 2 <= N13) : (D6 + H8 / 2 + H7 / 2 <= N13);
      var geral = gates5 && (N9 <= 4 * 360) && i18ok && hediondo && fracI && (N7 !== 0) && i72ok;
      var esp = gates5 && (N9 <= 4 * 360) && i18ok && hediondo && (N7 !== 0) && i72ok && elegivelP && qOk && fracR;
      incisos.art9_III = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso IV (84) — 15a(não reinc)/20a(reinc) ININTERRUPTOS (dias reais + remição)
    (function () {
      var H = (I20 === 2) ? ((F49 + I25) >= 5480) : ((F49 + I25) >= 7306);
      var J = (I20 === 2) ? (N13 >= D6 + 15 * 360) : (N13 >= D6 + 20 * 360);
      var Rhalf = (I20 === 2) ? ((F49 + I25) >= 5480 / 2) : ((F49 + I25) >= 7306 / 2);
      var Shalf = (I20 === 2) ? (N13 >= D6 + 15 * 360 / 2) : (N13 >= D6 + 20 * 360 / 2);
      var geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J;
      var esp = gates5 && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Rhalf && Shalf;
      incisos.art9_IV = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso V (87) — 20a/25a NÃO ininterruptos, liberdade ≤2a
    (function () {
      var H = (I20 === 2) ? (N13 >= 20 * 360) : (N13 >= 25 * 360);
      var J = (I20 === 2) ? (N13 >= D6 + 20 * 360) : (N13 >= D6 + 25 * 360);
      var K = (I47 !== 1);
      var Rhalf = (I20 === 2) ? (N13 >= 20 * 360 / 2) : (N13 >= 25 * 360 / 2);
      var Shalf = (I20 === 2) ? (N13 >= D6 + 20 * 360 / 2) : (N13 >= D6 + 25 * 360 / 2);
      var geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J && K;
      var esp = gates5 && i18ok && hediondo && temPenaNaoImped && K && elegivelP && qOk && Rhalf && Shalf;
      incisos.art9_V = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso VI (90) — 10a/15a ININTERRUPTOS em regime SEMIABERTO
    (function () {
      var H = (I20 === 2) ? (I28 >= 10 * 360) : (I28 >= 15 * 360);
      var J = (I20 === 2) ? (N13 >= D6 + 10 * 360) : (N13 >= D6 + 15 * 360);
      var K = (I63 === 2);
      var Rhalf = (I20 === 2) ? (I28 >= 10 * 360 / 2) : (I28 >= 15 * 360 / 2);
      var Shalf = (I20 === 2) ? (N13 >= D6 + 10 * 360 / 2) : (N13 >= D6 + 15 * 360 / 2);
      var geral = gates5 && i18ok && hediondo && H && temPenaNaoImped && J && K;
      var esp = gates5 && i18ok && hediondo && temPenaNaoImped && K && elegivelP && qOk && Rhalf && Shalf;
      incisos.art9_VI = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso VII (93) — aberto/restritiva/sursis, 1/6(não reinc)/1/5(reinc)
    (function () {
      var F = (I65 === 1 || I66 === 1);
      var fracI = (I20 === 2) ? (D6 + J7 + J8 <= N13) : (D6 + G7 + G8 <= N13);
      var fracR = (I20 === 2) ? (D6 + J7 / 2 + J8 / 2 <= N13) : (D6 + G7 / 2 + G8 / 2 <= N13);
      var geral = gates5 && F && i18ok && hediondo && fracI && temPenaNaoImped;
      var esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && fracR;
      incisos.art9_VII = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso VIII (96) — livramento/aberto, remanescente ≤6a(não reinc)/4a(reinc)
    (function () {
      var F = (I63 === 3 || I64 === 1);
      var I = (I20 === 2) ? (N16 <= 6 * 360) : (N16 <= 4 * 360);
      var Rhalf = (I20 === 2) ? (N16 <= 6 * 360 * 2) : (N16 <= 4 * 360 * 2);
      var geral = gates5 && F && i18ok && hediondo && I && temPenaNaoImped;
      var esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Rhalf;
      incisos.art9_VIII = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso IX (99) — aberto/restritiva/livramento/sursis + programa egressos ≥2a
    (function () {
      var F = (I65 === 1 || I66 === 1 || I64 === 1);
      var I = (I68 === 4);
      var Resp = (I68 === 3 || I68 === 4);
      var geral = gates5 && F && i18ok && hediondo && I && temPenaNaoImped;
      var esp = gates5 && F && i18ok && hediondo && temPenaNaoImped && elegivelP && qOk && Resp;
      incisos.art9_IX = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso X (102) — semiaberto + monitoramento SV56 há >3a
    (function () {
      var H = (I63 === 2);
      var I = (I69 === 4);
      var Resp = (I69 === 3 || I69 === 4);
      var geral = gates5 && i18ok && hediondo && H && I && temPenaNaoImped;
      var esp = gates5 && i18ok && hediondo && H && temPenaNaoImped && elegivelP && qOk && Resp;
      incisos.art9_X = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso XI (105) — pena ≤12a, semiaberto/aberto, 1/3/1/2 + 5 saídas/trabalho externo
    (function () {
      var F = (N9 <= 12 * 360);
      var G = (I62 === 1);
      var J = (I20 === 2) ? (D6 + F8 + F7 <= N13) : (D6 + H8 + H7 <= N13);
      var K = temPenaNaoImped;
      var L = (I63 !== 1);
      var M = (I20 === 2) ? (I28 >= (F7 + F8) || I30 >= (F7 + F8)) : ((H7 + H8) <= I28 || (H7 + H8) <= I30);
      var Rhalf = (I20 === 2) ? (D6 + F8 / 2 + F7 / 2 <= N13) : (D6 + H8 / 2 + H7 / 2 <= N13);
      var Shalf = (I20 === 2) ? (I28 >= (F7 + F8) / 2 || I30 >= (F7 + F8) / 2) : ((H7 + H8) / 2 <= I28 || (H7 + H8) / 2 <= I30);
      var geral = gates5 && F && G && i18ok && hediondo && J && K && L && M;
      var esp = gates5 && F && G && i18ok && hediondo && K && L && elegivelP && qOk && Rhalf && Shalf;
      incisos.art9_XI = { geral: texto(geral), especial: texto(esp) };
    })();

    // Inciso XII (108) — pena ≤12a, 1/5/1/4?, curso frequentando (sem regra especial)
    (function () {
      var F = (N9 <= 12 * 360);
      var G = (I20 === 2) ? (I70 === 3) : (I70 === 4);
      var J = (I20 === 2) ? (D6 + J8 + J7 <= N13) : (D6 + G8 + G7 <= N13);
      var K = temPenaNaoImped;
      var geral = gates5 && F && G && i18ok && hediondo && J && K;
      incisos.art9_XII = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // Inciso XIII (111) — pena ≤12a, 1/5(não reinc)/1/4(reinc), concluiu curso
    (function () {
      var F = (N9 <= 12 * 360);
      var G = (I71 === 1);
      var J = (I20 === 2) ? (D6 + G8 + G7 <= N13) : (D6 + E8 + E7 <= N13);
      var K = temPenaNaoImped;
      var geral = gates5 && F && G && i18ok && hediondo && J && K;
      incisos.art9_XIII = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // Inciso XIV (114) — crime patrimonial sem violência, bem ≤ salário mín, cumpriu 3 meses
    (function () {
      var F = (I55 === 1);
      var G = (I57 === 1);
      var H = (N13 >= 90 + D6);
      var I = (N8 !== 0);
      var geral = gates5 && F && G && H && I && hediondo;
      incisos.art9_XIV = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // Inciso XV (117) — crime patrimonial sem violência, reparou dano ou hipossuficiente
    (function () {
      var F = (I55 === 1);
      var G = (I56 === 1 || I60 === 1);
      var J = (N8 !== 0);
      var geral = gates5 && F && G && i18ok && hediondo && J && i72ok;
      incisos.art9_XV = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // Inciso XVI (120) — condições pessoais graves (saúde/deficiência)
    (function () {
      var F = (I26 === 1);
      var geral = gates5 && F && i18ok && hediondo && temPenaNaoImped;
      incisos.art9_XVI = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // ===================== ART. 10 (123) — mulheres =====================
    (function () {
      var F = (I52 !== 1); // não pode ter falta grave em toda a execução
      var I = (N8 !== 0);
      var J = (N7 === 0);
      var K = (I67 !== 1);
      var L = (I31 !== 2); // feminino
      var fr = (D6 + I7 + I8 <= N13); // fração 1/8
      var M = ( (I33 === 1 && fr) ||
                (I34 === 1 && I35 === 1 && fr) ||
                (I43 === 1 && fr) ||
                ((idade60mais || idade21menos) && fr) ||
                (I44 === 1) );
      var geral = gates5 && F && i18ok && hediondo && I && J && K && L && M;
      incisos.art10 = { geral: texto(geral), especial: 'Sem previsão no Decreto' };
    })();

    // ===================== ART. 12 (126) — pena de multa =====================
    (function () {
      var F = (D59 > 20000) ? (I60 === 1) : true;
      var G = temPenaNaoImped;
      var out;
      if (D59 === 0) out = 'A analisar';
      else out = texto(gates5 && F && G);
      incisos.art12 = { geral: out, especial: 'Sem previsão no Decreto' };
    })();

    // ===================== COMUTAÇÃO =====================
    // Art. 11, I (129) — mulher, ≤8a, REINCIDENTE, 1/3
    var c11_I = (function () {
      var F = i18ok, G = hediondo, H = (N8 !== 0), I = (N9 <= 8 * 360);
      var J = (I20 !== 2); // reincidente obrigatório
      var K = (I31 !== 2); // feminino
      var L = (D6 + F8 + F7 <= N13);
      return gates5 && F && G && H && I && J && K && L;
    })();
    // Art. 11, II (132) — mulher, filho, NÃO reincidente, 1/5
    var c11_II = (function () {
      var F = i18ok, G = hediondo, H = (N8 !== 0);
      var I = (I33 === 1 || (I34 === 1 && I35 === 1) || (I36 === 1 && I37 === 1));
      var J = (I20 !== 1); // não reincidente obrigatório
      var K = (I31 !== 2);
      var L = (D6 + G8 + G7 <= N13);
      return gates5 && F && G && H && I && J && K && L;
    })();
    // Art. 11, III (135) — mulher, filho, REINCIDENTE, 1/2
    var c11_III = (function () {
      var F = i18ok, G = hediondo, H = (N8 !== 0);
      var I = (I33 === 1 || (I34 === 1 && I35 === 1) || (I36 === 1 && I37 === 1));
      var J = (I20 !== 2); // reincidente obrigatório
      var K = (I31 !== 2);
      var L = (D6 + G8 + G7 <= N13);
      return gates5 && F && G && H && I && J && K && L;
    })();
    // Art. 13 (138) — comutação geral 1/5(não reinc)/1/4(reinc) — gates4 (sem colaboração)
    var c13 = (function () {
      var F = i18ok, G = hediondo;
      var H = (I20 === 2) ? (D6 + G7 + G8 < N13) : (D6 + E7 + E8 < N13);
      var I = temPenaNaoImped;
      return gates4 && F && G && H && I;
    })();
    // Art. 13 §4º (141) — 2/3 para perfil do §2º
    var c13_4 = (function () {
      var F = i18ok, G = hediondo;
      var H = (I20 === 2) ? (D6 + G7 + G8 <= N13) : (D6 + E7 + E8 <= N13);
      var I = elegivelP;
      var J = temPenaNaoImped;
      return gates4 && F && G && H && I && J;
    })();

    // Quantum de comutação (linhas 145-149)
    function baseComut(fracao) {
      if (P6 === 0) return Math.max(P13, P16) * fracao;
      return Math.max(P14, P17) * fracao;
    }
    function montaComut(preenche, quantumDias) {
      if (!preenche) return { situacao: texto(false), comutacao: null, penaApos: null, comutacaoTxt: 'Sem Comutação', penaAposTxt: 'Sem Comutação' };
      var apos = P9 - quantumDias; // (ambiguidade: usa pena TOTAL imposta — ver avisos)
      return {
        situacao: texto(true),
        comutacao: quantumDias,
        penaApos: apos,
        comutacaoTxt: fmtDias(quantumDias),
        penaAposTxt: fmtDias(apos)
      };
    }

    incisos.art11_I = montaComut(c11_I, P8 * 1 / 4);
    incisos.art11_II = montaComut(c11_II, P8 * 2 / 3);
    incisos.art11_III = montaComut(c11_III, P8 * 1 / 2);
    incisos.art13 = montaComut(c13, baseComut(1 / 5));
    incisos.art13_4 = montaComut(c13_4, baseComut(2 / 3)); // G149 corrigido: usa F149 (c13_4), não F148

    // ---- Avisos (ambiguidades jurídicas herdadas da planilha, a validar) ----
    var avisos = [
      'A "pena após a comutação" usa a pena total imposta como base (fórmula original), sem descontar o tempo já cumprido — revisar interpretação jurídica.',
      'A base da comutação do Art. 13 e §4º usa o maior valor entre pena cumprida e pena remanescente — a comutação legalmente incide sobre a remanescente.'
    ];

    // ---- Resumo de tempos (aba Questionario) ----
    var resumo = {
      totalPenasImpostas: fmtDias(N9),
      totalPenaCumprida: fmtDias(N13),
      penaCumpridaImpeditivos: fmtDias((N13 < D6) ? N13 : D6),
      penaRemanescente: fmtDias(N16),
      fracoes: {
        '2/3 impeditivos': fmtDias(D6),
        '1/5 não impeditivos': fmtDias((N7 + N8) / 5),
        '1/4 não impeditivos': fmtDias((N7 + N8) / 4),
        '1/3 não impeditivos': fmtDias((N7 + N8) / 3),
        '1/2 não impeditivos': fmtDias((N7 + N8) / 2)
      }
    };

    return {
      incisos: incisos,
      resumo: resumo,
      avisos: avisos,
      _debug: { N6: N6, N7: N7, N8: N8, N9: N9, N13: N13, N16: N16, F49: F49, D6: D6, I20: I20, I63: I63 }
    };
  }

  var api = { calcular: calcular, dias: dias, fmtDias: fmtDias };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MotorIndulto = api;
})(typeof self !== 'undefined' ? self : this);
