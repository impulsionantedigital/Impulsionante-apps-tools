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

### Intervalo (`Intervalo`)

Um período de tempo em um calendário específico:

```
{
  inicio: "YYYY-MM-DDTHH:MM:SS",  // ISO 8601, sem fuso horário
  fim:    "YYYY-MM-DDTHH:MM:SS"   // ISO 8601, exclusivo [início, fim)
}
```

O fim é **exclusivo**, ou seja, a janela é `[início, fim)`. Isso evita contar o mesmo instante duas vezes quando dois intervalos são contíguos.

### Segmento de Regra (`SegmentoRegra`)

Agrupa as regras de cômputo válidas durante uma janela de tempo (por exemplo, quando o decreto da cautelar vigora com certos termos):

```
{
  inicio: "YYYY-MM-DDTHH:MM:SS",         // Quando a regra começa
  fim:    "YYYY-MM-DDTHH:MM:SS",         // Quando a regra termina

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

> 📌 **De onde vem a lista de feriados nacionais.** De uma planilha homologada, transcrita em
> `feriados.ts` (cópia de `temp/feriados.json`, que não vai a produção). Ela cobre **1990-2050** e
> registra o que a lei diz **em cada ano** — a Consciência Negra só entra em 2024, Finados não é
> feriado em todos os anos, e 1990 e 1994 têm as Eleições gerais. Feriados **móveis** (Carnaval,
> Sexta-feira Santa, Corpus Christi) **não** estão na lista, e derivá-los por Páscoa reintroduziria
> uma regra que a fonte não tem. Fora da faixa coberta, nenhum feriado é computado.

### Geração de faixas (memória de cálculo, resumo e petição)

A faixa de cada dia tem o **valor da regra** — 24h ou o turno inteiro — e não o pedaço que sobra do
recorte pela janela. Sem isso a memória de cálculo contradiria o total (o turno `22:00→06:00` com a
janela fechando à meia-noite apareceria como `22:00→00:00`, 2h, enquanto o total diria 8h). O corte
pela janela fica só na **borda** (primeiro e último dia), que é onde a data/hora exata do modo
avançado precisa mandar.

> 🔴 Um dia cuja regra não produz **nada** dentro da janela não conta nem aparece: classificação,
> faixa e contagem andam juntas, na mesma passada, por construção.

### Consolidação das faixas
1. **Unificar as faixas válidas**: juntar as faixas geradas (turno noturno, folga integral, feriados, nacionais ou declarados) de todos os segmentos.
2. **Mesclar sobreposições**: ordenar por início e unir faixas que se tocam ou sobrepõem — é o que faz "sexta 22h–sábado 6h" + "sábado integral" não contarem as 6 primeiras horas de sábado duas vezes na memória de cálculo.

### PASSO 4 — total, dias e saldo
1. `totalMinutos = diasIntegrais × 1440 + diasUteis × H_NOTURNO` (inteiros, nunca float).
2. `diasDetracao = floor(totalMinutos / 1440)`
3. `saldoMinutos = totalMinutos % 1440`

> 🔴 **O total NÃO é a soma das faixas de tempo.** Ele é a conta de dias acima. As faixas existem para
> mostrar *como* o número se compõe, não para produzi-lo.

### Retorno

Devolver o resultado com:
- Total e saldo em minutos e horas formatadas.
- Dias de detração calculados.
- Memória de cálculo: os intervalos consolidados.
- Versão do algoritmo (`RN-2.0`), para rastreabilidade futura.

---

## 4. Casos de Borda

O motor trata explicitamente os seguintes cenários:

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

### O turno noturno pertence ao dia em que COMEÇA (madrugada inclusa)

Um turno `22:00 → 06:00` que começa num dia marcado em `diasSemanaNoturno` **conta por inteiro**, incluindo as horas que caem na madrugada do dia seguinte. A madrugada **não** é um turno novo: se o dia seguinte também estiver marcado, ele gera o **próprio** turno (`22:00` do dia seguinte `→ 06:00` da madrugada posterior), separado.

É isso que faz dois dias consecutivos marcarem 16h num turno de 8h — e não 8h nem 22h.

### O ÚLTIMO dia do período gera o turno dele
Quando o último dia do período está marcado em `diasSemanaNoturno`, a janela é estendida até o **fim** do turno daquele dia (`06:00` do dia seguinte, no caso de `22:00 → 06:00`), para que o turno não seja cortado a zero.

**Por que:** "Fim da cautelar = 01/01/2026" significa que a cautelar vigeu **naquele dia**. O turno das 22:00 de 01/01/2026 é o cumprimento daquele dia e conta por inteiro — antes, a janela fechava à meia-noite de 01/01 e o turno era descartado, o que fazia o total sair **1 dia a menos** que a conta `dias × horas ÷ 24`.

A extensão é sempre para o **fim** do turno, nunca para o **início** dele: a janela é semiaberta `[início, fim)`, então parar no instante de início descartaria o turno inteiro (a fronteira encosta e a interseção é vazia).

Quando o último dia **não** está marcado em `diasSemanaNoturno` (por exemplo, só há folga integral), a janela termina à meia-noite seguinte, sem extensão — a folga integral já é um dia completo de 24h e esticá-la criaria um dia espúrio.

---

## 5. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| **RN-1.0** | 15/09/2026 | Versão inicial. Motor de cálculo implementado conforme Tema Repetitivo STJ 1.155 e REsp 1.977.135/SC. Suporta período noturno configurável, dias de folga integral, feriados, intervalos adicionais e exclusões com justificativa. Conversão: `dias = floor(total_minutos / 1440)`. |
| **RN-1.1** | 16/09/2026 | Correção: o turno noturno do **último dia** do período era descartado (a janela fechava à meia-noite daquele dia, antes das 22:00), e o total saía 1 dia a menos que `dias × horas ÷ 24`. A janela agora é estendida até o **fim** do turno do último dia, quando ele está marcado. Documentados também o pertencimento do turno ao dia em que começa e a fronteira semiaberta. Mesmos dados, antes e depois: `01/01/2020`–`01/01/2026`, todos os dias, `22:00–06:00` — de `17538:00 / 730 dias` para **`17544:00 / 731 dias`**. |
| **RN-2.0** | Nova especificação do motor | 🔴 **Mudança de fórmula.** O total passa a ser uma **contagem de dias** (PASSO 3), não a soma das faixas de tempo: o período é iterado dia a dia e cada dia vale, por precedência, **24h** (se está em `diasFolgaIntegral`, ou é feriado nacional com o checkbox ligado, ou está em `feriadosIntegral`) ou **H_NOTURNO** (se está em `diasSemanaNoturno`). Total = `diasIntegrais × 1440 + diasUteis × H_NOTURNO`; dias = `floor(total / 1440)`. **Novo checkbox** `incluirFeriadosUteis`: computa os **feriados nacionais** que caem em dia útil como dia integral, a partir da lista homologada de `feriados.ts`. Feriado que caia em dia de folga integral vale 24h **uma vez só** (a precedência resolve). 🔴 **Removidos os intervalos adicionais e excluídos**, do tipo, do motor e da tela: a conta é por dia inteiro, e um desconto de horas não tem onde entrar. As faixas de tempo continuam sendo geradas para a memória de cálculo, o resumo e a petição. |

---

## Como Usar Este Documento

- **Auditoria**: Se o resultado de um cálculo for questionado meses depois, esta documentação + o resultado salvo (com `intervalosConsolidados`, `diasUteis` e `diasIntegrais`) provê rastreabilidade completa.
- **Mudanças de regra**: Se jurisprudência nova exigir mudança no algoritmo, cria-se uma nova versão (ex: `RN-2.0`) e documenta-se a mudança nesta tabela. Cálculos antigos salvos com versão anterior não são reatualizados automaticamente — ao reabri-los, a tela avisa que o número mudou.
- **Treinamento jurídico**: A seção Base Jurídica e Casos de Borda são legíveis para profissionais sem formação técnica, servindo como referência rápida.

---

**Próximas pendências:**
- Exportação em PDF/CSV/JSON do resultado (planejado para versão futura).
- "Golden master" contra calculadora de referência: 10–20 cenários comparados manualmente (homologação pós-entrega).
