# Detração por Recolhimento Noturno — design

> Spec de implementação do primeiro produto da família "Detração".
> Data: 2026-09-15. Fonte funcional: `Plano_Implementacao_Calculo_Recolhimento_Noturno_SEEU.pdf`
> (anexado nesta sessão), versão 1.0, 15/09/2026.

## 1. Objetivo

Entregar a calculadora de **Detração por Recolhimento Noturno**: soma as horas de recolhimento
domiciliar noturno e em dias de folga de uma cautelar, converte o total em dias de 24h (Tema
Repetitivo 1.155/STJ) e produz uma memória de cálculo auditável.

É o primeiro produto de uma nova família, **Detração**, separada da família **Indulto e
Comutação** (CIC) — domínios diferentes, motores diferentes, sem reaproveitar a rota do CIC.

## 2. Base jurídica (resumo)

- Recolhimento noturno e em dias de folga é computável para detração (Tema 1.155/STJ, REsp
  1.977.135/SC, Terceira Seção, 23/11/2022).
- Monitoramento eletrônico **não** é requisito para o cômputo — é informativo, nunca condição
  matemática.
- Conversão: somar as horas válidas e consolidadas, `dias = floor(total_minutos / 1440)`. O
  saldo abaixo de 24h é exibido para auditoria, mas **não** gera dia a mais.
- Descumprimento comprovado exclui o período do cômputo (jurisprudência posterior do STJ), mas
  isso é uma decisão jurídica de cada caso — o motor nunca presume descumprimento, só aplica
  exclusões que o usuário informar.

Esta seção é o resumo operacional; o texto completo (fontes, tese, precedentes) vai para o
documento de lógica versionado (§8).

## 3. Por que família nova, e não a rota do CIC

A rota `/ferramentas/[calculadora]` é acoplada ao domínio de indulto/comutação: motor por
decreto (`motorPorId`), questionário de incisos, resultado por veredito, anexo de petição. Nada
disso existe em detração — aqui a entrada são datas/horários/intervalos, e a saída é uma soma de
tempo, não uma lista de incisos. Encaixar os dois domínios na mesma rota exigiria ramificação
condicional dentro de componentes que hoje são limpos por serem agnósticos de decreto **dentro de
um único domínio** — não agnósticos de domínio.

Decisão: nova família `detracao`, rota própria, motor próprio, tabela própria. O catálogo de
produtos ganha um campo `familia` para que o menu (e futuras rotas) saibam agrupar por família sem
precisar de mais um produto para "descobrir" isso.

## 4. Modelo de dados do motor

Tipos do domínio (`src/lib/detracao/recolhimento-noturno/tipos.ts`):

```ts
type Intervalo = { inicio: string /* ISO datetime */; fim: string /* ISO datetime, exclusivo */ }

type SegmentoRegra = {
  inicio: string
  fim: string
  horaInicioNoturno: string   // "HH:MM"
  horaFimNoturno: string      // "HH:MM"
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]  // datas "YYYY-MM-DD"
  intervalosAdicionais: Intervalo[]
  intervalosExcluidos: Array<Intervalo & { motivo: string }>
}

type EntradaCalculo = {
  timezone: string            // default "America/Sao_Paulo"
  segmentos: SegmentoRegra[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

type ResultadoCalculo = {
  totalMinutos: number
  totalHoras: string          // "H:MM"
  diasDetracao: number
  saldoMinutos: number
  saldoHoras: string          // "HH:MM"
  intervalosConsolidados: Intervalo[]
  intervalosExcluidos: Array<Intervalo & { motivo: string }>
  algoritmoVersao: 'RN-1.0'
}
```

O "modo simples" da tela é só uma UI que preenche **um segmento único** sem exclusões nem
intervalos adicionais — o motor não tem noção de "simples" ou "avançado", só de `EntradaCalculo`.
Isso evita dois caminhos de cálculo para manter em paridade.

## 5. Algoritmo

Pipeline fiel ao §5 e §10 do PDF, implementado como função pura
`calcular(entrada: EntradaCalculo): ResultadoCalculo`:

1. Validar entrada (datas, horários, timezone, pelo menos 1 dia aplicável por segmento OU
   intervalo especial).
2. Para cada segmento, dentro da janela `[inicio, fim)`:
   a. Para cada data tocada pela janela: se o dia da semana está em `diasSemanaNoturno`, gerar
      `[data+horaInicio, data+horaFim)`; se `horaFim <= horaInicio`, o fim cai no dia seguinte.
   b. Se o dia da semana está em `diasFolgaIntegral`, ou a data está em `feriadosIntegral`, gerar
      `[data 00:00, data+1 00:00)`.
   c. Recortar todo intervalo gerado pela janela do segmento (`intersect`).
   d. Acrescentar `intervalosAdicionais` (já recortados pela janela).
3. Juntar os intervalos de todos os segmentos; separar `intervalosExcluidos` (já recortados por
   segmento) num array à parte.
4. `subtractIntervals(todos, excluidos)`.
5. `mergeIntervals(válidos)` — ordenar por início, unir sobrepostos/contíguos (`mergeIntervals` do
   §5.3, transcrito ao pé da letra: essencial para o caso "sexta 22h–sábado 6h" + "sábado
   integral" não duplicar as 6 primeiras horas de sábado).
6. Somar duração em segundos → minutos inteiros (nunca float).
7. `diasDetracao = floor(totalMinutos / 1440)`; `saldoMinutos = totalMinutos % 1440`.
8. Devolver resultado + memória de cálculo (`intervalosConsolidados`, `intervalosExcluidos`).

Casos de borda (§12 do PDF), todos tratados no motor:

- `00:00–00:00` não vira "24 horas" automaticamente — é rejeitado na validação; dia integral é
  campo explícito (`diasFolgaIntegral`/`feriadosIntegral`), nunca inferido do horário.
- Duração sempre em inteiros (segundos internamente, minutos na saída); nunca `float`.
- Fim de janela é exclusivo (`[inicio, fim)`) para não contar o instante de fronteira duas vezes.
- `timezone` configurável, default `America/Sao_Paulo`; todo cálculo usa data/hora local da
  decisão, não UTC bruto.

## 6. Persistência e acesso

Tabela `detracao_calculos` (migration `0066_ferramentas_detracao.sql`), mesmo padrão de RLS que
`indulto_comutacao_calculos` (§ referência: `supabase/migrations/0062_ferramentas_indulto_comutacao.sql`):

```sql
create table if not exists public.detracao_calculos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  calculo_tipo    text not null,   -- 'recolhimento-noturno'; futuro-prova p/ 2º produto de detração
  algoritmo_versao text not null, -- 'RN-1.0'
  titulo          text not null,
  entrada         jsonb not null,
  resultado       jsonb not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
```

Só policy de `select`, restrita a `e_membro(workspace_id) and user_id = auth.uid()` — escrita só
via server action com `admin()` (service-role), exatamente como no CIC.

Acesso: novo produto no catálogo, `detracao-recolhimento-noturno`, `familia: 'detracao'`, gate
pelo `estadoDoProduto`/`exigirEscrita` já existentes (genéricos sobre `ProdutoId`). Nenhuma
mudança necessária em `vendas/processar.ts` nem em `config/acoes-comercial.ts` — ambos já
percorrem `PRODUTOS`.

## 7. Rotas e telas

```
src/app/(app)/ferramentas/detracao/[calculadora]/
  page.tsx        — lista de cálculos do membro (mesma casca de calculos.ts/ListaCalculos)
  novo/page.tsx    — formulário novo
  [id]/page.tsx    — reabrir/editar
  acoes.ts         — salvar/atualizar/excluir (mesmo formato de exigirEscrita + revalidatePath)
  Formulario.tsx   — modo simples + seção expansível "avançado"
  Resultado.tsx    — dias em destaque, saldo, memória de cálculo expansível
```

`caminhoDoProduto` passa a olhar `familia` para montar o prefixo:
`/ferramentas/${familia === 'detracao' ? 'detracao/' : ''}${slug}` (mantém a rota do CIC
idêntica — nenhuma migração de link existente).

Exportação em PDF/CSV/JSON (PDF §8, passo 20) **fora do escopo** desta primeira versão — fica
documentada como pendência no `LEIA-ME.md` da pasta de docs do produto.

## 8. Documentação de lógica versionada

`docs/detracao-recolhimento-noturno/logica.md`: base jurídica completa, regras de negócio,
fórmulas, modelo de dados, casos de borda, e uma seção **Histórico de versões** (começando em
`RN-1.0`) para registrar toda mudança futura de regra ou de jurisprudência — é o documento que
resolveria uma dúvida de "por que este cálculo deu esse número" um ano depois. Fica no mesmo
formato do `LEIA-ME.md` do CIC: índice curto + o que precisa de decisão do dono do produto.

## 9. Menu

`src/components/shell/Rail.tsx`:

- Título da seção passa de "Ferramentas" para "Calculadoras".
- Mantém o subgrupo "Indulto e Comutação" com os produtos daquela família.
- Novo subgrupo "Detração" logo abaixo, com "Recolhimento Noturno" apontando para
  `caminhoDoProduto`. `produtosNoMenu` passa a ser agrupado por `familia` em vez de assumir uma
  família só.

## 10. Testes

- Motor: unitários cobrindo T01–T12 do §11 do PDF (limites 1439/1440/2879/2880 minutos, união de
  sobreposição sexta 22h+sábado integral = 26h, corte no início/fim da cautelar, exclusão parcial
  de 2h, ausência de monitoramento não altera o resultado, dois segmentos com regras diferentes,
  intervalos contíguos sem duplicar).
- Contrato: teste garantindo que todo `ProdutoId` de família `detracao` tem rota resolvível e
  vice-versa (mesmo espírito do teste de reconciliação do CIC).
- RLS/acesso: reaproveita o padrão de teste já usado para `indulto_comutacao_calculos`.

## 11. Fora de escopo (registrado, não esquecido)

- Exportação PDF/CSV/JSON do resultado.
- "Golden master" contra a calculadora Streamlit de referência — o PDF recomenda 10–20 cenários
  comparados manualmente; fica como próximo passo de homologação, não bloqueia esta entrega.
- Qualquer automação de exclusão por falta de monitoramento eletrônico (nunca deve existir, por
  regra jurídica — registrado aqui só para não ser proposto por engano depois).
