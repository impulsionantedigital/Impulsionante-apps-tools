# Calculadora de Indulto e Comutação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar, dentro do CRM, uma calculadora que diz — dispositivo por dispositivo — se um sentenciado preenche os requisitos de indulto e de comutação do Decreto nº 12.970/2025, com cada membro guardando apenas os próprios cálculos.

**Architecture:** Cada decreto é um motor próprio em `src/lib/indulto-comutacao/motores/<ano>/`, registrado num array de imports estáticos. O motor de 2025 é um porte literal do `engine.js` da POC, validado contra a planilha Excel original por um harness Python que vive em `validacao/`, fora da imagem Docker. As telas ficam em `src/app/(app)/ferramentas/indulto-comutacao/`; o cálculo roda no navegador e só o que o membro escolhe salvar vai ao banco.

**Tech Stack:** Next 16 (App Router, React 19), TypeScript strict, Supabase (Postgres + RLS), Zod, Vitest, CSS Modules. Harness de validação em Python 3 com a biblioteca `formulas`.

**Spec:** `docs/superpowers/specs/2026-09-12-calculadora-indulto-comutacao-design.md`

## Global Constraints

- **O `engine.js` da POC é a autoridade.** Ele está em `validacao/2025/engine.js`, junto do `ui.js` (questionário e metadados), do `cenarios.json` e da planilha. Onde este plano e o `engine.js` divergirem, **o engine vence** — o spec manda porte literal.
- **Data-base do Decreto 12.970/2025: `2025-12-25`.** No engine é `new Date(2025, 11, 25)`. Nunca escrita fora de `motores/2025/`.
- **Nenhuma regra jurídica é compartilhada entre motores.** Compartilhado: tipos, `tempo.ts`, o registro. Nada mais.
- **`motor.ts` é porte literal:** mesma ordem de blocos, mesmos nomes de variável (`N6`…`N9`, `D6`, `E7/E8`, `F7/F8`, `G7/G8`, `H7/H8`, `I7/I8`, `J7/J8`, `N11`, `N13`, `N16`, `P6`…`P9`, `P13`, `P14`, `P16`, `P17`, `I18`…`I72`, `D53`, `D49`, `F49`, `D59`, `gates4`, `gates5`, `hediondo`, `i18ok`, `i72ok`, `elegivelP`, `qOk`, `temPenaNaoImped`), mesmos comentários de linha da planilha (`linha 75`, `78`, `81`…).
- **Ids dos incisos, verbatim do engine:** `art9_I`, `art9_II`, `art9_III`, `art9_IV`, `art9_V`, `art9_VI`, `art9_VII`, `art9_VIII`, `art9_IX`, `art9_X`, `art9_XI`, `art9_XII`, `art9_XIII`, `art9_XIV`, `art9_XV`, `art9_XVI`, `art10`, `art12`, `art11_I`, `art11_II`, `art11_III`, `art13`, `art13_4`. **Underscore e algarismo romano maiúsculo** — nunca kebab-case.
- **Chaves de entrada, verbatim do engine:** `penaImpeditiva`, `penaViolencia`, `penaSemViolencia`, `penaCumpridaSEEU`, `penaCumpridaNaoSEEU`, `dataNascimento`, `dataUltimaPrisao`, `diasRemicao`, `sexo`, `regime`, `reincidente`, `faccao`, `estudo`, etc. **Nunca renomeie uma chave** para algo mais bonito: o motor as lê por nome.
- **Duas convenções de tempo:** 30/360 (`dias()`, `fmtDias()`); calendário real com `Math.round` (`diasCorridos()`) **apenas** no inciso IV (`F49`).
- **Dois bugs da planilha corrigidos, marcados em comentário:** `L145:L149` (`#VALUE!` → `null`) e `G149` (apontava `F148`, corrigido para `F149`).
- **Duas ambiguidades preservadas, marcadas em comentário:** `penaApos = P9 - quantum` (pena total imposta); `baseComut` usa `max` entre cumprida e remanescente.
- **Nenhuma policy de escrita para `authenticated`.** Leitura por RLS (`e_membro(workspace_id) and user_id = auth.uid()`); escrita só por server action com `admin()`.
- **`workspace_id` e `user_id` vêm sempre da sessão, nunca do payload.**
- **Migrations aditivas e idempotentes.** `create policy` vai em `do $$ … end $$;` consultando `pg_policies`.
- **`pnpm`, nunca `npm`.** Código e UI em português.
- **Vereditos:** `'preenche' | 'nao_preenche' | 'a_analisar' | 'sem_previsao'`.

## Divergências entre este plano e o engine: as decisões já tomadas

O plano original foi escrito antes da entrega do `engine.js`. Estas decisões já estão tomadas e
estão refletidas nas tarefas abaixo — não as reabra:

| Assunto | Decisão |
|---|---|
| Chaves do questionário | As do engine, verbatim (`penaViolencia`, não `penaComViolencia`) |
| Ids dos incisos | `art9_I`, não `art9-i` |
| `fmtDias` | Replica o engine: sempre `"X anos Y meses Z dias"` com zeros, `'-'` para null, `'- '` para negativo |
| `Veredito` | O miolo fica literal, mas `texto()` devolve o **código**; a UI resolve o rótulo |
| `Resumo` | Números (dias), não strings; inclui `doisTercosImpeditivos` e `penaCumpridaImpeditivos` |
| `Resultado.incisos` | Array na ordem de inserção do engine, não objeto keyed |
| `diasCorridos` | Usa `Math.round`, como `diffDiasReais` |
| Defaults de select | Regra do `ui.js`: `def` > `'NÃO'` se estiver nas opções > primeira opção |

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `tests/__mocks__/server-only.ts` | Stub do `server-only` para o Vitest (o `vitest.config.ts` já o referencia) |
| `src/lib/indulto-comutacao/tempo.ts` | `dias()`, `fmtDias()`, `diasCorridos()` |
| `src/lib/indulto-comutacao/tipos.ts` | `Tempo`, `Entrada`, `Veredito`, `ResultadoInciso`, `Resumo`, `Resultado`, `MetaInciso`, `Campo`, `Secao`, `MotorDecreto` |
| `src/lib/indulto-comutacao/registro.ts` | `REGISTRO`, `motorPorId()`, `motorPadrao()` |
| `src/lib/indulto-comutacao/motores/2025/questionario.ts` | As 12 seções, transcritas do `ui.js` |
| `src/lib/indulto-comutacao/motores/2025/incisos.ts` | Metadados dos 23 dispositivos e as 4 notas, transcritos do `ui.js` |
| `src/lib/indulto-comutacao/motores/2025/motor.ts` | Porte literal do `engine.js` |
| `src/lib/indulto-comutacao/motores/2025/index.ts` | O `MotorDecreto` de 2025 |
| `validacao/oraculo.py` | Avalia a planilha via `formulas` e grava `esperado.json` |
| `src/app/(app)/ferramentas/**` | Telas, server actions e leitura |
| `supabase/migrations/0062_ferramentas_indulto_comutacao.sql` | Tabela + índice + RLS |

---

### Task 1: Alicerce de testes e as convenções de tempo

O `vitest.config.ts` já aponta para `./tests/__mocks__/server-only.ts`, mas nem `node_modules`
nem `tests/` existem nesta cópia. Esta tarefa torna `pnpm test` executável e entrega a primeira
unidade: a contagem de tempo, portada de `validacao/2025/engine.js`.

**Files:**
- Create: `tests/__mocks__/server-only.ts`
- Create: `src/lib/indulto-comutacao/tempo.ts`
- Test: `tests/indulto-comutacao/tempo.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type Tempo = { anos?: number; meses?: number; dias?: number }`; `dias(t: Tempo | null | undefined): number`; `fmtDias(n: number | null | undefined): string`; `diasCorridos(de: Date | null, ate: Date | null): number`.

- [ ] **Step 1: Instalar as dependências**

```bash
pnpm install
```

Esperado: termina sem erro e cria `node_modules/`.

- [ ] **Step 2: Criar o stub do `server-only`**

```ts
// tests/__mocks__/server-only.ts
// O pacote `server-only` existe para quebrar o build quando um módulo de servidor
// é importado pelo cliente. Sob teste isso não se aplica: o alias do vitest.config.ts
// aponta para este arquivo vazio de propósito.
export {}
```

- [ ] **Step 3: Confirmar que a suíte roda vazia**

```bash
pnpm test
```

Esperado: PASS, "No test files found" — o `passWithNoTests: true` deixa isso verde.

- [ ] **Step 4: Ler o original antes de portar**

```bash
sed -n '17,66p' validacao/2025/engine.js
```

Você vai ver `dias()`, `sn()`, `parseData()`, `diffDiasReais()` e `fmtDias()`. **Porte `dias`,
`fmtDias` e `diffDiasReais` (renomeada `diasCorridos`) exatamente como estão**, inclusive as
normalizações que parecerem estranhas — elas reproduzem a planilha. `sn()` e `parseData()` são
do motor e ficam para a Task 6.

- [ ] **Step 5: Escrever os testes que falham**

```ts
// tests/indulto-comutacao/tempo.spec.ts
import { describe, it, expect } from 'vitest'
import { dias, fmtDias, diasCorridos } from '@/lib/indulto-comutacao/tempo'

describe('dias() — convenção 30/360', () => {
  it('converte anos, meses e dias em dias', () => {
    expect(dias({ anos: 1, meses: 0, dias: 0 })).toBe(360)
    expect(dias({ anos: 0, meses: 1, dias: 0 })).toBe(30)
    expect(dias({ anos: 0, meses: 0, dias: 1 })).toBe(1)
    expect(dias({ anos: 2, meses: 6, dias: 15 })).toBe(915)
  })

  it('trata ausência, nulo e campo faltante como zero', () => {
    expect(dias(null)).toBe(0)
    expect(dias(undefined)).toBe(0)
    expect(dias({} as never)).toBe(0)
    expect(dias({ anos: 0, meses: 0, dias: 0 })).toBe(0)
  })

  it('aceita número em string, como vem de um input', () => {
    expect(dias({ anos: '1', meses: '2', dias: '3' } as never)).toBe(423)
  })
})

describe('fmtDias() — o formato da planilha', () => {
  it('sempre traz as três casas, inclusive as zeradas', () => {
    // A POC nunca omite casas: o advogado lê sempre no mesmo formato.
    expect(fmtDias(915)).toBe('2 anos 6 meses 15 dias')
    expect(fmtDias(360)).toBe('1 anos 0 meses 0 dias')
    expect(fmtDias(0)).toBe('0 anos 0 meses 0 dias')
  })

  it('normaliza 30 dias em um mês e 12 meses em um ano', () => {
    // Sem a normalização, um arredondamento produziria "0 anos 0 meses 30 dias".
    expect(fmtDias(359.6)).toBe('1 anos 0 meses 0 dias')
  })

  it('devolve travessão quando não há valor', () => {
    // A planilha devolvia #VALUE! aqui (bug L145:L149, corrigido no porte).
    expect(fmtDias(null)).toBe('-')
    expect(fmtDias(undefined)).toBe('-')
    expect(fmtDias(Number.NaN)).toBe('-')
  })

  it('devolve travessão para valor não-numérico vindo do banco', () => {
    // O resultado é gravado em jsonb e volta sem garantia de tipo. Com
    // `Number.isNaN` no lugar de `isNaN`, isto devolveria "NaN anos NaN meses
    // NaN dias" — este teste é o que impede a "modernização".
    expect(fmtDias('abc' as never)).toBe('-')
    expect(fmtDias({} as never)).toBe('-')
  })

  it('prefixa o negativo', () => {
    expect(fmtDias(-30)).toBe('- 0 anos 1 meses 0 dias')
  })
})

describe('diasCorridos() — calendário real', () => {
  it('conta dias de calendário, não 30/360', () => {
    // 2025 tem 365 dias; na convenção 30/360 daria 360.
    expect(diasCorridos(new Date(2024, 11, 25), new Date(2025, 11, 25))).toBe(365)
  })

  it('inclui o dia extra de ano bissexto', () => {
    expect(diasCorridos(new Date(2024, 1, 28), new Date(2024, 2, 1))).toBe(2)
  })

  it('arredonda o resto de horário de verão em vez de truncar', () => {
    // O engine usa Math.round: uma diferença de 0,96 dia vira 1, não 0.
    const de = new Date(2025, 0, 1, 0, 0, 0)
    const ate = new Date(2025, 0, 1, 23, 0, 0)
    expect(diasCorridos(de, ate)).toBe(1)
  })

  it('devolve zero quando falta uma das datas', () => {
    expect(diasCorridos(null, new Date(2025, 11, 25))).toBe(0)
    expect(diasCorridos(new Date(2025, 11, 25), null)).toBe(0)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

```bash
pnpm test
```

Esperado: FAIL — `Cannot find module '@/lib/indulto-comutacao/tempo'`.

- [ ] **Step 7: Implementar `tempo.ts`**

```ts
// src/lib/indulto-comutacao/tempo.ts
//
// As duas convenções de contagem da planilha do GPS da Pena, portadas de
// validacao/2025/engine.js (linhas 17-66).
//
// Este arquivo é compartilhado por TODOS os decretos: não coloque aqui nada que
// dependa de um decreto específico.

export type Tempo = { anos?: number; meses?: number; dias?: number }

const DIA_ANO = 360
const DIA_MES = 30

/**
 * Sistema A — 30 dias por mês, 360 por ano.
 *
 * Não é contagem de calendário: é a convenção usada em todo cálculo de fração de
 * pena. Aceita número em string porque é o que vem de um `<input>`.
 */
export function dias(t: Tempo | null | undefined): number {
  if (!t) return 0
  const a = Number(t.anos) || 0
  const m = Number(t.meses) || 0
  const d = Number(t.dias) || 0
  return d + m * DIA_MES + a * DIA_ANO
}

/**
 * Formata dias (base 360) em "X anos Y meses Z dias".
 *
 * Traz sempre as três casas, inclusive zeradas — é o formato da POC, e mudá-lo
 * mudaria o que o advogado está acostumado a ler na planilha.
 */
export function fmtDias(nDias: number | null | undefined): string {
  // `null` é ausência de valor: a planilha devolvia #VALUE! (bug L145:L149).
  //
  // 🔴 `isNaN`, não `Number.isNaN`. Parece modernização inofensiva e não é: este
  // valor volta do banco em coluna jsonb, sem garantia de tipo em runtime. O
  // `Number.isNaN` deixaria um não-número atravessar a guarda e a função
  // devolveria "NaN anos NaN meses NaN dias" — numa tela que vira petição.
  if (nDias === null || nDias === undefined || isNaN(nDias)) return '-'

  const neg = nDias < 0
  const n = Math.abs(nDias)
  let anos = Math.floor(n / DIA_ANO)
  const resto = n - anos * DIA_ANO
  let meses = Math.floor(resto / DIA_MES)
  let d = Math.round(resto - meses * DIA_MES)

  // As duas normalizações existem por causa do arredondamento acima: sem elas,
  // 359,6 dias sairia como "0 anos 11 meses 30 dias".
  if (d === 30) { d = 0; meses += 1 }
  if (meses === 12) { meses = 0; anos += 1 }

  return `${neg ? '- ' : ''}${anos} anos ${meses} meses ${d} dias`
}

/**
 * Sistema B — dias de calendário reais.
 *
 * Existe para as regras que exigem cumprimento ininterrupto contado em tempo
 * corrido, e só para elas: em qualquer cálculo de FRAÇÃO DE PENA a convenção
 * correta é a 30/360 de `dias()`.
 *
 * Qual regra a usa é decisão de cada decreto — no Decreto 12.970/2025 é o
 * inciso IV do Art. 9º, e só ele.
 */
export function diasCorridos(de: Date | null, ate: Date | null): number {
  if (!de || !ate) return 0
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000)
}
```

- [ ] **Step 8: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS — todos os testes do arquivo acima, verdes. (Não confira por número: conte
os `it()` do Step 5, não uma contagem escrita aqui.)

- [ ] **Step 9: Commit**

```bash
git add tests/__mocks__/server-only.ts tests/indulto-comutacao/tempo.spec.ts src/lib/indulto-comutacao/tempo.ts
git commit -m "Adiciona as convenções de tempo da calculadora

Porte literal de validacao/2025/engine.js: 30/360 para fração de pena e
calendário real para o inciso IV. fmtDias mantém as três casas sempre e as
duas normalizações de arredondamento — é o formato que a planilha produz."
```

---

### Task 2: Os contratos

Os tipos que todos os motores cumprem. Nenhuma regra jurídica — só forma.

**Files:**
- Create: `src/lib/indulto-comutacao/tipos.ts`
- Test: `tests/indulto-comutacao/tipos.spec.ts`

**Interfaces:**
- Consumes: `Tempo` de `tempo.ts`.
- Produces: `Entrada`, `VEREDITOS`, `Veredito`, `ehVeredito()`, `ResultadoInciso`, `Resumo`, `Resultado`, `MetaInciso`, `Campo`, `Secao`, `MotorDecreto`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/indulto-comutacao/tipos.spec.ts
import { describe, it, expect } from 'vitest'
import { VEREDITOS, ehVeredito } from '@/lib/indulto-comutacao/tipos'

describe('VEREDITOS', () => {
  it('traz os quatro estados do decreto, com o rótulo que a POC exibia', () => {
    expect(Object.keys(VEREDITOS).sort()).toEqual(
      ['a_analisar', 'nao_preenche', 'preenche', 'sem_previsao'].sort(),
    )
    expect(VEREDITOS.preenche).toBe('Preenche os requisitos')
    expect(VEREDITOS.nao_preenche).toBe('Não preenche os requisitos')
    expect(VEREDITOS.a_analisar).toBe('A analisar')
    expect(VEREDITOS.sem_previsao).toBe('Sem previsão no Decreto')
  })
})

describe('ehVeredito()', () => {
  it('aceita os quatro e recusa o resto', () => {
    expect(ehVeredito('preenche')).toBe(true)
    expect(ehVeredito('sem_previsao')).toBe(true)
    expect(ehVeredito('talvez')).toBe(false)
    expect(ehVeredito('Preenche os requisitos')).toBe(false)
    expect(ehVeredito(null)).toBe(false)
    expect(ehVeredito(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test tipos
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `tipos.ts`**

```ts
// src/lib/indulto-comutacao/tipos.ts
//
// Os contratos que TODO motor de decreto cumpre. Forma, nunca regra: nada aqui
// pode depender de um decreto específico.

import type { Tempo } from './tempo'

export type { Tempo }

/**
 * As respostas do questionário, como objeto plano.
 *
 * As CHAVES são definidas por cada decreto, porque o questionário de um ano não
 * serve para outro sem revisão. O tipo é aberto de propósito; quem garante a
 * correspondência entre chave e motor é o teste de reconciliação da Task 6.
 */
export type Entrada = Record<string, string | number | Tempo | null | undefined>

/**
 * Os quatro estados, com o rótulo que a POC exibia.
 *
 * O motor devolve a CHAVE; a tela resolve o rótulo aqui. O engine.js original
 * devolvia a string pronta — a tradução para código é o que dá type-safety à UI
 * sem tocar nas condições de cada inciso.
 */
export const VEREDITOS = {
  preenche: 'Preenche os requisitos',
  nao_preenche: 'Não preenche os requisitos',
  a_analisar: 'A analisar',
  sem_previsao: 'Sem previsão no Decreto',
} as const

export type Veredito = keyof typeof VEREDITOS

export function ehVeredito(v: unknown): v is Veredito {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VEREDITOS, v)
}

/**
 * O resultado de um dispositivo.
 *
 * `geral` e `especial` são vereditos INDEPENDENTES: além da regra cheia, um
 * decreto pode prever uma regra especial, de fração menor, para quem se enquadra
 * num perfil de vulnerabilidade. Em que parágrafo ela vive, e a quais
 * dispositivos se aplica, é decisão de cada decreto — onde não houver previsão,
 * `especial` é 'sem_previsao', que é diferente de 'nao_preenche'.
 *
 * `quantum` e `penaApos` só aparecem nos dispositivos de comutação. `null`
 * significa ausência de valor — a planilha devolvia #VALUE! (bug L145:L149).
 */
export type ResultadoInciso = {
  id: string
  geral: Veredito
  especial: Veredito
  quantum?: number | null
  penaApos?: number | null
}

/** O painel de contexto que abre a tela de resultado. Tudo em dias (30/360). */
export type Resumo = {
  totalImposto: number
  totalCumprido: number
  /** min(total cumprido, 2/3 do impeditivo) — o que conta para os impeditivos. */
  penaCumpridaImpeditivos: number
  remanescente: number
  fracoes: {
    doisTercosImpeditivos: number
    umQuinto: number
    umQuarto: number
    umTerco: number
    metade: number
  }
}

export type Resultado = {
  /** Na ordem em que o motor os produz — a mesma da planilha. */
  incisos: ResultadoInciso[]
  resumo: Resumo
  avisos: string[]
}

/** O que a tela precisa para desenhar o cartão de um dispositivo. */
export type MetaInciso = {
  id: string
  rotulo: string
  descricao: string
  temRegraEspecial: boolean
}

export type Campo =
  | { tipo: 'texto'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'numero'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'data'; chave: string; rotulo: string; ajuda?: string }
  | { tipo: 'tempo'; chave: string; rotulo: string; ajuda?: string }
  | {
      tipo: 'selecao'
      chave: string
      rotulo: string
      opcoes: readonly string[]
      /** Quando ausente, o padrão é 'NÃO' se estiver nas opções, senão a primeira. */
      padrao?: string
      ajuda?: string
    }

export type Secao = {
  id: string
  titulo: string
  /** Texto de alerta da seção. No questionário de 2025, só a da data do fato tem. */
  aviso?: string
  descricao?: string
  campos: Campo[]
}

export type MotorDecreto = {
  id: string
  ano: number
  rotulo: string
  versao: string
  /** Data-base do decreto, `YYYY-MM-DD`. Nunca uma constante global. */
  dataBase: string
  questionario: Secao[]
  incisos: { indulto: MetaInciso[]; comutacao: MetaInciso[] }
  avisos: { fixos: string[]; validarJuridicamente: string[] }
  calcular(entrada: Entrada): Resultado
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS — a suíte inteira verde, incluindo o que a Task 1 já deixou passando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/tipos.ts tests/indulto-comutacao/tipos.spec.ts
git commit -m "Adiciona os contratos dos motores de decreto

Forma, nunca regra. O veredito vira código tipado e a tela resolve o rótulo:
o engine.js devolvia a string pronta, e a tradução dá type-safety à UI sem
tocar nas condições de cada inciso."
```

---

### Task 3: O registro de motores

O ponto onde um decreto novo é plugado. Array de imports estáticos: varredura de diretório não
sobrevive ao bundler do Next.

**Files:**
- Create: `src/lib/indulto-comutacao/registro.ts`
- Create: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/registro.spec.ts`

**Interfaces:**
- Consumes: `MotorDecreto` de `tipos.ts`.
- Produces: `REGISTRO: readonly MotorDecreto[]`; `motorPorId(id: string): MotorDecreto | null`; `motorPadrao(): MotorDecreto`; `motor2025` (esqueleto que as Tasks 4-6 preenchem).

- [ ] **Step 1: Escrever o teste que falha**

O contrato roda sobre **todo** motor do registro — é ele que protege a entrada de 2024 e 2026.

```ts
// tests/indulto-comutacao/registro.spec.ts
import { describe, it, expect } from 'vitest'
import { REGISTRO, motorPorId, motorPadrao } from '@/lib/indulto-comutacao/registro'
import { ehVeredito } from '@/lib/indulto-comutacao/tipos'

describe('REGISTRO', () => {
  it('não está vazio', () => {
    expect(REGISTRO.length).toBeGreaterThan(0)
  })

  it('não repete id', () => {
    const ids = REGISTRO.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('vem ordenado do mais recente para o mais antigo', () => {
    const anos = REGISTRO.map((m) => m.ano)
    expect([...anos].sort((a, b) => b - a)).toEqual(anos)
  })
})

describe.each(REGISTRO.map((m) => [m.id, m] as const))('contrato — %s', (_id, motor) => {
  it('preenche a identificação', () => {
    expect(motor.id).toMatch(/^indulto-comutacao-\d{4}$/)
    expect(motor.ano).toBeGreaterThan(2000)
    expect(motor.rotulo.length).toBeGreaterThan(0)
    expect(motor.versao).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('tem data-base no formato de data e no próprio ano', () => {
    expect(motor.dataBase).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(motor.dataBase.startsWith(String(motor.ano))).toBe(true)
  })

  it('tem questionário com seções e campos, sem chave repetida', () => {
    expect(motor.questionario.length).toBeGreaterThan(0)
    const chaves: string[] = []
    for (const secao of motor.questionario) {
      expect(secao.campos.length).toBeGreaterThan(0)
      for (const campo of secao.campos) chaves.push(campo.chave)
    }
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('tem metadados de inciso sem id repetido', () => {
    const ids = [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sempre exibe os pontos a validar juridicamente', () => {
    expect(motor.avisos.validarJuridicamente.length).toBeGreaterThan(0)
    expect(motor.avisos.fixos.length).toBeGreaterThan(0)
  })

  it('calcula com entrada vazia sem lançar, e só devolve veredito válido', () => {
    const r = motor.calcular({})
    expect(r.incisos.length).toBeGreaterThan(0)
    for (const inciso of r.incisos) {
      expect(ehVeredito(inciso.geral), `${inciso.id}.geral`).toBe(true)
      expect(ehVeredito(inciso.especial), `${inciso.id}.especial`).toBe(true)
    }
  })

  it('cobre com metadado todo inciso que o cálculo devolve, e vice-versa', () => {
    const devolvidos = motor.calcular({}).incisos.map((i) => i.id)
    const comMeta = [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id)
    expect(devolvidos.filter((id) => !comMeta.includes(id))).toEqual([])
    expect(comMeta.filter((id) => !devolvidos.includes(id))).toEqual([])
  })
})

describe('motorPorId()', () => {
  it('acha o que existe e devolve null para o resto', () => {
    expect(motorPorId(REGISTRO[0].id)?.id).toBe(REGISTRO[0].id)
    expect(motorPorId('indulto-comutacao-1988')).toBeNull()
    expect(motorPorId('')).toBeNull()
  })
})

describe('motorPadrao()', () => {
  it('é o mais recente do registro', () => {
    expect(motorPadrao().id).toBe(REGISTRO[0].id)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test registro
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar o esqueleto do motor de 2025**

As Tasks 4, 5 e 6 preenchem este arquivo. Aqui ele existe para o registro ter o que registrar.
O esqueleto declara **um** inciso com metadado e o devolve no `calcular` — é o mínimo que
satisfaz o contrato nos dois sentidos.

```ts
// src/lib/indulto-comutacao/motores/2025/index.ts
import type { MotorDecreto } from '../../tipos'

/**
 * Decreto nº 12.970/2025 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 *
 * ⚠️ ESQUELETO. As Tasks 4, 5 e 6 substituem questionario, incisos, avisos e
 * calcular pelos transcritos de validacao/2025/.
 */
export const motor2025: MotorDecreto = {
  id: 'indulto-comutacao-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '0.1.0',
  dataBase: '2025-12-25',
  questionario: [
    {
      id: 'identificacao',
      titulo: 'Identificação',
      campos: [{ tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' }],
    },
  ],
  incisos: {
    indulto: [
      {
        id: 'art9_I',
        rotulo: 'Art. 9º, I',
        descricao: 'Pena ≤ 8 anos, sem violência: 1/5 (não reinc.) ou 1/3 (reinc.).',
        temRegraEspecial: true,
      },
    ],
    comutacao: [],
  },
  avisos: {
    fixos: ['Esta ferramenta não dispensa conhecimento técnico sobre o assunto.'],
    validarJuridicamente: [
      'A "pena após a comutação" usa a pena total imposta como base (fórmula original).',
    ],
  },
  calcular() {
    return {
      incisos: [{ id: 'art9_I', geral: 'nao_preenche', especial: 'nao_preenche' }],
      resumo: {
        totalImposto: 0,
        totalCumprido: 0,
        penaCumpridaImpeditivos: 0,
        remanescente: 0,
        fracoes: {
          doisTercosImpeditivos: 0,
          umQuinto: 0,
          umQuarto: 0,
          umTerco: 0,
          metade: 0,
        },
      },
      avisos: [],
    }
  },
}
```

- [ ] **Step 4: Implementar o registro**

```ts
// src/lib/indulto-comutacao/registro.ts
//
// O ponto onde um decreto novo é plugado.
//
// 🔴 IMPORTS ESTÁTICOS, sempre. Varredura de diretório não sobrevive ao bundler
// do Next: o motor some do build sem erro. Para acrescentar 2024 ou 2026, crie a
// pasta em motores/ e acrescente UMA linha no array abaixo.
//
// A ordem importa: do decreto mais recente para o mais antigo, e motorPadrao()
// devolve o primeiro.

import type { MotorDecreto } from './tipos'
import { motor2025 } from './motores/2025'

export const REGISTRO: readonly MotorDecreto[] = [motor2025]

export function motorPorId(id: string): MotorDecreto | null {
  return REGISTRO.find((m) => m.id === id) ?? null
}

export function motorPadrao(): MotorDecreto {
  return REGISTRO[0]
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/registro.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/registro.spec.ts
git commit -m "Adiciona o registro de motores por decreto

Array de imports estáticos — varredura de diretório não sobrevive ao bundler
do Next. O teste de contrato roda sobre todo motor registrado, nos dois
sentidos: é ele que protege 2025 quando 2024 e 2026 entrarem."
```

---

### Task 4: O questionário de 2025

**Transcrição** do `SECOES` de `validacao/2025/ui.js` (linhas 9-95). Não invente campo, rótulo
nem opção: cada um vem de lá, e as chaves são as que o motor lê por nome.

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/questionario.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/questionario-2025.spec.ts`

**Interfaces:**
- Consumes: `Secao`, `Campo` de `tipos.ts`.
- Produces: `QUESTIONARIO_2025: Secao[]` (12 seções); `padraoDoCampo(campo: Campo): string` — a regra de default do `ui.js`.

- [ ] **Step 1: Ler o original**

```bash
sed -n '5,96p' validacao/2025/ui.js
sed -n '140,146p' validacao/2025/ui.js   # a função defaultFor
```

Transcreva **todos** os campos, com os rótulos exatos. Mapeamento de tipo:
`text`→`texto`, `tempo`→`tempo`, `select`→`selecao`, `date`→`data`, `number`→`numero`;
`k`→`chave`, `label`→`rotulo`, `opcoes`→`opcoes`, `def`→`padrao`, `hint` da seção→`aviso`.

Dê a cada seção um `id` em kebab-case derivado do título: `identificacao`, `penas-impostas`,
`pena-cumprida`, `perfil`, `regime-situacao`, `educacao-trabalho`, `pessoais-familiares`,
`historico-vedacoes`, `aberto-restritiva`, `patrimonio-multa`, `data-do-fato`, `observacoes`.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/indulto-comutacao/questionario-2025.spec.ts
import { describe, it, expect } from 'vitest'
import {
  QUESTIONARIO_2025,
  padraoDoCampo,
} from '@/lib/indulto-comutacao/motores/2025/questionario'

const campos = QUESTIONARIO_2025.flatMap((s) => s.campos)
const porChave = new Map(campos.map((c) => [c.chave, c]))

describe('QUESTIONARIO_2025', () => {
  it('traz as 12 seções do decreto, na ordem da POC', () => {
    expect(QUESTIONARIO_2025.map((s) => s.id)).toEqual([
      'identificacao',
      'penas-impostas',
      'pena-cumprida',
      'perfil',
      'regime-situacao',
      'educacao-trabalho',
      'pessoais-familiares',
      'historico-vedacoes',
      'aberto-restritiva',
      'patrimonio-multa',
      'data-do-fato',
      'observacoes',
    ])
  })

  it('usa as chaves que o motor lê, não nomes reescritos', () => {
    // O motor lê por nome: `penaViolencia`, nunca `penaComViolencia`.
    for (const chave of [
      'penaImpeditiva', 'penaViolencia', 'penaSemViolencia',
      'penaCumpridaSEEU', 'penaCumpridaNaoSEEU',
      'dataNascimento', 'dataUltimaPrisao', 'diasRemicao',
      'faccao', 'estudo', 'monitoramentoSV56', 'programaEgressos',
      'cumpriu23ImpeditivoDataFato', 'cumpriuFracaoViolenciaDataFato',
    ]) {
      expect(porChave.has(chave), `faltou a chave ${chave}`).toBe(true)
    }
  })

  it('separa as penas nas três categorias, todas como tempo', () => {
    expect(porChave.get('penaImpeditiva')?.tipo).toBe('tempo')
    expect(porChave.get('penaViolencia')?.tipo).toBe('tempo')
    expect(porChave.get('penaSemViolencia')?.tipo).toBe('tempo')
  })

  it('faz os dois vetos da data do fato nascerem em SIM', () => {
    // Responder NÃO bloqueia indulto E comutação inteiros. Se o padrão fosse NÃO,
    // todo cálculo começaria zerado sem o advogado entender por quê.
    expect(padraoDoCampo(porChave.get('cumpriu23ImpeditivoDataFato')!)).toBe('SIM')
    expect(padraoDoCampo(porChave.get('cumpriuFracaoViolenciaDataFato')!)).toBe('SIM')
  })

  it('avisa na seção da data do fato', () => {
    const secao = QUESTIONARIO_2025.find((s) => s.id === 'data-do-fato')
    expect(secao?.aviso).toMatch(/bloqueia/i)
  })

  it('faz os demais SIM/NÃO nascerem em NÃO', () => {
    // A regra do ui.js: `def` > 'NÃO' se estiver nas opções > primeira opção.
    expect(padraoDoCampo(porChave.get('reincidente')!)).toBe('NÃO')
    expect(padraoDoCampo(porChave.get('faccao')!)).toBe('NÃO')
    expect(padraoDoCampo(porChave.get('estudo')!)).toBe('NÃO')
  })

  it('faz a seleção sem NÃO cair na primeira opção', () => {
    expect(padraoDoCampo(porChave.get('sexo')!)).toBe('MASCULINO')
    expect(padraoDoCampo(porChave.get('regime')!)).toBe('FECHADO')
  })

  it('deixa em branco o que não é seleção', () => {
    expect(padraoDoCampo(porChave.get('sentenciado')!)).toBe('')
    expect(padraoDoCampo(porChave.get('penaImpeditiva')!)).toBe('')
  })

  it('toda seleção declara opções, e o padrão declarado está entre elas', () => {
    for (const campo of campos) {
      if (campo.tipo !== 'selecao') continue
      expect(campo.opcoes.length).toBeGreaterThan(0)
      if (campo.padrao !== undefined) expect(campo.opcoes).toContain(campo.padrao)
    }
  })

  it('não repete chave entre seções e dá rótulo a todo campo', () => {
    const chaves = campos.map((c) => c.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const campo of campos) expect(campo.rotulo.trim().length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
pnpm test questionario
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 4: Transcrever o questionário**

Estrutura do arquivo (o corpo do array vem do `ui.js`):

```ts
// src/lib/indulto-comutacao/motores/2025/questionario.ts
//
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

import type { Campo, Secao } from '../../tipos'

const SN = ['SIM', 'NÃO'] as const
const SNA = ['SIM', 'NÃO', 'NÃO SE APLICA'] as const

export const QUESTIONARIO_2025: Secao[] = [
  // … as 12 seções, transcritas de ui.js
]

/**
 * O valor com que um campo nasce, pela mesma regra do ui.js (defaultFor):
 * o `padrao` declarado, senão 'NÃO' quando estiver entre as opções, senão a
 * primeira opção. Campo que não é seleção nasce vazio.
 *
 * 🔴 A regra importa além dos dois vetos: com ela, todo SIM/NÃO nasce em 'NÃO',
 * que é o estado neutro que a POC calculava.
 */
export function padraoDoCampo(campo: Campo): string {
  if (campo.tipo !== 'selecao') return ''
  if (campo.padrao) return campo.padrao
  if (campo.opcoes.includes('NÃO')) return 'NÃO'
  return campo.opcoes[0] ?? ''
}
```

- [ ] **Step 5: Ligar ao motor**

Em `index.ts`, importe `QUESTIONARIO_2025` e substitua a propriedade `questionario` inteira por
`questionario: QUESTIONARIO_2025,`.

- [ ] **Step 6: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/questionario.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/questionario-2025.spec.ts
git commit -m "Transcreve o questionário do Decreto 12.970/2025

As 12 seções do ui.js da POC, com as chaves que o motor lê por nome. A regra
de default vem junto: os dois campos da data do fato nascem em SIM porque são
veto total, e todo o resto dos SIM/NÃO nasce em NÃO."
```

---

### Task 5: Os metadados dos incisos e os avisos

**Transcrição** de `INCISOS_INDULTO`, `INCISOS_COMUT` e `NOTAS` de `validacao/2025/ui.js`
(linhas 97-133), mais os dois avisos de ambiguidade de `validacao/2025/engine.js`.

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/incisos.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/incisos-2025.spec.ts`

**Interfaces:**
- Consumes: `MetaInciso` de `tipos.ts`.
- Produces: `INCISOS_INDULTO_2025: MetaInciso[]` (18), `INCISOS_COMUTACAO_2025: MetaInciso[]` (5), `AVISOS_2025: { fixos: string[]; validarJuridicamente: string[] }`.

- [ ] **Step 1: Ler o original**

```bash
sed -n '97,134p' validacao/2025/ui.js          # INCISOS_INDULTO, INCISOS_COMUT, NOTAS
grep -n "var avisos" -A 4 validacao/2025/engine.js   # as duas ambiguidades
```

Cada tripla `['id', 'rótulo', 'descrição']` vira um `MetaInciso`. O `temRegraEspecial` sai do
próprio `engine.js`: é `false` exatamente onde ele escreve
`especial: 'Sem previsão no Decreto'`.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/indulto-comutacao/incisos-2025.spec.ts
import { describe, it, expect } from 'vitest'
import {
  INCISOS_INDULTO_2025,
  INCISOS_COMUTACAO_2025,
  AVISOS_2025,
} from '@/lib/indulto-comutacao/motores/2025/incisos'

describe('incisos de indulto', () => {
  it('traz os 16 do Art. 9º mais o Art. 10 e o Art. 12, na ordem da POC', () => {
    expect(INCISOS_INDULTO_2025.map((i) => i.id)).toEqual([
      'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
      'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
      'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
  })

  it('marca sem regra especial exatamente onde o engine diz "Sem previsão"', () => {
    const semEspecial = new Set([
      'art9_XII', 'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
    for (const meta of INCISOS_INDULTO_2025) {
      expect(meta.temRegraEspecial, meta.id).toBe(!semEspecial.has(meta.id))
    }
  })

  it('descreve o XVI como condição de saúde, não como regime', () => {
    // Guarda contra a descrição errada: o XVI é condição pessoal grave.
    const xvi = INCISOS_INDULTO_2025.find((i) => i.id === 'art9_XVI')
    expect(xvi?.descricao).toMatch(/saúde|deficiência/i)
  })
})

describe('incisos de comutação', () => {
  it('traz os três do Art. 11, o Art. 13 e o Art. 13 §4º', () => {
    expect(INCISOS_COMUTACAO_2025.map((i) => i.id)).toEqual([
      'art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4',
    ])
  })

  it('não tem regra especial em nenhum deles', () => {
    for (const meta of INCISOS_COMUTACAO_2025) {
      expect(meta.temRegraEspecial, meta.id).toBe(false)
    }
  })
})

describe('avisos', () => {
  it('traz as duas ambiguidades jurídicas do engine', () => {
    expect(AVISOS_2025.validarJuridicamente).toHaveLength(2)
    const texto = AVISOS_2025.validarJuridicamente.join(' ')
    expect(texto).toMatch(/pena total imposta/i)
    expect(texto).toMatch(/remanescente/i)
  })

  it('traz as quatro notas fixas da POC', () => {
    expect(AVISOS_2025.fixos).toHaveLength(4)
    expect(AVISOS_2025.fixos.join(' ')).toMatch(/impeditivos/i)
  })

  it('dá rótulo e descrição a todo inciso', () => {
    for (const meta of [...INCISOS_INDULTO_2025, ...INCISOS_COMUTACAO_2025]) {
      expect(meta.rotulo.trim().length, meta.id).toBeGreaterThan(0)
      expect(meta.descricao.trim().length, meta.id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
pnpm test incisos
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 4: Transcrever os metadados**

```ts
// src/lib/indulto-comutacao/motores/2025/incisos.ts
//
// O que a tela mostra em cada cartão do Decreto 12.970/2025, transcrito de
// validacao/2025/ui.js (INCISOS_INDULTO, INCISOS_COMUT e NOTAS).
//
// `temRegraEspecial: false` significa que o §2º NÃO TEM PREVISÃO para aquele
// dispositivo — a tela mostra "Sem previsão no Decreto", que é diferente de
// "não preenche os requisitos". O valor sai do engine.js: é false exatamente
// onde ele escreve `especial: 'Sem previsão no Decreto'`.

import type { MetaInciso } from '../../tipos'

export const INCISOS_INDULTO_2025: MetaInciso[] = [
  // … os 18, transcritos de ui.js
]

export const INCISOS_COMUTACAO_2025: MetaInciso[] = [
  // … os 5, transcritos de ui.js
]

export const AVISOS_2025 = {
  // NOTAS do ui.js
  fixos: [
    // … as 4
  ],
  // `avisos` do engine.js — as ambiguidades herdadas da planilha
  validarJuridicamente: [
    // … as 2
  ],
}
```

- [ ] **Step 5: Ligar ao motor**

Em `index.ts`, importe os três e substitua as propriedades `incisos` e `avisos` por:

```ts
  incisos: { indulto: INCISOS_INDULTO_2025, comutacao: INCISOS_COMUTACAO_2025 },
  avisos: AVISOS_2025,
```

- [ ] **Step 6: Rodar e ver o contrato acusar**

```bash
pnpm test
```

Esperado: **FAIL** no teste "cobre com metadado todo inciso que o cálculo devolve, e
vice-versa" — o `calcular()` esqueleto ainda devolve só `art9_I`, enquanto agora há 23
metadados. É a falha certa, e ela some na Task 6.

Para manter a suíte verde até lá, faça o esqueleto devolver os 23 ids com
`geral: 'nao_preenche'` e `especial` conforme `temRegraEspecial`:

```ts
  calcular() {
    const todos = [...INCISOS_INDULTO_2025, ...INCISOS_COMUTACAO_2025]
    return {
      incisos: todos.map((m) => ({
        id: m.id,
        geral: 'nao_preenche' as const,
        especial: (m.temRegraEspecial ? 'nao_preenche' : 'sem_previsao') as const,
      })),
      resumo: { /* … como está */ },
      avisos: [],
    }
  },
```

- [ ] **Step 7: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/incisos.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/incisos-2025.spec.ts
git commit -m "Transcreve os metadados dos incisos e os avisos de 2025

18 dispositivos de indulto e 5 de comutação, do ui.js da POC. O
temRegraEspecial sai do engine: é false exatamente onde ele escreve 'Sem
previsão no Decreto', que é diferente de não preencher requisitos."
```

---

### Task 6: Porte do motor de 2025

O coração. **Porte literal** de `validacao/2025/engine.js` (função `calcular`, linhas 68-470).

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/motor.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/reconciliacao-2025.spec.ts`

**Interfaces:**
- Consumes: `Entrada`, `Resultado`, `Veredito` de `tipos.ts`; `dias`, `diasCorridos` de `tempo.ts`; `INCISOS_*` de `incisos.ts`; `QUESTIONARIO_2025`.
- Produces: `calcular2025(entrada: Entrada): Resultado`; `CHAVES_CONSUMIDAS: readonly string[]`.

- [ ] **Step 1: Ler o original inteiro antes de escrever uma linha**

```bash
sed -n '68,470p' validacao/2025/engine.js
```

- [ ] **Step 2: Portar, bloco por bloco, sem refatorar**

Regras, em ordem de prioridade:

1. **Mesma ordem de blocos.** Penas → cumprida → datas → flags → portões → Art. 9º I..XVI → Art. 10 → Art. 12 → comutação → avisos → resumo.
2. **Mesmos nomes de variável.** `N6`, `N7`, `N8`, `N9`, `P6`…`P9`, `D6`, `E7/E8`, `F7/F8`, `G7/G8`, `H7/H8`, `I7/I8`, `J7/J8`, `N11`, `N12`, `N13`, `P13`, `P14`, `N16`, `P16`, `P17`, `D53`, `D49`, `F49`, `I18`…`I72`, `D59`, `gates4`, `gates5`, `hediondo`, `i18ok`, `i72ok`, `elegivelP`, `qOk`, `temPenaNaoImped`. Dentro de cada IIFE de inciso, mantenha `F`, `G`, `H`, `I`, `J`, `K`, `L`, `M`, `fracI`, `fracR`, `Rhalf`, `Shalf`, `geral`, `esp`.
3. **Mesmos comentários de linha da planilha:** `// Inciso I (linha 75) — …`.
4. **`sn()`, `parseData()` e `faixa()` vêm junto**, portadas literalmente. `faixa()` no original é declarada depois do uso (hoisting); em TypeScript, declare-a antes — é a única reordenação permitida, e merece um comentário dizendo por quê.
5. **`texto()` devolve o CÓDIGO do veredito**, não a string:

```ts
const texto = (ok: boolean): Veredito => (ok ? 'preenche' : 'nao_preenche')
```

O engine devolvia `'Preenche os requisitos'`. A tradução é 1:1 e a UI resolve o rótulo por
`VEREDITOS` — as condições de cada inciso ficam intocadas, que é o que a auditoria precisa.
Onde o engine escreve `especial: 'Sem previsão no Decreto'`, escreva `especial: 'sem_previsao'`.
Onde escreve `'A analisar'` (Art. 12 com multa zerada), escreva `'a_analisar'`.

6. **`incisos` sai como array**, na mesma ordem em que o engine os insere. Monte o objeto como
ele monta e converta no fim, ou empurre num array — o que ficar mais próximo do original.

7. **`resumo` sai em números**, não em strings. O engine formata com `fmtDias`; aqui devolva os
dias e deixe a tela formatar:

```ts
  const resumo = {
    totalImposto: N9,
    totalCumprido: N13,
    penaCumpridaImpeditivos: N13 < D6 ? N13 : D6,   // mesmo min() do engine
    remanescente: N16,
    fracoes: {
      doisTercosImpeditivos: D6,
      umQuinto: (N7 + N8) / 5,
      umQuarto: (N7 + N8) / 4,
      umTerco: (N7 + N8) / 3,
      metade: (N7 + N8) / 2,
    },
  }
```

8. **Os dois bugs corrigidos ganham comentário**, no formato:

```ts
// ⚠️ BUG DA PLANILHA, CORRIGIDO AQUI — G149
// A fórmula da planilha referenciava F148 (a condição do Art. 13 comum) em vez
// de F149, exibindo a comutação do §4º sem os requisitos do §4º preenchidos.
```

9. **As duas ambiguidades ganham comentário**, no formato:

```ts
// ⚖️ AMBIGUIDADE JURÍDICA PRESERVADA — não "conserte"
// A base do desconto é a pena TOTAL imposta (P9), não a remanescente. Herdado da
// planilha de propósito e exibido ao advogado em "Pontos a validar
// juridicamente". Mudar isto sem validação dos autores do método altera um número
// que vai para petição.
```

10. **`CHAVES_CONSUMIDAS`** lista toda chave de `input` que o motor lê. Extraia com:

```bash
grep -o 'input\.[A-Za-z0-9_]*' validacao/2025/engine.js | sort -u
```

```ts
/**
 * Toda chave de `Entrada` que este motor consome.
 *
 * Existe para o teste de reconciliação: uma chave que o questionário coleta e o
 * motor ignora é pergunta inútil na tela; uma que o motor lê e o questionário não
 * coleta é cálculo que silenciosamente usa `undefined`.
 */
export const CHAVES_CONSUMIDAS = [/* … */] as const
```

- [ ] **Step 3: Escrever o teste de reconciliação**

```ts
// tests/indulto-comutacao/reconciliacao-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { CHAVES_CONSUMIDAS } from '@/lib/indulto-comutacao/motores/2025/motor'
import { QUESTIONARIO_2025 } from '@/lib/indulto-comutacao/motores/2025/questionario'

// Campos que existem só para o advogado reconhecer o caso — nunca entram no cálculo.
const SO_DOCUMENTAL = new Set(['sentenciado', 'execucao', 'unidade', 'observacoes'])

const coletadas = new Set(QUESTIONARIO_2025.flatMap((s) => s.campos.map((c) => c.chave)))

describe('reconciliação entre questionário e motor', () => {
  it('não coleta pergunta que o motor ignora', () => {
    const orfas = [...coletadas].filter(
      (c) => !SO_DOCUMENTAL.has(c) && !CHAVES_CONSUMIDAS.includes(c as never),
    )
    expect(orfas, `perguntas sem uso no motor: ${orfas.join(', ')}`).toEqual([])
  })

  it('não lê chave que o questionário não coleta', () => {
    const faltantes = CHAVES_CONSUMIDAS.filter((c) => !coletadas.has(c))
    expect(faltantes, `o motor lê o que ninguém pergunta: ${faltantes.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 4: Comparar contra o engine original, cenário a cenário**

Antes de ligar o motor, prove que ele bate com o JS de origem. Este script roda os dois e
compara:

```bash
cat > /tmp/comparar.mjs <<'EOF'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const original = require(process.cwd() + '/validacao/2025/engine.js')
const { calcular2025 } = await import(process.cwd() + '/src/lib/indulto-comutacao/motores/2025/motor.ts')

const ROTULO = {
  preenche: 'Preenche os requisitos',
  nao_preenche: 'Não preenche os requisitos',
  a_analisar: 'A analisar',
  sem_previsao: 'Sem previsão no Decreto',
}

const cenarios = JSON.parse(readFileSync('validacao/2025/cenarios.json', 'utf8'))
let divergencias = 0
for (const c of cenarios) {
  const a = original.calcular(c)
  const b = calcular2025(c)
  for (const inciso of b.incisos) {
    const orig = a.incisos[inciso.id]
    if (!orig) { console.log(`${c._nome}: ${inciso.id} não existe no original`); divergencias++; continue }
    const gOrig = orig.geral ?? orig.situacao
    if (ROTULO[inciso.geral] !== gOrig) {
      console.log(`${c._nome} · ${inciso.id}.geral: original="${gOrig}" porte="${ROTULO[inciso.geral]}"`)
      divergencias++
    }
    if (orig.especial !== undefined && ROTULO[inciso.especial] !== orig.especial) {
      console.log(`${c._nome} · ${inciso.id}.especial: original="${orig.especial}" porte="${ROTULO[inciso.especial]}"`)
      divergencias++
    }
  }
}
console.log(divergencias === 0 ? '✓ 0 divergências contra o engine.js' : `✗ ${divergencias} divergências`)
process.exit(divergencias === 0 ? 0 : 1)
EOF
pnpm exec tsx /tmp/comparar.mjs 2>/dev/null || pnpm exec vite-node /tmp/comparar.mjs
```

Se nenhum runner de TypeScript estiver disponível, escreva a comparação como um `.spec.ts` em
`tests/indulto-comutacao/paridade-engine.spec.ts` com a mesma lógica — o Vitest já resolve o
TypeScript e o alias `@`, e o teste vale mais como regressão permanente do que como script
descartável. **Prefira esta forma.**

**Portão: zero divergências.** Enquanto houver uma, o porte está errado — corrija o `motor.ts`,
nunca o original.

- [ ] **Step 5: Ligar o motor ao módulo do decreto**

Em `index.ts`, importe `calcular2025`, substitua o `calcular` esqueleto por `calcular: calcular2025,`
e suba a `versao` para `'1.0.0'`.

- [ ] **Step 6: Rodar a suíte inteira e os tipos**

```bash
pnpm test && pnpm exec tsc --noEmit
```

Esperado: tudo verde. O contrato da Task 3 agora exerce o motor real nos dois sentidos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/motor.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/
git commit -m "Porta o motor do Decreto 12.970/2025

Porte literal do engine.js: mesma ordem de blocos, mesmos nomes de variável e
comentários de linha da planilha. A correspondência é o que mantém auditável a
comparação contra o oráculo.

Os dois bugs da planilha ficam corrigidos e marcados; as duas ambiguidades
jurídicas ficam preservadas e marcadas. Paridade com o engine de origem
verificada cenário a cenário, com zero divergências."
```

---

### Task 7: O oráculo e a regressão contra a planilha

A Task 6 provou paridade com o `engine.js`. Esta prova paridade com a **planilha** — o oráculo
independente, que é o que pega erro herdado do próprio engine.

**Files:**
- Create: `validacao/README.md`, `validacao/oraculo.py`, `validacao/requirements.txt`
- Create: `tests/indulto-comutacao/motor-2025.spec.ts`

**Interfaces:**
- Consumes: `calcular2025` da Task 6.
- Produces: `validacao/2025/esperado.json` — o congelado que vira regressão.

- [ ] **Step 1: Estudar o harness original**

```bash
cat validacao/2025/validate-original.py
```

Ele já resolve o problema: monta o modelo da planilha, injeta entradas e lê as saídas.
Reaproveite o mapeamento de células dele (`build_inputs`, e as funções `q()`/`r()` que endereçam
as abas QUESTIONARIO e RESULTADO) — é a correspondência que os autores da POC já validaram, e
refazê-la do zero é retrabalho com risco.

Três coisas a corrigir ao adaptar:

1. **`SRC` está hardcoded** para `/Users/sigapavon/Downloads/…`. Aponte para
   `validacao/2025/planilha.xlsx`, resolvido relativo ao arquivo do script — o harness precisa
   rodar em qualquer máquina.
2. **`PFX` embute o nome do arquivo** da planilha, que mudou ao entrar no repositório. O prefixo
   tem que casar com o nome real do arquivo, senão `formulas` não acha a célula.
3. **Python 3.9 é o que está instalado nesta máquina** (`python3 --version`), e já está
   verificado que basta: `formulas[excel]==1.3.4` instala, importa e abre a planilha nele.

**O que já foi medido nesta planilha**, para você não descobrir na tentativa e erro:

- Montar o modelo (`ExcelModel().loads(...).finish()`) leva **~16 s**; `calculate()` devolve
  **1731 células**.
- As abas são `CÁLCULO`, `QUESTIONARIO`, `RESULTADO`, `SOMAR TEMPO - CALCULAR DATA` e
  `VALID_DADOS`. As duas que o harness endereça (`QUESTIONARIO` e `RESULTADO`) existem com
  esses nomes exatos.
- 🔴 **Monte o modelo UMA vez e reaproveite-o em todos os cenários**, como o
  `validate-original.py` já faz. Remontar por cenário multiplica os 16 s pelo número de
  cenários e transforma um harness de segundos num de minutos.

- [ ] **Step 2: Declarar a dependência**

```
# validacao/requirements.txt
# O extra [excel] NÃO é opcional: sem ele a formulas instala e importa normalmente,
# e só quebra na hora de abrir o .xlsx, com ModuleNotFoundError: openpyxl.
formulas[excel]==1.3.4
```

Verificado nesta máquina: instala e importa em **Python 3.9.6**, que é o que está disponível
aqui. Não suba de versão sem testar — a lib mexe com internals do openpyxl e quebra com
frequência entre releases.

- [ ] **Step 3: Escrever o oráculo**

Adapte o `validate-original.py` para gravar `esperado.json` em vez de comparar na hora:

```python
# validacao/oraculo.py
"""Avalia a planilha original e congela o resultado esperado de cada cenário.

A biblioteca `formulas` interpreta o .xlsx e calcula suas fórmulas sem Excel nem
LibreOffice. Ela é um SEGUNDO implementador do mesmo problema, que não conhece o
motor em TypeScript — é isso que torna a comparação uma evidência, e não uma
repetição.

Uso:
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r validacao/requirements.txt
    python validacao/oraculo.py 2025
"""
```

O corpo sai do `validate-original.py`, trocando a comparação pela escrita do JSON.

- [ ] **Step 4: Rodar o oráculo**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r validacao/requirements.txt
python validacao/oraculo.py 2025
```

Se `formulas` falhar ao ler uma fórmula, **não contorne editando a planilha**: anote a fórmula,
reduza o cenário e trate como achado — uma fórmula que o oráculo não entende é exatamente onde
o porte pode estar errado.

- [ ] **Step 5: Escrever a regressão**

`tests/indulto-comutacao/motor-2025.spec.ts` lê `validacao/2025/esperado.json` e compara com
`calcular2025`, cenário a cenário. Três detalhes que não são óbvios:

- **O mapa código → texto é o `VEREDITOS` de `src/lib/indulto-comutacao/tipos.ts`.** Não existe
  `ROTULO` exportado em lugar nenhum; não crie outro.
- **O motor devolve números; a planilha devolve texto formatado** (`"X anos Y meses Z dias"`) nas
  células de quantum e pena após. Formate o número com `fmtDias` e compare **em dias com tolerância
  de 1 dia**, como o `equivalentes()` do `validate-original.py` já faz — a tolerância existe por
  arredondamento da planilha. Deixe-a explícita e comentada, não escondida.
- Para as células de comutação quando o dispositivo **não** preenche, a planilha escreve texto
  (`"Sem Comutação"` ou erro) e o motor devolve `null`. Trate como equivalentes, citando o bug
  `L145:L149`; e mantenha o desvio documentado do `G149` que o harness original já tratava.

- [ ] **Step 5b: Acrescentar cenários que só a planilha pode julgar**

A paridade da Task 6 prova que o motor ≡ `engine.js`. **Ela não pega erro do próprio `engine.js`**
— só a planilha pega. Acrescente ao `validacao/2025/cenarios.json` cenários posicionados (não fuzz:
cada cálculo na planilha é caro):

1. **`justicaRestaurativa: 'SIM'` como único critério do perfil do §2º**, num caso em que a regra
   especial de algum inciso só preenche por causa dele. O harness original já injeta E51, mas
   nenhum cenário o usava. Isto confirma, contra a fonte de verdade, que o campo acrescentado na
   Task 4 muda o resultado.
2. **Inciso VIII com perfil do §2º e remanescente entre o teto geral e o teto dobrado** (ex.: não
   reincidente, remanescente de 8 anos: acima de 6, abaixo de 12). Decide se o `*2` do `Rhalf` é da
   planilha ou do `engine.js`.
3. **Art. 11, III** — mulher, reincidente, filho até 16 anos, pena cumprida **entre 1/5 e 1/2** do
   não impeditivo. Decide se a planilha exige mesmo 1/5 como o `engine.js`.
4. **Art. 13 na fronteira exata** (`D6 + G7 + G8 == N13`, onde o Art. 13 usa `<` e o §4º usa `<=`).

🔴 **Se a planilha divergir do `engine.js` no cenário 2 ou 3, PARE e relate.** Não ajuste o motor,
não ajuste o cenário: é questão jurídica, e decide quem é dono do produto.

- [ ] **Step 6: Reconciliar até zerar**

Cada divergência é uma de três coisas, nesta ordem de suspeita:

1. **Erro de porte** — o mais provável. Corrija o `motor.ts`.
2. **Um dos dois bugs conhecidos** (`L145:L149`, `G149`) — esperado; registre no cenário o valor
   corrigido, com comentário citando o bug.
3. **Bug novo da planilha** — **pare e relate ao dono do produto.** Não decida sozinho: a
   planilha é a fonte de verdade jurídica e corrigi-la é decisão dos autores do método.

**Portão: a suíte precisa ficar inteiramente verde antes da Task 8.**

- [ ] **Step 7: Escrever o `validacao/README.md`**

Cubra: por que o harness existe (o que ele pega e nada mais pega), como rodar, quando rodar
(motor novo ou fórmula mudada — não a cada commit), o que não fazer (editar a planilha para
passar; "consertar" o `esperado.json`; resolver ambiguidade jurídica sozinho) e o fato de a
pasta não entrar na imagem Docker.

- [ ] **Step 8: Commit**

```bash
git add validacao tests/indulto-comutacao/motor-2025.spec.ts
git commit -m "Valida o motor de 2025 contra a planilha original

Harness Python com a lib formulas como oráculo independente, cenário a
cenário. O esperado.json fica congelado e vira a regressão em Vitest — rápida,
sem Python e sem planilha."
```

---

### Task 8: A tela de resultado

Componente puro: recebe motor e resultado, devolve a tela. Sem estado e sem acesso a dados, o que o torna testável e reaproveitável entre a tela de "novo" e a de cálculo salvo.

**Files:**
- Create: `src/app/(app)/ferramentas/indulto-comutacao/Resultado.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/resultado.module.css`

**Interfaces:**
- Consumes: `MotorDecreto`, `Resultado` de `tipos.ts`; `fmtDias` de `tempo.ts`.
- Produces: `export default function Resultado({ motor, resultado }: { motor: MotorDecreto; resultado: ResultadoCalculo })`.

- [ ] **Step 1: Escrever o componente**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/Resultado.tsx
import type { MotorDecreto, Resultado as ResultadoCalculo, Veredito } from '@/lib/indulto-comutacao/tipos'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import estilos from './resultado.module.css'

const TOM: Record<Veredito, string> = {
  preenche: estilos.preenche,
  nao_preenche: estilos.naoPreenche,
  a_analisar: estilos.aAnalisar,
  sem_previsao: estilos.semPrevisao,
}

function Selo({ rotulo, veredito }: { rotulo: string; veredito: Veredito }) {
  return (
    <span className={`${estilos.selo} ${TOM[veredito]}`}>
      <b>{rotulo}</b> {VEREDITOS[veredito]}
    </span>
  )
}

export default function Resultado({
  motor,
  resultado,
}: {
  motor: MotorDecreto
  resultado: ResultadoCalculo
}) {
  const porId = new Map(resultado.incisos.map((i) => [i.id, i]))

  return (
    <div className={estilos.resultado}>
      <section className={estilos.resumo} aria-label="Resumo de tempos">
        <div><span>Total de penas impostas</span><b>{fmtDias(resultado.resumo.totalImposto)}</b></div>
        <div><span>Total de pena cumprida</span><b>{fmtDias(resultado.resumo.totalCumprido)}</b></div>
        <div><span>Cumprido computável nos impeditivos</span><b>{fmtDias(resultado.resumo.penaCumpridaImpeditivos)}</b></div>
        <div><span>Pena remanescente</span><b>{fmtDias(resultado.resumo.remanescente)}</b></div>
        <div><span>2/3 dos impeditivos</span><b>{fmtDias(resultado.resumo.fracoes.doisTercosImpeditivos)}</b></div>
        <div><span>1/5 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umQuinto)}</b></div>
        <div><span>1/4 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umQuarto)}</b></div>
        <div><span>1/3 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umTerco)}</b></div>
        <div><span>1/2 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.metade)}</b></div>
      </section>

      <h2 className={estilos.titulo}>Indulto — Art. 9º, 10 e 12</h2>
      <div className={estilos.cartoes}>
        {motor.incisos.indulto.map((meta) => {
          const r = porId.get(meta.id)
          if (!r) return null
          return (
            <article key={meta.id} className={estilos.cartao}>
              <h3>{meta.rotulo}</h3>
              <p>{meta.descricao}</p>
              <Selo rotulo="Regra geral" veredito={r.geral} />
              <Selo rotulo="Regra especial §2º" veredito={r.especial} />
            </article>
          )
        })}
      </div>

      <h2 className={estilos.titulo}>Comutação — Art. 11 e 13</h2>
      <div className={estilos.cartoes}>
        {motor.incisos.comutacao.map((meta) => {
          const r = porId.get(meta.id)
          if (!r) return null
          return (
            <article key={meta.id} className={estilos.cartao}>
              <h3>{meta.rotulo}</h3>
              <p>{meta.descricao}</p>
              <Selo rotulo="Situação" veredito={r.geral} />
              {r.geral === 'preenche' && (
                <dl className={estilos.quantum}>
                  <dt>Quantum da comutação</dt>
                  <dd>{fmtDias(r.quantum ?? null)}</dd>
                  <dt>Pena total após a comutação</dt>
                  <dd>{fmtDias(r.penaApos ?? null)}</dd>
                </dl>
              )}
            </article>
          )
        })}
      </div>

      <section className={estilos.validar} aria-label="Pontos a validar juridicamente">
        <h2>Pontos a validar juridicamente</h2>
        <ul>
          {motor.avisos.validarJuridicamente.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      <section className={estilos.notas} aria-label="Notas">
        <ul>
          {motor.avisos.fixos.map((a) => <li key={a}>{a}</li>)}
          {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      <p className={estilos.proveniencia}>
        Calculado com {motor.rotulo} — motor versão {motor.versao}. Data-base: 25/12/2025.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Escrever o CSS, com folha de impressão**

O destino do resultado é papel ou PDF anexado a petição. Sem `@media print`, o membro imprime o menu lateral junto.

```css
/* src/app/(app)/ferramentas/indulto-comutacao/resultado.module.css */
.resultado { display: grid; gap: 24px; }

.resumo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.resumo > div {
  display: grid; gap: 4px;
  padding: 12px;
  border: 1px solid var(--borda, #e5e7eb);
  border-radius: 8px;
}
.resumo span { font-size: 12px; opacity: 0.7; }
.resumo b { font-size: 16px; }

.titulo { font-size: 18px; margin: 0; }

.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.cartao {
  display: grid; gap: 8px; align-content: start;
  padding: 16px;
  border: 1px solid var(--borda, #e5e7eb);
  border-radius: 8px;
}
.cartao h3 { margin: 0; font-size: 15px; }
.cartao p { margin: 0; font-size: 13px; opacity: 0.75; }

.selo {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid currentColor;
  width: fit-content;
}
.preenche { color: #15803d; }
.naoPreenche { color: #b91c1c; }
.aAnalisar { color: #a16207; }
.semPrevisao { color: #6b7280; }

.quantum { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 4px 0 0; font-size: 13px; }
.quantum dt { opacity: 0.7; }
.quantum dd { margin: 0; font-weight: 600; }

.validar, .notas {
  padding: 16px;
  border: 1px solid var(--borda, #e5e7eb);
  border-radius: 8px;
  font-size: 13px;
}
.validar h2 { margin: 0 0 8px; font-size: 15px; }
.validar ul, .notas ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }

.proveniencia { font-size: 12px; opacity: 0.6; margin: 0; }

/* O resultado vira anexo de petição: imprime só ele, sem o shell do CRM. */
@media print {
  .resultado { gap: 16px; }
  .cartoes { grid-template-columns: repeat(2, 1fr); }
  .cartao, .resumo > div, .validar, .notas {
    break-inside: avoid;
    border-color: #999;
  }
  .selo { border-color: #666; color: #000; }
  .proveniencia { opacity: 1; }
}
```

- [ ] **Step 3: Conferir os tipos**

```bash
pnpm exec tsc --noEmit
```

Esperado: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/Resultado.tsx" "src/app/(app)/ferramentas/indulto-comutacao/resultado.module.css"
git commit -m "Adiciona a tela de resultado da calculadora

Componente puro: recebe motor e resultado, sem estado e sem acesso a dados,
o que o deixa reaproveitável entre o cálculo novo e o salvo. Traz folha de
impressão porque o destino do resultado é anexo de petição, e carimba a
versão do motor que gerou os números."
```

---

### Task 9: O questionário e o cálculo ao vivo

O componente de cliente que mantém o estado da entrada, renderiza as seções e recalcula a cada tecla. O cálculo é função pura: roda no navegador, sem rede.

**Files:**
- Create: `src/app/(app)/ferramentas/indulto-comutacao/Questionario.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css`

**Interfaces:**
- Consumes: `Secao`, `Campo`, `Entrada`, `MotorDecreto`; o componente `Resultado` da Task 8.
- Produces: `entradaInicial(motor: MotorDecreto): Entrada`; `Calculadora({ motor, inicial })`
  — a Task 11 acrescenta a este componente as props opcionais `acao`, `id`, `tituloInicial` e
  `rotuloAcao`, que ligam o formulário de salvar.

- [ ] **Step 1: Escrever o renderizador de seções**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/Questionario.tsx
'use client'

import type { Campo, Entrada, Secao, Tempo } from '@/lib/indulto-comutacao/tipos'
import estilos from './calculadora.module.css'

function ehTempo(v: unknown): v is Tempo {
  return typeof v === 'object' && v !== null && 'anos' in v
}

export default function Questionario({
  secoes,
  entrada,
  aoMudar,
}: {
  secoes: Secao[]
  entrada: Entrada
  aoMudar: (chave: string, valor: Entrada[string]) => void
}) {
  return (
    <div className={estilos.questionario}>
      {secoes.map((secao) => (
        <fieldset key={secao.id} className={estilos.secao}>
          <legend>{secao.titulo}</legend>
          {secao.descricao && <p className={estilos.descricao}>{secao.descricao}</p>}
          {secao.campos.map((campo) => (
            <CampoUnico
              key={campo.chave}
              campo={campo}
              valor={entrada[campo.chave]}
              aoMudar={aoMudar}
            />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

function CampoUnico({
  campo,
  valor,
  aoMudar,
}: {
  campo: Campo
  valor: Entrada[string]
  aoMudar: (chave: string, valor: Entrada[string]) => void
}) {
  const id = `campo-${campo.chave}`

  if (campo.tipo === 'tempo') {
    const t = ehTempo(valor) ? valor : { anos: 0, meses: 0, dias: 0 }
    const mudarParte = (parte: keyof Tempo, bruto: string) =>
      aoMudar(campo.chave, { ...t, [parte]: Number(bruto) || 0 })

    return (
      <div className={estilos.campo}>
        <span className={estilos.rotulo} id={`${id}-rotulo`}>{campo.rotulo}</span>
        {campo.ajuda && <span className={estilos.ajuda}>{campo.ajuda}</span>}
        <div className={estilos.tempo} role="group" aria-labelledby={`${id}-rotulo`}>
          <label>anos<input type="number" min={0} value={t.anos} onChange={(e) => mudarParte('anos', e.target.value)} /></label>
          <label>meses<input type="number" min={0} value={t.meses} onChange={(e) => mudarParte('meses', e.target.value)} /></label>
          <label>dias<input type="number" min={0} value={t.dias} onChange={(e) => mudarParte('dias', e.target.value)} /></label>
        </div>
      </div>
    )
  }

  if (campo.tipo === 'selecao') {
    return (
      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor={id}>{campo.rotulo}</label>
        {campo.ajuda && <span className={estilos.ajuda}>{campo.ajuda}</span>}
        <select
          id={id}
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => aoMudar(campo.chave, e.target.value)}
        >
          <option value="">—</option>
          {campo.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  const tipoHtml = campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'
  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>{campo.rotulo}</label>
      {campo.ajuda && <span className={estilos.ajuda}>{campo.ajuda}</span>}
      <input
        id={id}
        type={tipoHtml}
        value={typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''}
        onChange={(e) =>
          aoMudar(campo.chave, campo.tipo === 'numero' ? Number(e.target.value) || 0 : e.target.value)
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: Escrever o componente de estado**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx
'use client'

import { useMemo, useState } from 'react'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import Questionario from './Questionario'
import Resultado from './Resultado'
import estilos from './calculadora.module.css'

/**
 * A entrada em branco de um motor: os campos de seleção que declaram `padrao`
 * já nascem preenchidos.
 *
 * 🔴 É daqui que vêm os dois SIM dos requisitos da data do fato. Sem eles, todo
 * cálculo começaria vetado e o advogado não teria como saber por quê.
 */
export function entradaInicial(motor: MotorDecreto): Entrada {
  const entrada: Entrada = {}
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) {
      if (campo.tipo === 'selecao' && campo.padrao) entrada[campo.chave] = campo.padrao
      else if (campo.tipo === 'tempo') entrada[campo.chave] = { anos: 0, meses: 0, dias: 0 }
    }
  }
  return entrada
}

export default function Calculadora({
  motor,
  inicial,
}: {
  motor: MotorDecreto
  inicial?: Entrada
}) {
  const [entrada, setEntrada] = useState<Entrada>(() => inicial ?? entradaInicial(motor))

  // `calcular` é função pura e barata: roda no navegador a cada tecla, sem rede.
  // Nada sai daqui até o membro salvar.
  const resultado = useMemo(() => motor.calcular(entrada), [motor, entrada])

  const aoMudar = (chave: string, valor: Entrada[string]) =>
    setEntrada((atual) => ({ ...atual, [chave]: valor }))

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <Questionario secoes={motor.questionario} entrada={entrada} aoMudar={aoMudar} />
      </div>
      <div className={estilos.coluna}>
        <Resultado motor={motor} resultado={resultado} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Escrever o CSS**

```css
/* src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css */
.layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

.coluna { min-width: 0; }

.questionario { display: grid; gap: 16px; }
.secao {
  display: grid; gap: 12px;
  padding: 16px;
  border: 1px solid var(--borda, #e5e7eb);
  border-radius: 8px;
}
.secao legend { font-weight: 600; padding: 0 6px; }
.descricao { margin: 0; font-size: 13px; opacity: 0.75; }

.campo { display: grid; gap: 4px; }
.rotulo { font-size: 13px; font-weight: 500; }
.ajuda { font-size: 12px; opacity: 0.7; }
.campo input, .campo select { padding: 8px; border: 1px solid var(--borda, #d1d5db); border-radius: 6px; font: inherit; }

.tempo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tempo label { display: grid; gap: 4px; font-size: 12px; opacity: 0.8; }

/* Ao imprimir, o questionário não vai junto: o anexo é o resultado. */
@media print {
  .layout { grid-template-columns: 1fr; }
  .coluna:first-child { display: none; }
}
```

- [ ] **Step 4: Conferir os tipos**

```bash
pnpm exec tsc --noEmit
```

Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/Questionario.tsx" "src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx" "src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css"
git commit -m "Adiciona o questionário com cálculo ao vivo

O motor é função pura, então roda no navegador a cada tecla e o resultado
acompanha o preenchimento — nada vai ao servidor até o membro salvar. Os
campos de seleção com padrão nascem preenchidos, que é como os dois vetos
da data do fato começam em SIM."
```

---

### Task 10: A tabela e as escritas

**Files:**
- Create: `supabase/migrations/0062_ferramentas_indulto_comutacao.sql`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/acoes.ts`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/calculos.ts`

**Interfaces:**
- Consumes: `exigirSessao()` de `@/server/auth/sessao`; `resolverWorkspaceAtivo()` de `@/server/auth/workspace-ativo`; `admin()` de `@/server/supabase`; `criarClienteServidor()` de `@/server/supabase-session`.
- Produces: `salvar(fd)`, `atualizar(fd)`, `excluir(fd)`; `listarCalculos()`, `lerCalculo(id)`, `type CalculoSalvo`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0062_ferramentas_indulto_comutacao.sql — os cálculos de indulto e comutação
-- que cada membro guarda para si.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE: o CRM
-- reaplica no boot qualquer migration que não encontre registrada, então toda
-- instrução aqui aguenta rodar duas vezes. Nada apaga dado e nada exige
-- ownership de objeto do Supabase.

create table if not exists public.indulto_comutacao_calculos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Qual motor gerou este resultado. Guardados juntos, permitem avisar o membro
  -- quando uma correção de fórmula muda um número que ele já usou em petição.
  decreto_id    text not null,
  motor_versao  text not null,
  titulo        text not null,
  entrada       jsonb not null,
  resultado     jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists indulto_comutacao_calculos_dono_idx
  on public.indulto_comutacao_calculos (workspace_id, user_id, atualizado_em desc);

alter table public.indulto_comutacao_calculos enable row level security;

-- 🔴 SÓ LEITURA, e só do próprio dono.
--
-- `e_membro(workspace_id)` sozinho deixaria um membro ler o caso de outro dentro
-- do mesmo workspace — é o `user_id = auth.uid()` que separa os dois.
--
-- 🔴 E NENHUMA POLICY DE ESCRITA para `authenticated`. O CRM entrega um cliente
-- Supabase ao NAVEGADOR na tela de Conversas, e o Postgres não distingue "o
-- servidor agindo em nome do usuário" de "o usuário agindo pelo console do
-- navegador": é o mesmo JWT. Uma policy de escrita autorizaria o segundo, que
-- pularia a rota, a validação e qualquer regra escrita em código. As escritas
-- vão por server action, com service-role, que não passa por RLS.
--
-- `create policy` não aceita `if not exists`, daí o bloco que pergunta antes.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'indulto_comutacao_calculos'
      and policyname = 'indulto_comutacao_calculos_sel'
  ) then
    create policy indulto_comutacao_calculos_sel on public.indulto_comutacao_calculos
      for select to authenticated
      using (public.e_membro(workspace_id) and user_id = auth.uid());
  end if;
end $$;
```

- [ ] **Step 2: Escrever a leitura**

```ts
// src/app/(app)/ferramentas/indulto-comutacao/calculos.ts
import 'server-only'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import type { Entrada, Resultado } from '@/lib/indulto-comutacao/tipos'

export type CalculoSalvo = {
  id: string
  decreto_id: string
  motor_versao: string
  titulo: string
  entrada: Entrada
  resultado: Resultado
  criado_em: string
  atualizado_em: string
}

const COLUNAS = 'id, decreto_id, motor_versao, titulo, entrada, resultado, criado_em, atualizado_em'

/**
 * Os cálculos do membro logado.
 *
 * A leitura passa pelo cliente de sessão de propósito: a RLS aplica
 * `e_membro(workspace_id) and user_id = auth.uid()` sozinha, então não há filtro
 * de dono para esquecer aqui.
 */
export async function listarCalculos(): Promise<CalculoSalvo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS)
    .order('atualizado_em', { ascending: false })

  return (data ?? []) as CalculoSalvo[]
}

export async function lerCalculo(id: string): Promise<CalculoSalvo | null> {
  const cliente = await criarClienteServidor()
  const { data } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS)
    .eq('id', id)
    .maybeSingle()

  return (data as CalculoSalvo | null) ?? null
}
```

- [ ] **Step 3: Escrever as server actions**

```ts
// src/app/(app)/ferramentas/indulto-comutacao/acoes.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { exigirSessao } from '@/server/auth/sessao'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { admin } from '@/server/supabase'
import { motorPorId } from '@/lib/indulto-comutacao/registro'

const BASE = '/ferramentas/indulto-comutacao'

const Payload = z.object({
  titulo: z.string().trim().min(1, 'Dê um título ao cálculo').max(200),
  decretoId: z.string().trim().min(1),
  entrada: z.string(), // JSON serializado pelo cliente
})

/**
 * Recalcula no servidor a partir da entrada.
 *
 * O cliente manda a entrada, nunca o resultado: assim o que fica gravado é
 * sempre produto do motor desta versão, e um cliente adulterado não consegue
 * escrever um resultado inventado.
 */
function calcular(decretoId: string, entradaBruta: string) {
  const motor = motorPorId(decretoId)
  if (!motor) throw new Error('Decreto desconhecido')

  const entrada = JSON.parse(entradaBruta)
  return { motor, entrada, resultado: motor.calcular(entrada) }
}

async function contexto() {
  const user = await exigirSessao()
  const ws = await resolverWorkspaceAtivo()
  if (!ws) redirect('/sem-workspace')
  return { userId: user.id, ws }
}

export async function salvar(fd: FormData) {
  const { userId, ws } = await contexto()
  const dados = Payload.parse({
    titulo: fd.get('titulo'),
    decretoId: fd.get('decretoId'),
    entrada: fd.get('entrada'),
  })

  const { motor, entrada, resultado } = calcular(dados.decretoId, dados.entrada)

  // 🔴 workspace_id e user_id vêm da SESSÃO, nunca do payload: `admin()` é
  // service-role e não passa por RLS, então é aqui que o isolamento acontece.
  const { data, error } = await admin()
    .from('indulto_comutacao_calculos')
    .insert({
      workspace_id: ws,
      user_id: userId,
      decreto_id: motor.id,
      motor_versao: motor.versao,
      titulo: dados.titulo,
      entrada,
      resultado,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(BASE)
  redirect(`${BASE}/${data.id}`)
}

export async function atualizar(fd: FormData) {
  const { userId, ws } = await contexto()
  const id = z.string().uuid().parse(fd.get('id'))
  const dados = Payload.parse({
    titulo: fd.get('titulo'),
    decretoId: fd.get('decretoId'),
    entrada: fd.get('entrada'),
  })

  const { motor, entrada, resultado } = calcular(dados.decretoId, dados.entrada)

  // 🔴 O `.eq('user_id')` NÃO é redundante: service-role não passa por RLS.
  // Sem ele, um id de outro membro seria sobrescrito sem erro.
  const { error } = await admin()
    .from('indulto_comutacao_calculos')
    .update({
      decreto_id: motor.id,
      motor_versao: motor.versao,
      titulo: dados.titulo,
      entrada,
      resultado,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('workspace_id', ws)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  revalidatePath(BASE)
  revalidatePath(`${BASE}/${id}`)
}

export async function excluir(fd: FormData) {
  const { userId, ws } = await contexto()
  const id = z.string().uuid().parse(fd.get('id'))

  const { error } = await admin()
    .from('indulto_comutacao_calculos')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ws)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  revalidatePath(BASE)
  redirect(BASE)
}
```

- [ ] **Step 4: Conferir os tipos**

```bash
pnpm exec tsc --noEmit
```

Esperado: sem erro. Se `exigirSessao` tiver assinatura diferente, leia `src/server/auth/sessao.ts` e ajuste — não invente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0062_ferramentas_indulto_comutacao.sql "src/app/(app)/ferramentas/indulto-comutacao/acoes.ts" "src/app/(app)/ferramentas/indulto-comutacao/calculos.ts"
git commit -m "Guarda os cálculos, privados por membro

Leitura por RLS com e_membro + auth.uid(); escrita só por server action com
service-role, sem policy de escrita para authenticated — o CRM entrega
Supabase ao navegador na tela de Conversas, e uma policy dessas autorizaria
o console do usuário a pular toda validação.

As ações recalculam a partir da entrada em vez de aceitar o resultado do
cliente, e filtram por user_id porque service-role não passa por RLS."
```

---

### Task 11: As telas

**Files:**
- Create: `src/app/(app)/ferramentas/indulto-comutacao/page.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/novo/page.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/[id]/page.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/BarraSalvar.tsx`

**Interfaces:**
- Consumes: tudo das Tasks 8–10.
- Produces: as quatro rotas da ferramenta.

- [ ] **Step 1: A barra de salvar**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/BarraSalvar.tsx
'use client'

import { useState } from 'react'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'

/**
 * O formulário que leva a entrada ao servidor.
 *
 * A entrada viaja serializada num campo oculto e o servidor RECALCULA a partir
 * dela — o resultado nunca é enviado pelo cliente.
 */
export default function BarraSalvar({
  motor,
  entrada,
  acao,
  id,
  tituloInicial = '',
  rotulo = 'Salvar cálculo',
}: {
  motor: MotorDecreto
  entrada: Entrada
  acao: (fd: FormData) => Promise<void>
  id?: string
  tituloInicial?: string
  rotulo?: string
}) {
  const [titulo, setTitulo] = useState(tituloInicial)

  return (
    <form action={acao} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="decretoId" value={motor.id} />
      <input type="hidden" name="entrada" value={JSON.stringify(entrada)} />
      <input
        name="titulo"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nº de execução ou identificação do caso"
        required
        maxLength={200}
        style={{ flex: 1, minWidth: 240, padding: 8 }}
      />
      <button type="submit">{rotulo}</button>
    </form>
  )
}
```

- [ ] **Step 2: Ligar a barra à calculadora**

Em `Calculadora.tsx`, acrescente as props opcionais e renderize a barra acima do resultado:

```tsx
import BarraSalvar from './BarraSalvar'
```

Acrescente ao tipo das props:

```tsx
  acao?: (fd: FormData) => Promise<void>
  id?: string
  tituloInicial?: string
  rotuloAcao?: string
```

E dentro da segunda `<div className={estilos.coluna}>`, antes do `<Resultado …/>`:

```tsx
        {acao && (
          <BarraSalvar
            motor={motor}
            entrada={entrada}
            acao={acao}
            id={id}
            tituloInicial={tituloInicial}
            rotulo={rotuloAcao}
          />
        )}
```

- [ ] **Step 3: A lista**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/page.tsx
import Link from 'next/link'
import { Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import { tituloDaPagina } from '@/server/marca'
import { listarCalculos } from './calculos'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Indulto e comutação') }
}

export default async function ListaPage() {
  const calculos = await listarCalculos()

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CabecalhoPagina
        titulo="Indulto e comutação"
        subtitulo="Os seus cálculos. Nenhum outro membro os vê."
        acoes={<Link href="/ferramentas/indulto-comutacao/novo">Novo cálculo</Link>}
      />

      {calculos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum cálculo salvo"
          descricao="Crie o primeiro e ele fica guardado na sua conta."
        />
      ) : (
        <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {calculos.map((c) => (
            <li key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <Link href={`/ferramentas/indulto-comutacao/${c.id}`}>
                <b>{c.titulo}</b>
              </Link>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                <Scale size={12} /> {c.decreto_id} · motor {c.motor_versao} ·{' '}
                {new Date(c.atualizado_em).toLocaleDateString('pt-BR')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Se `CabecalhoPagina` não aceitar a prop `acoes`, leia `src/components/ui/CabecalhoPagina.tsx` e use a prop que ele expõe — não invente.

- [ ] **Step 4: O novo cálculo**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/novo/page.tsx
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { motorPadrao, REGISTRO } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import { salvar } from '../acoes'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default function NovoPage() {
  // Com um motor só no registro, a tela mostra qual está em uso em vez de
  // esconder a escolha. Quando 2024 entrar, vira um seletor sem mudar o fluxo.
  const motor = motorPadrao()

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CabecalhoPagina
        titulo="Novo cálculo"
        subtitulo={
          REGISTRO.length > 1
            ? `${REGISTRO.length} decretos disponíveis — usando ${motor.rotulo}`
            : motor.rotulo
        }
      />
      <Calculadora motor={motor} acao={salvar} />
    </div>
  )
}
```

- [ ] **Step 5: O cálculo salvo, com o aviso de versão**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/[id]/page.tsx
import { notFound } from 'next/navigation'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import { atualizar, excluir } from '../acoes'
import { lerCalculo } from '../calculos'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function CalculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()

  const motor = motorPorId(calculo.decreto_id)
  if (!motor) notFound()

  // O cálculo é refeito a partir da entrada com o motor ATUAL. Se a fórmula
  // mudou desde que foi salvo, o membro precisa saber — o número antigo pode
  // já ter virado petição.
  const agora = motor.calcular(calculo.entrada)
  const mudou =
    calculo.motor_versao !== motor.versao &&
    JSON.stringify(agora) !== JSON.stringify(calculo.resultado)

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CabecalhoPagina titulo={calculo.titulo} subtitulo={motor.rotulo} />

      {mudou && (
        <div role="alert" style={{ border: '1px solid #a16207', borderRadius: 8, padding: 12 }}>
          <b>Este cálculo mudou.</b> Ele foi salvo com o motor versão{' '}
          {calculo.motor_versao}; a versão atual é a {motor.versao} e produz um resultado
          diferente. O que aparece abaixo é o cálculo <b>refeito agora</b>. Salve de novo
          para gravar o resultado atualizado.
        </div>
      )}

      <Calculadora
        motor={motor}
        inicial={calculo.entrada}
        acao={atualizar}
        id={calculo.id}
        tituloInicial={calculo.titulo}
        rotuloAcao="Salvar alterações"
      />

      <form action={excluir}>
        <input type="hidden" name="id" value={calculo.id} />
        <button type="submit">Excluir este cálculo</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Conferir tipos e build**

```bash
pnpm exec tsc --noEmit && pnpm build
```

Esperado: ambos sem erro.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao"
git commit -m "Adiciona as telas da calculadora

Lista, novo cálculo e cálculo salvo. O salvo é refeito a partir da entrada
com o motor atual: quando a fórmula mudou desde que foi gravado, a tela
avisa em vez de trocar o número em silêncio — o antigo pode já ter virado
petição."
```

---

### Task 12: O hub, o menu e a nota de dado pessoal

**Files:**
- Create: `src/app/(app)/ferramentas/page.tsx`
- Modify: `src/components/shell/Rail.tsx`

**Interfaces:**
- Consumes: `REGISTRO` de `registro.ts`.
- Produces: a rota `/ferramentas` e o item de menu.

- [ ] **Step 1: O hub**

```tsx
// src/app/(app)/ferramentas/page.tsx
import Link from 'next/link'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

export default function FerramentasPage() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Link
          href="/ferramentas/indulto-comutacao"
          style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'grid', gap: 6 }}
        >
          <b>Indulto e comutação</b>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            Verifica, dispositivo por dispositivo, os requisitos de indulto e de comutação.
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {REGISTRO.length === 1
              ? REGISTRO[0].rotulo
              : `${REGISTRO.length} decretos disponíveis`}
          </span>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Acrescentar a nota de dado pessoal na tela de novo cálculo**

Em `src/app/(app)/ferramentas/indulto-comutacao/novo/page.tsx`, logo abaixo do `<CabecalhoPagina …/>`:

```tsx
      <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
```

- [ ] **Step 3: Acrescentar o item ao menu**

`NavMobile` envolve o mesmo `Rail` como `children` (`src/app/(app)/layout.tsx:61-68`), então esta única edição serve aos dois tamanhos de tela.

Em `src/components/shell/Rail.tsx`, acrescente `Scale` ao import de `lucide-react`:

```tsx
  Bot, Boxes, ClipboardList, Landmark, Sparkles, Puzzle, Scale,
```

e, logo após a linha do `<ItemNav href="/relatorios" …/>`, acrescente:

```tsx
        <div className={estilos.sec}>Ferramentas</div>
        <ItemNav href="/ferramentas" rotulo="Ferramentas"><Scale size={16} strokeWidth={2} /></ItemNav>
```

- [ ] **Step 4: Rodar a suíte e o build**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm build
```

Esperado: todos verdes.

- [ ] **Step 5: Conferir na tela**

```bash
pnpm dev
```

Confira, logado no CRM:

1. `/ferramentas` lista o cartão da calculadora.
2. "Ferramentas" aparece no menu lateral e na gaveta mobile (estreite a janela).
3. `/ferramentas/indulto-comutacao/novo` abre com os dois campos da data do fato em **SIM**.
4. O resultado muda enquanto você preenche, sem recarregar a página.
5. Salvar leva ao cálculo salvo; recarregar mantém o preenchimento.
6. `Ctrl/Cmd+P` mostra só o resultado, sem menu e sem questionário.
7. Excluir remove o cálculo e volta à lista.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/ferramentas/page.tsx" src/components/shell/Rail.tsx "src/app/(app)/ferramentas/indulto-comutacao/novo/page.tsx"
git commit -m "Publica a calculadora no menu do CRM

Hub em /ferramentas, item no Rail (que o NavMobile reaproveita como
children, então serve aos dois tamanhos de tela) e a nota dizendo ao membro
que o cálculo é dele, é excluível e não precisa do nome do sentenciado."
```

---

## Quando 2024 ou 2026 chegar

O caminho é curto de propósito, e nada abaixo toca no motor de 2025:

1. `mkdir -p src/lib/indulto-comutacao/motores/2026 validacao/2026`
2. Escreva `questionario.ts`, `incisos.ts`, `motor.ts` e `index.ts` da pasta nova. **Copie de 2025 e edite** — não extraia base comum: campo compartilhado vira acoplamento entre um motor validado e outro em porte.
3. Acrescente **uma linha** ao array de `registro.ts`, antes do motor mais recente.
4. Rode `pnpm test`: o teste de contrato da Task 3 já exerce o motor novo sozinho.
5. Valide contra a planilha nova pelo procedimento da Task 7.

A tela não muda: o seletor da Task 11 já reage a `REGISTRO.length > 1`.
