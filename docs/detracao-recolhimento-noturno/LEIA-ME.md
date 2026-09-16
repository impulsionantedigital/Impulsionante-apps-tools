# Calculadora de Detração por Recolhimento Noturno

Ferramenta para cálculo de detração em períodos de recolhimento domiciliar noturno

---

## O que faz

A Calculadora de Detração por Recolhimento Noturno ajuda você a:

- **Somar horas de recolhimento noturno** registradas durante um período
- **Contar dias de folga integral** (quando não há expediente)
- **Converter para dias de 24 horas** conforme estabelecido na Tema 1.155/STJ
- **Gerar memória de cálculo auditável** com todos os intervalos registrados, facilitando a análise e comprovação de cálculos

---

## Como usar (passo a passo)

### 1. Iniciar um novo cálculo
- Acesse a ferramenta e clique em **"Novo Cálculo"**

### 2. Preencher as informações básicas
- **Data de início:** dia em que o recolhimento começou
- **Data de término:** último dia do período a ser calculado
- **Horários do recolhimento noturno:** hora de início e hora de término (ex.: 22:00 até 06:00)
- **Dias da semana:** quais dias da semana estava em recolhimento (segunda, terça, etc.)

### 3. (Opcional) Adicionar intervalos e exclusões
- **Intervalos extras:** se houver dias ou períodos fora do padrão semanal
- **Exclusões:** registrar dias que não contam (ex.: quando o recolhimento foi suspenso), incluindo o motivo

### 4. Calcular
- Clique em **"Calcular"** para processar todos os dados

### 5. Salvar resultado
- Revise os detalhes da memória de cálculo
- Clique em **"Salvar"** para guardar o resultado

---

## Conceitos principais

### Recolhimento noturno
Período entre duas horas específicas em um dia de semana definido. Por exemplo: segunda a sexta de 22:00 até 06:00 do dia seguinte.

### Dias de folga integral
Quando não há expediente em um dia completo, contam como um dia inteiro (das 00:00 às 23:59).

### Feriados nacionais
Feriados nacionais também contam integralmente (24 horas), sem necessidade de especificar o dia da semana.

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
| [`logica.md`](logica.md) | A regra jurídica e o algoritmo versionados (`RN-1.0`) — é este arquivo que responde "por que este cálculo deu esse número" um ano depois |
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
