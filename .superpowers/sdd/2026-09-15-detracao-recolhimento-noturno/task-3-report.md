# Task 3: Conversão do Formulário para Entrada do Motor — Relatório

**Data:** 2026-09-15  
**Status:** ✅ Concluído

## Resumo

Implementação da camada de conversão entre os campos do formulário (UI) e a entrada esperada pelo motor de cálculo. Esta camada trata:
- Conversão de datas soltas (`dataInicio`, `dataFim`) em janelas com hora (`inicio`, `fim`)
- Suporte a datas/horas exatas opcionais (`dataHoraInicioExata`, `dataHoraFimExata`) que sobrescrevem as datas simples
- Normalização de strings datetime-local (add segundos se faltarem)
- Fim exclusivo: "último dia" vira o INÍCIO do dia seguinte

## Arquivos Criados

### `src/lib/detracao/recolhimento-noturno/formulario.ts`

**Tipos:**
- `SegmentoFormulario` — Representa um segmento de regra como editado pela UI
- `EntradaFormulario` — Wrapper dos segmentos + metadados (timezone, observações, monitoramento eletrônico)

**Funções:**
1. `segmentoParaRegra(sf: SegmentoFormulario): SegmentoRegra`
   - Converte um segmento da forma do formulário para a forma esperada pelo motor
   - Trata o fim exclusivo: se não há `dataHoraFimExata`, usa o início do dia seguinte a `dataFim`
   - Normaliza datas/horas exatas (add `:00` se vier sem segundos)

2. `entradaFormularioParaCalculo(ef: EntradaFormulario): EntradaCalculo`
   - Converte todos os segmentos e preserva metadados
   - Passa direto para o motor

3. `segmentoFormularioEmBranco(): SegmentoFormulario`
   - Factory que retorna um segmento em branco com valores padrão
   - Hora noturna default: 22:00 — 06:00
   - Listas vazias para dias e intervalos

**Função interna:**
- `normalizarDataHora(valor: string): string` — Adiciona `:00` se o valor tiver apenas 16 caracteres (formato `<datetime-local>`)

## Testes — `tests/detracao/recolhimento-noturno/formulario.spec.ts`

Todos os 3 testes passaram:

1. ✅ **Fim exclusivo sem exatidão:**  
   Segmento com `dataInicio='2026-01-31'` e `dataFim='2026-01-31'` (sem horas exatas)  
   → `inicio='2026-01-31T00:00:00'`, `fim='2026-02-01T00:00:00'` (dia seguinte)

2. ✅ **Data/hora exata sem segundos:**  
   Segmento com `dataHoraInicioExata='2026-01-31T13:45'` e `dataHoraFimExata='2026-02-02T09:15'`  
   → `inicio='2026-01-31T13:45:00'`, `fim='2026-02-02T09:15:00'` (normalizadas)

3. ✅ **Metadados preservados:**  
   `EntradaFormulario` com `observacoes` e `monitoramentoEletronico`  
   → Convertida para `EntradaCalculo` com mesmos valores

## Execução dos Testes

```bash
pnpm vitest run tests/detracao/recolhimento-noturno/formulario.spec.ts
```

**Resultado:**
```
Test Files  1 passed (1)
Tests  3 passed (3)
```

## Casos Críticos Cobertos

- **Normalização:** `<input type="datetime-local">` devolvendo strings de 16 caracteres sem segundos
- **Fim exclusivo:** Conversão correta de "último dia" para início do dia seguinte
- **Dados vazios:** Segmento em branco com defaults sensatos
- **Preservação de metadados:** `timezone`, `observacoes`, `monitoramentoEletronico` passam intactos

## Commit

```bash
git add src/lib/detracao/recolhimento-noturno/formulario.ts tests/detracao/recolhimento-noturno/formulario.spec.ts
git commit -m "feat(detracao): conversão do formulário (datas soltas) para a entrada do motor

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

## Próximos Passos

- **Task 4:** Catálogo de produtos (nova família `detracao`, novo produto `detracao-recolhimento-noturno`)
- **Task 5:** Migration da tabela `detracao_calculos`
- **Task 6:** Server actions e camada de dados
- **Task 7+:** UI (formulário, resultado, lista de cálculos salvos)
