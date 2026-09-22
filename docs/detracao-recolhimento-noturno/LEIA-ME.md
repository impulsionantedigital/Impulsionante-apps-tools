# Calculadora de Detração por Recolhimento Noturno

Ferramenta para cálculo de detração em períodos de recolhimento domiciliar noturno

---

## O que faz

A Calculadora de Detração por Recolhimento Noturno ajuda você a:

- **Somar horas de recolhimento noturno** registradas durante um período
- **Contar dias de folga integral** (quando não há expediente)
- **Converter para dias de 24 horas** conforme estabelecido na Tema 1.155/STJ
- **Gerar memória de cálculo auditável** com todos os períodos computados, facilitando a análise e comprovação de cálculos

---

## Como usar (passo a passo)

### 1. Iniciar um novo cálculo
- Acesse a ferramenta e clique em **"Novo Cálculo"**

### 2. Preencher as informações básicas
- **Data de início:** dia em que o recolhimento começou
- **Data de término:** último dia do período a ser calculado — esse dia **conta** (e não vira uma meia-noite de corte)
- **Horários do recolhimento noturno:** hora de início e hora de término (ex.: 22:00 até 06:00)
- **Dias da semana:** quais dias da semana estava em recolhimento (segunda, terça, etc.)
- **Feriados nacionais:** marque *"Computar feriados nacionais que caem em dias úteis como dia integral (24h)"* se os feriados nacionais do período devem contar como dia cheio

### 3. (Modo avançado) Ajustar a regra
- **Vários segmentos:** quando a regra muda no meio do período (mudança de horário, revogação)
- **Feriados de recolhimento integral:** para um feriado **estadual ou municipal**, ou outro dia que a decisão mande computar inteiro

### 4. Calcular
- Clique em **"Calcular"** para processar todos os dados

### 5. Salvar resultado
- Revise os detalhes da memória de cálculo
- Clique em **"Salvar"** para guardar o resultado

---

## Conceitos principais

### Recolhimento noturno
Período entre duas horas específicas em um dia de semana definido. Por exemplo: segunda a sexta de 22:00 até 06:00 do dia seguinte.

> Cada dia marcado vale o turno **inteiro** (8h no exemplo), independentemente de parte dessas horas cair na madrugada seguinte. O cálculo conta os DIAS e multiplica pelas horas diárias.

### Dias de folga integral
Quando não há expediente em um dia completo, contam como um dia inteiro (das 00:00 às 23:59).

### Feriados nacionais
Feriados nacionais também podem contar integralmente (24 horas), sem necessidade de especificar o dia da semana — basta marcar o checkbox.

A lista **não é digitada por você**: ela vem de uma planilha homologada de feriados, versionada junto do produto, que cobre **1990 a 2050**.

> ⚠️ São feriados **nacionais**, e nacionais é o que a lista tem — inclusive a **Sexta-feira Santa**, que muda de data a cada ano. Carnaval e Corpus Christi **não** entram: são ponto facultativo, não feriado nacional.

> ⚠️ Para um feriado **estadual ou municipal**, use o campo **"Feriados de recolhimento integral"** no modo avançado.

> ⚠️ A lista acompanha o que a lei diz **em cada ano**: a Consciência Negra (20/11) só entra a partir de **2024**. Fora da faixa 1990-2050, nenhum feriado é computado.

### Precedência dos dias
Quando um dia se encaixa em mais de uma regra, vale **nesta ordem**: dia de folga integral → feriado nacional (com o checkbox marcado) → dia de horário noturno. Assim um feriado que cai no sábado vale 24 horas uma vez só, e não 48.

### Monitoramento eletrônico
Se houver monitoramento eletrônico durante o recolhimento, isso é registrado como informação apenas. Não altera o cálculo de detração.

---

## Limitações desta versão
- **Exportação de arquivos:** A exportação em PDF, CSV ou JSON ainda está em desenvolvimento. No momento, você pode copiar ou fotografar o resultado na tela.
- **Comparação com referência:** A validação cruzada com a calculadora de referência (Streamlit) ainda não foi implementada.

---

## Documentação técnica
| Arquivo | Para quê |
|---|---|
| [`logica.md`](logica.md) | A regra jurídica e a lista de feriados versionados (`RN-2.0`) — é este arquivo que responde "por que este cálculo deu esse número" um ano depois |
| [`verificacoes-de-conjunto.md`](verificacoes-de-conjunto.md) | **Leia antes de mexer na impressão.** O que a folha de impressão leva ao anexo de petição e por quê, o defeito do total ausente que foi corrigido em 16/09/2026, e como rodar a tela localmente |

Documentos de origem, versionados junto:

- **Spec:** [`../superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md`](../superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md)
- **Plano:** [`../superpowers/plans/2026-09-15-detracao-recolhimento-noturno.md`](../superpowers/plans/2026-09-15-detracao-recolhimento-noturno.md)

---

## Suporte

Tem dúvidas ou encontrou um problema? Entre em contato conosco:

📧 **Email:** contato@impulsionante.com.br

Estamos prontos para ajudar!

---

**Versão:** 1.0  
**Última atualização:** setembro de 2026
