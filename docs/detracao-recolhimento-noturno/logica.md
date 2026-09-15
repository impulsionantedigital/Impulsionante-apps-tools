# Calculadora de Detração por Recolhimento Noturno — Lógica v1.0

**Documento versão:** `RN-1.0` (2026-09-15)  
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

3. **Descumprimento exclui o período**: Quando a jurisprudência posterior (STJ) reconhecer descumprimento comprovado das obrigações da cautelar, esse período é excluído do cômputo. Mas isso é uma **decisão jurídica do caso concreto**, nunca uma presunção automática do motor. O sistema só aplica exclusões que o usuário informar explicitamente, com justificativa.

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
  feriadosIntegral:  ["2026-01-01", ...],// Datas de feriados contados por inteiro (24h)

  intervalosAdicionais: [                // Períodos especiais (decisão judicial, p. ex.)
    { inicio: "...", fim: "..." },
    ...
  ],

  intervalosExcluidos: [                 // Períodos descontados (comprovado descumprimento)
    { inicio: "...", fim: "...", motivo: "..." },
    ...
  ]
}
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

  intervalosExcluidos: [                 // Intervalos descartados (auditoria)
    { inicio: "...", fim: "...", motivo: "..." },
    ...
  ],

  algoritmoVersao: "RN-1.0"              // Permite avisar se regra mudou
}
```

---

## 3. Algoritmo (Passo a Passo)

O motor executa o seguinte pipeline:

### Validação da entrada

1. Verificar se há pelo menos um segmento de regra.
2. Para cada segmento:
   - Validar que `horaInicioNoturno` e `horaFimNoturno` estão no formato `HH:MM`.
   - Validar que não há horário noturno ambíguo: se `diasSemanaNoturno` contém dias, rejeitar `horaInicio === horaFim` (não é "24 horas" automático; dia inteiro vem de campo explícito).
   - Validar que `fim > inicio` (janela não vazia).

### Geração de intervalos (por segmento)

Para cada data tocada pela janela `[início, fim)` do segmento:

1. **Determinar o dia da semana** dessa data (segunda, terça, ..., domingo).

2. **Se o dia está em `diasSemanaNoturno`**:
   - Gerar intervalo `[data + horaInicio, data + horaFim)`.
   - Se `horaFim <= horaInicio`, o fim cai no dia seguinte (intervalo noturno típico: 22h de sexta a 06h de sábado).
   - Recortar esse intervalo pela janela do segmento (não sai dos limites).

3. **Se o dia está em `diasFolgaIntegral` ou sua data está em `feriadosIntegral`**:
   - Gerar intervalo de 24 horas: `[data 00:00, data+1 00:00)`.
   - Recortar pela janela do segmento.

4. **Acrescentar `intervalosAdicionais`**: Cada intervalo adicional já vem recortado; apenas encaixá-lo na validação da janela.

### Tratamento de exclusões

1. Para cada intervalo em `intervalosExcluidos`:
   - Recortar pela janela do segmento.
   - Armazenar separadamente (memória de cálculo).

### Consolidação

1. **Unificar intervalos válidos**: Juntar todos os intervalos gerados (noite, folga, adicionais) de todos os segmentos.
2. **Subtrair exclusões**: Remover os períodos excluídos, inclusive aqueles que caem no meio de um intervalo (partido em dois).
3. **Mesclar sobreposições**: Ordenar por início e unir intervalos que se tocam ou sobrepõem. Essencial para o caso "sexta 22h–sábado 6h" + "sábado integral" não duplicar as 6 primeiras horas de sábado.

### Cálculo de dias e saldo

1. Somar a duração de todos os intervalos consolidados em **minutos inteiros** (nunca float).
2. `diasDetracao = floor(totalMinutos / 1440)`
3. `saldoMinutos = totalMinutos % 1440`

### Retorno

Devolver o resultado com:
- Total e saldo em minutos e horas formatadas.
- Dias de detração calculados.
- Memória de cálculo: intervalos consolidados e excluídos.
- Versão do algoritmo (`RN-1.0`), para rastreabilidade futura.

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

Se um segmento não tem `diasSemanaNoturno` nem `diasFolgaIntegral` nem `feriadosIntegral` nem `intervalosAdicionais`, ele gera zero minutos — sem erro, sem presunção.

---

## 5. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| **RN-1.0** | 15/09/2026 | Versão inicial. Motor de cálculo implementado conforme Tema Repetitivo STJ 1.155 e REsp 1.977.135/SC. Suporta período noturno configurável, dias de folga integral, feriados, intervalos adicionais e exclusões com justificativa. Conversão: `dias = floor(total_minutos / 1440)`. |

---

## Como Usar Este Documento

- **Auditoria**: Se o resultado de um cálculo for questionado meses depois, esta documentação + o resultado salvo (com `intervalosConsolidados` e `intervalosExcluidos`) provê rastreabilidade completa.
- **Mudanças de regra**: Se jurisprudência nova exigir mudança no algoritmo, cria-se uma nova versão (ex: `RN-1.1`) e documenta-se a mudança nesta tabela. Cálculos antigos salvos com `RN-1.0` não são reatualizados automaticamente.
- **Treinamento jurídico**: A seção Base Jurídica e Casos de Borda são legíveis para profissionais sem formação técnica, servindo como referência rápida.

---

**Próximas pendências:**
- Exportação em PDF/CSV/JSON do resultado (fora do escopo de `RN-1.0`, planejado para versão futura).
- "Golden master" contra calculadora de referência: 10–20 cenários comparados manualmente (homologação pós-entrega).
