# Calculadora de Detração por Recolhimento Noturno — Lógica v2.0
**Documento versão:** `RN-2.0`
**Especificação técnica:** [`docs/superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md`](../superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md)

---

## 1. Base Jurídica

A calculadora de Detração por Recolhimento Noturno funda-se na jurisprudência uniformizada do Superior Tribunal de Justiça:

- **Tema Repetitivo STJ 1.155**: Recolhimento domiciliar noturno e em dias de folga são computáveis para fins de detração de pena, respeitadas as condições legais da cautelar.
- **REsp 1.977.135/SC (Terceira Seção, 23 de novembro de 2022)**: Precedente que consolida a tese sobre computabilidade de recolhimento noturno e dias de folga, independente de formalização em petição no sentido jurídico estrito.

### Pontos fundamentais

1. **Monitoramento eletrônico é informativo, nunca condição matemática**: O fato de haver (ou não) monitoramento eletrônico ativo não altera o cômputo. O motor nunca lê esse campo para decidir se um intervalo é válido; serve apenas para auditoria e contexto jurídico.

2. **Conversão de tempo em dias**: A soma de horas/minutos válidos é convertida em dias de 24 horas corridas:
   - Fórmula: `dias = floor(total_minutos / 1440)`
   - Resto: `saldo = total_minutos % 1440`
   - O saldo inferior a 24 horas (< 1440 minutos) é exibido para auditoria, mas **nunca** arredonda para cima nem gera um dia a mais.

3. **Descumprimento exclui o período**: quando a jurisprudência posterior (STJ) reconhecer descumprimento comprovado das obrigações da cautelar, esse período é excluído do cômputo. Isso é uma **decisão jurídica do caso concreto**, nunca presunção automática. 🔴 A calculadora **não tem campo de exclusão**: o caminho é o membro ajustar as datas ou as listas de dias do segmento (ou os feriados declarados) para o que a decisão determina — um desconto de horas soltas não teria como entrar numa conta que decide o valor de cada dia inteiro.

---

## 2. Modelo de Dados

A calculadora trabalha com os seguintes tipos de dados:

### Segmento de Regra (`SegmentoRegra`)

Agrupa as regras de cômputo válidas durante um período (por exemplo, quando o decreto da cautelar vigora com certos termos).

> 🔴 **Não há intervalo, instante nem janela semiaberta.** O período é um par de DATAS DE CALENDÁRIO, e as duas pontas contam: "fim da cautelar = 31/12/2025" significa que o dia 31/12 computa. O turno noturno vale `H_NOTURNO` no dia em que a regra o coloca — ninguém precisa saber em que data civil cada hora cai, o que dispensa fatiar turnos na meia-noite e recortá-los por janela.

```
{
  dataInicio: "YYYY-MM-DD",              // Primeiro dia da cautelar (INCLUSIVE)
  dataFim:    "YYYY-MM-DD",              // Último dia da cautelar (INCLUSIVE)

  horaInicioNoturno: "HH:MM",            // Ex: "22:00"
  horaFimNoturno:    "HH:MM",            // Ex: "06:00"
  diasSemanaNoturno: ["MON", "TUE", ...],// Dias da semana em que há período noturno
  diasFolgaIntegral: ["SAT", "SUN"],     // Dias da semana contados por inteiro (24h)
  feriadosIntegral:  ["2026-01-01", ...],// Feriados declarados à mão, contados inteiros (24h)
    incluirFeriadosUteis: false             // Computa os feriados NACIONAIS em dia útil como 24h
  }
```

> 🔴 **Não há intervalos adicionais nem excluídos.** O motor só conhece as quatro listas de dias
> acima; qualquer tempo a mais ou a menos se expressa mudando essas listas, e não somando ou
> descontando pedaços de tempo. Um campo de exclusão parcial de 2h, por exemplo, não teria como
> entrar numa conta que decide o VALOR DO DIA — ele ficaria na tela dizendo que desconta, sem
> descontar nada.
```

### Entrada de Cálculo (`EntradaCalculo`)

Os dados que o usuário (jurista, paralegal, etc.) informa para executar o cálculo:

```
{
  timezone: "America/Sao_Paulo",         // Fuso horário da decisão (default)
  segmentos: [ SegmentoRegra, ... ],     // Uma ou mais regras

  observacoes?: "texto",                 // Contexto jurídico (livre)
  monitoramentoEletronico?: "sim" | "nao" | "nao_informado"  // Metadado, não afeta cálculo
}
```

### Resultado de Cálculo (`ResultadoCalculo`)

O que o motor devolve após o processamento:

```
{
  totalMinutos:        1440,             // Soma total em minutos (inteiro)
  totalHoras:          "24:00",          // Formatado em H:MM
  diasDetracao:        1,                // floor(totalMinutos / 1440)
  saldoMinutos:        0,                // totalMinutos % 1440
  saldoHoras:          "00:00",          // Saldo formatado em HH:MM

  intervalosConsolidados: [              // Intervalos validados e unificados
    { inicio: "2026-01-01T22:00:00", fim: "2026-01-02T06:00:00" },
    ...
  ],

  diasUteis:           3,                // Dias de regra noturna que entraram na conta
  diasIntegrais:       2,                // Dias integrais (folga, feriado) que entraram na conta
  algoritmoVersao: "RN-2.0"              // Permite avisar se regra mudou
}
```

---

## 3. Algoritmo (Passo a Passo)

O motor executa a especificação da calculadora de recolhimento domiciliar:

### Validação da entrada
1. Verificar se há pelo menos um segmento de regra.
2. Para cada segmento:
   - Validar que `horaInicioNoturno` e `horaFimNoturno` estão no formato `HH:MM`.
   - Validar que não há horário noturno ambíguo: se `diasSemanaNoturno` contém dias, rejeitar `horaInicio === horaFim` (não é "24 horas" automático; dia inteiro vem de campo explícito).
   - Validar que `fim > inicio` (janela não vazia).

### PASSO 1 — duração diária noturna (`H_NOTURNO`)

- Se `horaFim <= horaInicio`: `H_NOTURNO = (24h − horaInicio) + horaFim` (o turno vira a meia-noite).
- Senão: `H_NOTURNO = horaFim − horaInicio`.

### PASSO 3 — contagem dia a dia
O motor itera **cada data tocada pela janela** do segmento e classifica o dia **uma única vez**, por
precedência:

1. Dia em `diasFolgaIntegral` → **24h** (dia integral).
2. Senão, feriado **nacional** com `incluirFeriadosUteis` ligado → **24h** (dia integral).
3. Senão, data em `feriadosIntegral` (declarado à mão) → **24h** (dia integral).
4. Senão, dia em `diasSemanaNoturno` → **H_NOTURNO** (dia útil).
5. Senão → **0** (dia livre, não computado).

> 🔴 **Precedência não é preferência estética — é o que impede a contagem dobrada.** Um feriado que
> cai em sábado, com sábado já em `diasFolgaIntegral`, vale 24h **uma vez**: a regra 1 o captura e a
> 2 nunca é alcançada. Somar as duas hipóteses contaria 48h no mesmo dia de calendário.

> ⚠️ A condição de feriado **não exige** que o dia esteja em `diasSemanaNoturno`: o feriado nacional
> é computado por si. Um dia não marcado em nenhuma lista e que não seja feriado continua valendo 0.

> 📌 **De onde vem a lista de feriados nacionais.** De uma planilha homologada, versionada em
> `dados/feriados.json` e transcrita em `feriados.ts` (o motor precisa do `Set` pronto em runtime,
> sem ler arquivo). Ela cobre **1990-2050** e
> registra o que a lei diz **em cada ano** — a Consciência Negra só entra em 2024, Finados não é
> feriado em todos os anos, e 1990 e 1994 têm as Eleições gerais. Feriados **móveis** (Carnaval,
> Sexta-feira Santa, Corpus Christi) **não** estão na lista, e derivá-los por Páscoa reintroduziria
> uma regra que a fonte não tem. Fora da faixa coberta, nenhum feriado é computado.

### PASSO 4 — total, dias e saldo
1. `totalMinutos = diasIntegrais × 1440 + diasUteis × H_NOTURNO` (inteiros, nunca float).
2. `diasDetracao = floor(totalMinutos / 1440)`
3. `saldoMinutos = totalMinutos % 1440`

> 🔴 **A conta é contar e multiplicar, e nada mais.** Não há faixas de tempo, não há sobreposição
> para unir, não há instante para comparar. O resultado (`composicao`) sai da MESMA contagem que
> produz o total, então as duas não têm como divergir.

### Retorno

Devolver o resultado com:
- Total e saldo em minutos e horas formatadas.
- Dias de detração calculados.
- Memória de cálculo: os intervalos consolidados.
- Versão do algoritmo (`RN-2.0`), para rastreabilidade futura.

---

## 4. Casos de Borda

O motor trata explicitamente os seguintes cenários:

### O período é inclusivo nas duas pontas
"Início da cautelar = 01/01/2025" e "Fim da cautelar = 31/12/2025" computam 01/01 **e** 31/12. Não há meia-noite de fronteira nem dia extra no fim: o número de dias de calendário tocados é exatamente `fim − início + 1`.

### `00:00–00:00` é rejeitado

Se o usuário tenta definir um período noturno com `horaInicio === horaFim` (por exemplo, `00:00–00:00` com dias da semana), o motor rejeita com erro claro:

> "Horário noturno com início igual ao fim é ambíguo. Para dia inteiro, use dias de folga integral ou feriados, não o horário noturno."

**Razão**: Evitar presunção de "24 horas" automático. Dia inteiro deve ser explícito no campo `diasFolgaIntegral` ou `feriadosIntegral`.

### Duração sempre inteira

Toda duração é arredondada para **minutos inteiros**. Como os horários vêm de `HH:MM` (sem segundos), o total em milissegundos é sempre múltiplo de 60.000 ms = 1 minuto. Não há perda de precisão.

### Fim de intervalo é exclusivo

A janela é sempre `[início, fim)`. Dois intervalos contíguos (ex: `09:00–12:00` e `12:00–15:00`) não contam o instante `12:00` duas vezes graças à exclusividade do fim.

### Timezone configurável

O padrão é `America/Sao_Paulo`, mas pode ser alterado. Todo cálculo usa data/hora **local** (sem conversão real de fuso), porque não há DST no Brasil atualmente. A decisão judicial vige em horário local; o motor respeita isso.

### Intervalo vazio (fimMs <= inicioMs)

Se um intervalo gerado tem fim menor ou igual ao início, ele é descartado (não contribui ao cômputo).

### Segmento sem dias aplicáveis
Se um segmento não tem `diasSemanaNoturno` nem `diasFolgaIntegral` nem `feriadosIntegral` (e o checkbox está desmarcado), ele gera zero — sem erro e sem presunção.

### O turno noturno pertence ao dia em que a regra o coloca
Um turno `22:00 → 06:00` num dia marcado em `diasSemanaNoturno` vale `H_NOTURNO` (8h) **naquele dia**. As horas que caem na madrugada seguinte não fazem parte de outro dia: cada dia marcado gera o seu próprio turno, e dois dias consecutivos marcam 16h.

> 🔴 Não há turno para "fatiar" nem meia-noite para recortar. A pergunta que o motor responde é "quantos dias de cada tipo existem no período?", e a resposta disso multiplica o valor do dia.

---

## 5. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| **RN-1.0** | 15/09/2026 | Versão inicial. Motor de cálculo implementado conforme Tema Repetitivo STJ 1.155 e REsp 1.977.135/SC. Suporta período noturno configurável, dias de folga integral, feriados, intervalos adicionais e exclusões com justificativa. Conversão: `dias = floor(total_minutos / 1440)`. |
| **RN-1.1** | 16/09/2026 | Correção: o turno noturno do **último dia** do período era descartado (a janela fechava à meia-noite daquele dia, antes das 22:00), e o total saía 1 dia a menos que `dias × horas ÷ 24`. A janela passou a ser estendida até o **fim** do turno do último dia, quando ele está marcado. Documentados também o pertencimento do turno ao dia em que começa e a fronteira semiaberta. Mesmos dados, antes e depois: `01/01/2020`–`01/01/2026`, todos os dias, `22:00–06:00` — de `17538:00 / 730 dias` para **`17544:00 / 731 dias`**. (**Superado na RN-2.0**: a extensão da janela não existe mais, e o último dia conta por ser uma data do intervalo.) |
| **RN-2.0** | Nova especificação do motor | 🔴 **Mudança de fórmula.** O total passa a ser uma **contagem de dias**, e a conta é contar e multiplicar: o período é iterado dia a dia, cada dia é classificado por precedência e vale **24h** (folga integral, feriado nacional com o checkbox ligado, ou feriado declarado) ou **H_NOTURNO** (dia em `diasSemanaNoturno`). Total = `diasIntegrais × 1440 + diasUteis × H_NOTURNO`. **Novo checkbox** `incluirFeriadosUteis`: computa os **feriados nacionais** que caem em dia útil como dia integral, a partir da lista homologada de `feriados.ts`. Feriado que caia em dia de folga integral vale 24h **uma vez só** (a precedência resolve). 🔴 **Removidos os intervalos adicionais e excluídos** (a conta é por dia inteiro, e um desconto de horas não tem onde entrar) e, com eles, **todo o aparato de faixas de tempo**: não há instante, não há janela semiaberta `[início, fim)`, não há turno fatiado na meia-noite, não há `fimDaJanela` esticando o período até o fim do turno do último dia. O período agora é um par de **datas de calendário, inclusivas nas duas pontas**. |

---

## Como Usar Este Documento

- **Auditoria**: Se o resultado de um cálculo for questionado meses depois, esta documentação + o resultado salvo (com `intervalosConsolidados`, `diasUteis` e `diasIntegrais`) provê rastreabilidade completa.
- **Mudanças de regra**: Se jurisprudência nova exigir mudança no algoritmo, cria-se uma nova versão (ex: `RN-2.0`) e documenta-se a mudança nesta tabela. Cálculos antigos salvos com versão anterior não são reatualizados automaticamente — ao reabri-los, a tela avisa que o número mudou.
- **Treinamento jurídico**: A seção Base Jurídica e Casos de Borda são legíveis para profissionais sem formação técnica, servindo como referência rápida.

---

**Próximas pendências:**
- Exportação em PDF/CSV/JSON do resultado (planejado para versão futura).
- "Golden master" contra calculadora de referência: 10–20 cenários comparados manualmente (homologação pós-entrega).
