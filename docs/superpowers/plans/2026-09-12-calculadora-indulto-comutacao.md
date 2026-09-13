# Calculadora de Indulto e Comutação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar, dentro do CRM, uma calculadora que diz — dispositivo por dispositivo — se um sentenciado preenche os requisitos de indulto e de comutação do Decreto nº 12.970/2025, com cada membro guardando apenas os próprios cálculos.

**Architecture:** Cada decreto é um motor próprio em `src/lib/indulto-comutacao/motores/<ano>/`, registrado num array de imports estáticos. O motor de 2025 é um porte literal do `engine.js` da POC, validado contra a planilha Excel original por um harness Python que vive em `validacao/`, fora da imagem Docker. As telas ficam em `src/app/(app)/ferramentas/indulto-comutacao/`; o cálculo roda no navegador e só o que o membro escolhe salvar vai ao banco.

**Tech Stack:** Next 16 (App Router, React 19), TypeScript strict, Supabase (Postgres + RLS), Zod, Vitest, CSS Modules. Harness de validação em Python 3 com a biblioteca `formulas`.

**Spec:** `docs/superpowers/specs/2026-09-12-calculadora-indulto-comutacao-design.md`

## Global Constraints

- **Data-base do Decreto 12.970/2025: `2025-12-25`.** Nunca escrita fora de `motores/2025/`; a data-base é campo do motor (`MotorDecreto.dataBase`), nunca constante global.
- **Nenhuma regra jurídica é compartilhada entre motores.** O que `src/lib/indulto-comutacao/` compartilha é: tipos, `tempo.ts` e o registro. Nada mais.
- **`motor.ts` é porte literal, não refatorado:** mesmos nomes de variável da POC (`N6`, `D6`, `P14`, `gates5`, `i18ok`, `elegivelP`), mesma ordem de blocos, comentários de célula da planilha preservados (`linha 75`, `G149`, `L145:L149`).
- **Duas convenções de tempo:** 30/360 (`dias()`, `fmtDias()`) para toda fração de pena; calendário real (`diasCorridos()`) **apenas** no inciso IV do Art. 9º.
- **Dois bugs da planilha corrigidos, cada um marcado em comentário no código:** `L145:L149` (`#VALUE!` → `null`) e `G149` (referência de linha errada no Art. 13, §4º).
- **Duas ambiguidades jurídicas preservadas, nunca alteradas:** base da "pena após comutação" é a pena total imposta; base da comutação do Art. 13/§4º é `max(pena cumprida, pena remanescente)`. Ambas exibidas em "Pontos a validar juridicamente".
- **Nenhuma policy de escrita para `authenticated`.** Leitura por RLS (`e_membro(workspace_id) and user_id = auth.uid()`); escrita só por server action com `admin()` (service-role).
- **`workspace_id` e `user_id` vêm sempre da sessão, nunca do payload.**
- **Migrations são aditivas e idempotentes** — aguentam rodar duas vezes. `create policy` não aceita `if not exists`: vai embrulhada em `do $$ ... end $$;` consultando `pg_policies`.
- **Gerenciador de pacotes: `pnpm`, nunca `npm`.**
- **Idioma do código e da UI: português**, seguindo o produto (`acoes.ts`, `criado_em`, rótulos em português).
- **Vereditos:** `'preenche' | 'nao_preenche' | 'a_analisar' | 'sem_previsao'`.

## Dependência externa

As tarefas **6 e 7** estão bloqueadas até a entrega de três arquivos da POC:
`engine.js`, `scenarios.json` e a planilha Excel do GPS da Pena.

As tarefas **1–5 e 8–12** não dependem deles e podem ser executadas em ordem desde já.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `tests/__mocks__/server-only.ts` | Stub do `server-only` para o Vitest (o `vitest.config.ts` já o referencia) |
| `src/lib/indulto-comutacao/tempo.ts` | `dias()`, `fmtDias()`, `diasCorridos()` — as duas convenções de contagem |
| `src/lib/indulto-comutacao/tipos.ts` | Contratos: `Tempo`, `Entrada`, `Veredito`, `ResultadoInciso`, `Resumo`, `Resultado`, `MetaInciso`, `Campo`, `Secao`, `MotorDecreto` |
| `src/lib/indulto-comutacao/registro.ts` | `REGISTRO`, `motorPorId()`, `motorPadrao()` — imports estáticos |
| `src/lib/indulto-comutacao/motores/2025/questionario.ts` | As seções e campos do questionário de 2025 |
| `src/lib/indulto-comutacao/motores/2025/incisos.ts` | Metadados de exibição dos incisos + avisos fixos |
| `src/lib/indulto-comutacao/motores/2025/motor.ts` | Porte literal do `engine.js` — `calcular()` |
| `src/lib/indulto-comutacao/motores/2025/index.ts` | O `MotorDecreto` de 2025, juntando as peças |
| `validacao/oraculo.py` | Avalia a planilha via `formulas` e grava `esperado.json` |
| `src/app/(app)/ferramentas/page.tsx` | Hub de ferramentas |
| `src/app/(app)/ferramentas/indulto-comutacao/page.tsx` | Lista "Meus cálculos" |
| `src/app/(app)/ferramentas/indulto-comutacao/novo/page.tsx` | Novo cálculo |
| `src/app/(app)/ferramentas/indulto-comutacao/[id]/page.tsx` | Cálculo salvo |
| `src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx` | Client: estado, questionário e resultado ao vivo |
| `src/app/(app)/ferramentas/indulto-comutacao/Questionario.tsx` | Client: renderiza `Secao[]` |
| `src/app/(app)/ferramentas/indulto-comutacao/Resultado.tsx` | Server-safe: resumo, cartões, avisos |
| `src/app/(app)/ferramentas/indulto-comutacao/acoes.ts` | Server actions: `salvar`, `atualizar`, `excluir` |
| `src/app/(app)/ferramentas/indulto-comutacao/calculos.ts` | Leitura: `listarCalculos()`, `lerCalculo()` |
| `supabase/migrations/0062_ferramentas_indulto_comutacao.sql` | Tabela + índice + RLS |

---

### Task 1: Alicerce de testes e as convenções de tempo

O `vitest.config.ts` do produto já aponta para `./tests/__mocks__/server-only.ts`, mas nem `node_modules` nem `tests/` existem nesta cópia. Esta tarefa torna `pnpm test` executável e entrega a primeira unidade real: a contagem de tempo.

**Files:**
- Create: `tests/__mocks__/server-only.ts`
- Create: `src/lib/indulto-comutacao/tempo.ts`
- Test: `tests/indulto-comutacao/tempo.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type Tempo = { anos: number; meses: number; dias: number }`; `dias(t: Tempo): number`; `fmtDias(n: number | null): string`; `diasCorridos(de: Date, ate: Date): number`.

- [ ] **Step 1: Instalar as dependências**

```bash
pnpm install
```

Esperado: termina sem erro e cria `node_modules/`. Se falhar por versão de Node, use Node 22+.

- [ ] **Step 2: Criar o stub do `server-only`**

O pacote real lança erro quando importado fora de um Server Component; no Vitest ele precisa ser inerte. O `vitest.config.ts` já faz o alias — só falta o arquivo.

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

Esperado: PASS, "No test files found" — o `passWithNoTests: true` do `vitest.config.ts` deixa isso verde. Se aparecer erro de módulo, o stub do passo 2 está no caminho errado.

- [ ] **Step 4: Escrever os testes que falham**

```ts
// tests/indulto-comutacao/tempo.spec.ts
import { describe, it, expect } from 'vitest'
import { dias, fmtDias, diasCorridos } from '@/lib/indulto-comutacao/tempo'

describe('dias() — convenção 30/360', () => {
  it('converte anos, meses e dias em dias', () => {
    expect(dias({ anos: 1, meses: 0, dias: 0 })).toBe(360)
    expect(dias({ anos: 0, meses: 1, dias: 0 })).toBe(30)
    expect(dias({ anos: 0, meses: 0, dias: 1 })).toBe(1)
    expect(dias({ anos: 2, meses: 6, dias: 15 })).toBe(895)
  })

  it('trata zero e ausência como zero', () => {
    expect(dias({ anos: 0, meses: 0, dias: 0 })).toBe(0)
  })
})

describe('fmtDias() — a volta', () => {
  it('formata na mesma convenção', () => {
    expect(fmtDias(895)).toBe('2 anos 6 meses 15 dias')
    expect(fmtDias(360)).toBe('1 ano')
    expect(fmtDias(30)).toBe('1 mês')
    expect(fmtDias(1)).toBe('1 dia')
  })

  it('omite as casas zeradas', () => {
    expect(fmtDias(390)).toBe('1 ano 1 mês')
    expect(fmtDias(0)).toBe('0 dias')
  })

  it('devolve travessão quando não há valor', () => {
    // A POC devolve null quando não há comutação aplicável (bug L145:L149 corrigido).
    expect(fmtDias(null)).toBe('—')
  })

  it('é o inverso de dias() para qualquer tempo', () => {
    const t = { anos: 3, meses: 11, dias: 29 }
    expect(dias(t)).toBe(3 * 360 + 11 * 30 + 29)
    expect(fmtDias(dias(t))).toBe('3 anos 11 meses 29 dias')
  })
})

describe('diasCorridos() — calendário real', () => {
  it('conta dias de calendário, não 30/360', () => {
    // 2025 tem 365 dias; na convenção 30/360 daria 360.
    const de = new Date('2024-12-25T00:00:00Z')
    const ate = new Date('2025-12-25T00:00:00Z')
    expect(diasCorridos(de, ate)).toBe(365)
  })

  it('inclui o dia extra de ano bissexto', () => {
    const de = new Date('2024-02-28T00:00:00Z')
    const ate = new Date('2024-03-01T00:00:00Z')
    expect(diasCorridos(de, ate)).toBe(2)
  })

  it('devolve negativo quando a data final é anterior', () => {
    const de = new Date('2025-12-25T00:00:00Z')
    const ate = new Date('2025-12-24T00:00:00Z')
    expect(diasCorridos(de, ate)).toBe(-1)
  })
})
```

- [ ] **Step 5: Rodar e ver falhar**

```bash
pnpm test
```

Esperado: FAIL — `Cannot find module '@/lib/indulto-comutacao/tempo'`.

- [ ] **Step 6: Implementar `tempo.ts`**

```ts
// src/lib/indulto-comutacao/tempo.ts
//
// As duas convenções de contagem da planilha do GPS da Pena, e só elas.
// Este arquivo é compartilhado por TODOS os decretos: não coloque aqui nada
// que dependa de um decreto específico.

export type Tempo = { anos: number; meses: number; dias: number }

/**
 * Sistema A — 30 dias por mês, 360 por ano.
 *
 * Não é contagem de calendário: é a convenção usada em todo cálculo de fração
 * de pena (2/3 da pena impeditiva, 1/5 da pena sem violência, etc.).
 */
export function dias(t: Tempo): number {
  return (t.anos || 0) * 360 + (t.meses || 0) * 30 + (t.dias || 0)
}

/** Formata uma quantidade de dias de volta em "X anos Y meses Z dias" (30/360). */
export function fmtDias(n: number | null): string {
  // `null` é ausência de valor — a planilha original devolvia #VALUE! aqui
  // (bug L145:L149, corrigido no porte).
  if (n === null || n === undefined || Number.isNaN(n)) return '—'

  const total = Math.trunc(n)
  const anos = Math.trunc(total / 360)
  const resto = total - anos * 360
  const meses = Math.trunc(resto / 30)
  const d = resto - meses * 30

  const partes: string[] = []
  if (anos) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`)
  if (meses) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`)
  if (d) partes.push(`${d} ${d === 1 ? 'dia' : 'dias'}`)

  return partes.length ? partes.join(' ') : '0 dias'
}

/**
 * Sistema B — dias de calendário reais.
 *
 * Usado APENAS no inciso IV do Art. 9º, que exige cumprimento ininterrupto
 * contado em tempo corrido. Em qualquer outro lugar, use dias().
 */
export function diasCorridos(de: Date, ate: Date): number {
  return (ate.getTime() - de.getTime()) / 86_400_000
}
```

- [ ] **Step 7: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS, 9 testes.

- [ ] **Step 8: Commit**

```bash
git add tests/__mocks__/server-only.ts tests/indulto-comutacao/tempo.spec.ts src/lib/indulto-comutacao/tempo.ts
git commit -m "Adiciona as convenções de tempo da calculadora

30/360 para fração de pena e calendário real para o inciso IV do Art. 9º,
as duas herdadas da planilha do GPS da Pena. Cria também o stub de
server-only que o vitest.config.ts já esperava encontrar."
```

---

### Task 2: Os contratos

Os tipos que todos os motores cumprem. Nenhuma regra jurídica aqui — só forma.

**Files:**
- Create: `src/lib/indulto-comutacao/tipos.ts`
- Test: `tests/indulto-comutacao/tipos.spec.ts`

**Interfaces:**
- Consumes: `Tempo` de `tempo.ts`.
- Produces: `Entrada`, `Veredito`, `VEREDITOS`, `ResultadoInciso`, `Resumo`, `Resultado`, `MetaInciso`, `Campo`, `Secao`, `MotorDecreto`.

- [ ] **Step 1: Escrever o teste que falha**

Tipos somem em runtime; o que se testa é a constante que a UI usa para validar e rotular vereditos.

```ts
// tests/indulto-comutacao/tipos.spec.ts
import { describe, it, expect } from 'vitest'
import { VEREDITOS, ehVeredito } from '@/lib/indulto-comutacao/tipos'

describe('VEREDITOS', () => {
  it('traz os quatro estados do decreto, com rótulo de tela', () => {
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
    expect(ehVeredito(null)).toBe(false)
    expect(ehVeredito(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test tempo tipos
```

Esperado: FAIL — `Cannot find module '@/lib/indulto-comutacao/tipos'`.

- [ ] **Step 3: Implementar `tipos.ts`**

```ts
// src/lib/indulto-comutacao/tipos.ts
//
// Os contratos que TODO motor de decreto cumpre. Forma, nunca regra: nada
// aqui pode depender de um decreto específico.

import type { Tempo } from './tempo'

export type { Tempo }

/**
 * As respostas do questionário, como objeto plano.
 *
 * As CHAVES são definidas por cada decreto (em `questionario.ts`), porque o
 * questionário de um ano não serve para outro sem revisão. O tipo é aberto de
 * propósito; quem garante a correspondência entre chave e motor é o teste de
 * reconciliação da Task 7.
 */
export type Entrada = Record<string, string | number | Tempo | null | undefined>

export const VEREDITOS = {
  preenche: 'Preenche os requisitos',
  nao_preenche: 'Não preenche os requisitos',
  a_analisar: 'A analisar',
  sem_previsao: 'Sem previsão no Decreto',
} as const

export type Veredito = keyof typeof VEREDITOS

export function ehVeredito(v: unknown): v is Veredito {
  return typeof v === 'string' && v in VEREDITOS
}

/**
 * O resultado de um dispositivo.
 *
 * `geral` e `especial` são vereditos INDEPENDENTES: a regra especial do §2º
 * concede fração menor a quem se enquadra no perfil de vulnerabilidade. Onde o
 * decreto não prevê regra especial, `especial` é 'sem_previsao'.
 *
 * `quantum` e `penaApos` só aparecem nos dispositivos de comutação, e só quando
 * os requisitos são preenchidos. `null` significa ausência de valor — a planilha
 * devolvia #VALUE! aqui (bug L145:L149).
 */
export type ResultadoInciso = {
  id: string
  geral: Veredito
  especial: Veredito
  quantum?: number | null
  penaApos?: number | null
}

/** O painel de contexto que abre a tela de resultado, em dias (30/360). */
export type Resumo = {
  totalImposto: number
  totalCumprido: number
  cumpridoComputavel: number
  remanescente: number
  fracoes: { umQuinto: number; umQuarto: number; umTerco: number; metade: number }
}

export type Resultado = {
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
      padrao?: string
      ajuda?: string
    }

export type Secao = {
  id: string
  titulo: string
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
pnpm test tempo tipos
```

Esperado: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/tipos.ts tests/indulto-comutacao/tipos.spec.ts
git commit -m "Adiciona os contratos dos motores de decreto

Forma, nunca regra: Entrada, Veredito, ResultadoInciso, Resumo, Resultado,
MetaInciso, Campo, Secao e MotorDecreto. As chaves do questionário são
abertas de propósito — o questionário de um ano não serve para outro."
```

---

### Task 3: O registro de motores

O ponto onde um decreto novo é plugado. Um array de imports estáticos: varredura de diretório não sobrevive ao bundler do Next.

**Files:**
- Create: `src/lib/indulto-comutacao/registro.ts`
- Test: `tests/indulto-comutacao/registro.spec.ts`

**Interfaces:**
- Consumes: `MotorDecreto` de `tipos.ts`.
- Produces: `REGISTRO: MotorDecreto[]`; `motorPorId(id: string): MotorDecreto | null`; `motorPadrao(): MotorDecreto`.

- [ ] **Step 1: Escrever o teste que falha**

O teste de contrato roda sobre **todo** motor do registro — é ele que protege a entrada de 2024 e 2026.

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

  it('calcula com entrada vazia sem lançar, e só devolve inciso conhecido', () => {
    const r = motor.calcular({})
    const conhecidos = new Set(
      [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id),
    )
    expect(r.incisos.length).toBeGreaterThan(0)
    for (const inciso of r.incisos) {
      expect(conhecidos.has(inciso.id)).toBe(true)
      expect(ehVeredito(inciso.geral)).toBe(true)
      expect(ehVeredito(inciso.especial)).toBe(true)
    }
  })

  it('cobre com metadado todo inciso que o cálculo devolve', () => {
    const devolvidos = motor.calcular({}).incisos.map((i) => i.id)
    const comMeta = new Set(
      [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id),
    )
    expect(devolvidos.filter((id) => !comMeta.has(id))).toEqual([])
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

Esperado: FAIL — `Cannot find module '@/lib/indulto-comutacao/registro'`.

- [ ] **Step 3: Criar um motor de 2025 mínimo, só com a forma**

As Tasks 4, 5 e 7 preenchem este arquivo. Aqui ele existe para o registro ter o que registrar e para o teste de contrato ficar verde desde o começo.

```ts
// src/lib/indulto-comutacao/motores/2025/index.ts
import type { MotorDecreto } from '../../tipos'

/**
 * Decreto nº 12.970/2025 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
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
      descricao: 'Não entra no cálculo. Serve para você reconhecer o caso depois.',
      campos: [
        { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
      ],
    },
  ],
  incisos: {
    indulto: [
      {
        id: 'art9-i',
        rotulo: 'Art. 9º, I',
        descricao: 'Fração de pena cumprida.',
        temRegraEspecial: true,
      },
    ],
    comutacao: [],
  },
  avisos: {
    fixos: ['A ferramenta não dispensa conhecimento técnico sobre o assunto.'],
    validarJuridicamente: [
      'A "pena após a comutação" usa a pena total imposta como base do desconto, '
      + 'não a pena remanescente.',
    ],
  },
  calcular() {
    return {
      incisos: [{ id: 'art9-i', geral: 'nao_preenche', especial: 'sem_previsao' }],
      resumo: {
        totalImposto: 0,
        totalCumprido: 0,
        cumpridoComputavel: 0,
        remanescente: 0,
        fracoes: { umQuinto: 0, umQuarto: 0, umTerco: 0, metade: 0 },
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
// A ordem importa: o array vai do decreto mais recente para o mais antigo, e
// motorPadrao() devolve o primeiro.

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

Esperado: PASS — os testes de tempo, tipos e o contrato aplicado ao motor de 2025.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/registro.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/registro.spec.ts
git commit -m "Adiciona o registro de motores por decreto

Array de imports estáticos — varredura de diretório não sobrevive ao
bundler do Next. O teste de contrato roda sobre todo motor registrado: é
ele que protege 2025 quando 2024 e 2026 entrarem."
```

---

### Task 4: O questionário de 2025

As seções do questionário, extraídas do documento de contexto. As chaves aqui são a fronteira com o motor; a Task 7 reconcilia as duas pontas.

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/questionario.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/questionario-2025.spec.ts`

**Interfaces:**
- Consumes: `Secao`, `Campo` de `tipos.ts`.
- Produces: `QUESTIONARIO_2025: Secao[]`, com as 12 seções do decreto.

- [ ] **Step 1: Escrever o teste que falha**

Dois campos têm efeito de veto total e precisam nascer em SIM — o padrão errado bloquearia indulto e comutação inteiros, em silêncio. É a regra mais importante do questionário.

```ts
// tests/indulto-comutacao/questionario-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { QUESTIONARIO_2025 } from '@/lib/indulto-comutacao/motores/2025/questionario'

const campos = QUESTIONARIO_2025.flatMap((s) => s.campos)
const porChave = new Map(campos.map((c) => [c.chave, c]))

describe('QUESTIONARIO_2025', () => {
  it('cobre as seções temáticas do decreto', () => {
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

  it('separa as penas nas três categorias mutuamente exclusivas', () => {
    expect(porChave.get('penaImpeditiva')?.tipo).toBe('tempo')
    expect(porChave.get('penaComViolencia')?.tipo).toBe('tempo')
    expect(porChave.get('penaSemViolencia')?.tipo).toBe('tempo')
  })

  it('faz os dois vetos da data do fato nascerem em SIM', () => {
    // Responder NÃO bloqueia indulto E comutação inteiros. Se o padrão fosse
    // NÃO, todo cálculo começaria zerado sem o advogado entender por quê.
    const i18 = porChave.get('doisTercosImpeditivoDataFato')
    const i72 = porChave.get('fracaoViolentoDataDelito')
    expect(i18?.tipo).toBe('selecao')
    expect(i72?.tipo).toBe('selecao')
    if (i18?.tipo === 'selecao') expect(i18.padrao).toBe('SIM')
    if (i72?.tipo === 'selecao') expect(i72.padrao).toBe('SIM')
  })

  it('toda seleção declara suas opções e um padrão entre elas', () => {
    for (const campo of campos) {
      if (campo.tipo !== 'selecao') continue
      expect(campo.opcoes.length).toBeGreaterThan(0)
      if (campo.padrao !== undefined) {
        expect(campo.opcoes).toContain(campo.padrao)
      }
    }
  })

  it('não repete chave entre seções', () => {
    const chaves = campos.map((c) => c.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('dá rótulo a todo campo', () => {
    for (const campo of campos) expect(campo.rotulo.trim().length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test questionario
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o questionário**

As seções vêm da seção 4 do documento de contexto. Os campos de vulnerabilidade (§2º) ficam em `perfil`; as vedações automáticas em `historico-vedacoes`.

```ts
// src/lib/indulto-comutacao/motores/2025/questionario.ts
//
// O questionário do Decreto 12.970/2025.
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO. Não o compartilhe com 2024 ou 2026, mesmo
// que a maioria dos campos se repita: as regras, os incisos e os textos são
// específicos de cada decreto, e um campo movido daqui muda a tela já validada.
//
// Toda pergunta é apurada "em 25/12/2025" — a data-base do decreto.

import type { Secao } from '../../tipos'

const SIM_NAO = ['SIM', 'NÃO'] as const
const SIM_NAO_NA = ['SIM', 'NÃO', 'NÃO SE APLICA'] as const

export const QUESTIONARIO_2025: Secao[] = [
  {
    id: 'identificacao',
    titulo: 'Identificação',
    descricao:
      'Não entra no cálculo. Para não guardar o nome do sentenciado, use o nº de execução.',
    campos: [
      { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
      { tipo: 'texto', chave: 'numeroExecucao', rotulo: 'Nº de execução' },
      { tipo: 'texto', chave: 'unidadePrisional', rotulo: 'Unidade prisional' },
    ],
  },
  {
    id: 'penas-impostas',
    titulo: 'Penas impostas (em 25/12/2025)',
    descricao:
      'Some as penas em três categorias que não se sobrepõem. Crimes impeditivos '
      + '(hediondos e equiparados) nunca são objeto de indulto ou comutação, mas entram '
      + 'no cálculo da fração cumprida.',
    campos: [
      { tipo: 'tempo', chave: 'penaImpeditiva', rotulo: 'Total de penas de crimes IMPEDITIVOS' },
      { tipo: 'tempo', chave: 'penaComViolencia', rotulo: 'Total de penas COM violência ou grave ameaça' },
      { tipo: 'tempo', chave: 'penaSemViolencia', rotulo: 'Total de penas SEM violência' },
    ],
  },
  {
    id: 'pena-cumprida',
    titulo: 'Pena cumprida (até 25/12/2025)',
    campos: [
      { tipo: 'tempo', chave: 'cumpridoSeeu', rotulo: 'Total já considerado no SEEU' },
      {
        tipo: 'tempo',
        chave: 'cumpridoForaSeeu',
        rotulo: 'Total não lançado no SEEU',
        ajuda: 'Prisão cautelar, domiciliar, especial, recolhimento noturno.',
      },
    ],
  },
  {
    id: 'perfil',
    titulo: 'Perfil do sentenciado',
    descricao:
      'Os campos marcados com §2º compõem o perfil de vulnerabilidade, que concede '
      + 'fração menor em vários incisos do Art. 9º.',
    campos: [
      { tipo: 'selecao', chave: 'sexo', rotulo: 'Sexo', opcoes: ['MASCULINO', 'FEMININO'] },
      { tipo: 'data', chave: 'nascimento', rotulo: 'Data de nascimento' },
      { tipo: 'selecao', chave: 'reincidente', rotulo: 'Reincidente em 25/12/2025', opcoes: SIM_NAO },
      {
        tipo: 'selecao',
        chave: 'regime',
        rotulo: 'Regime prisional',
        opcoes: ['FECHADO', 'SEMIABERTO', 'ABERTO'],
      },
      { tipo: 'data', chave: 'ultimaPrisao', rotulo: 'Data da última prisão' },
      { tipo: 'numero', chave: 'remicaoDias', rotulo: 'Dias de remição após essa prisão' },
      { tipo: 'selecao', chave: 'gestante', rotulo: 'Gestante (§2º)', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'maeFilhoAte16', rotulo: 'Mãe de filho até 16 anos (§2º)', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'maeFilhoDeficiencia', rotulo: 'Mãe de filho com deficiência (§2º)', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'maeFilhoDoencaCronica', rotulo: 'Mãe de filho com doença crônica grave (§2º)', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'homemUnicoResponsavel', rotulo: 'Homem único responsável por filho nessas condições (§2º)', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'imprescindivelCuidados', rotulo: 'Imprescindível aos cuidados de criança (§2º)', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'pessoaComDeficiencia', rotulo: 'Pessoa com deficiência (§2º)', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'justicaRestaurativa', rotulo: 'Caso de justiça restaurativa (§2º)', opcoes: SIM_NAO },
    ],
  },
  {
    id: 'regime-situacao',
    titulo: 'Regime, tempo e situação prisional',
    campos: [
      { tipo: 'tempo', chave: 'tempoSemiaberto', rotulo: 'Tempo ininterrupto no semiaberto (com remição)' },
      { tipo: 'tempo', chave: 'tempoSemiabertoAberto', rotulo: 'Tempo ininterrupto somado de semiaberto + aberto' },
      { tipo: 'selecao', chave: 'livramentoCondicional', rotulo: 'Está em livramento condicional', opcoes: SIM_NAO },
      {
        tipo: 'selecao',
        chave: 'monitoramentoEletronico',
        rotulo: 'Está em monitoramento eletrônico (SV 56/STF)',
        opcoes: SIM_NAO,
      },
      {
        tipo: 'selecao',
        chave: 'tempoMonitoramento',
        rotulo: 'Há quanto tempo em monitoramento',
        opcoes: ['NÃO SE APLICA', 'MENOS DE 6 MESES', 'DE 6 A 12 MESES', 'MAIS DE 12 MESES'],
        padrao: 'NÃO SE APLICA',
      },
      { tipo: 'selecao', chave: 'programaEgressos', rotulo: 'Está em programa de acompanhamento de egressos', opcoes: SIM_NAO },
      {
        tipo: 'selecao',
        chave: 'tempoEgressos',
        rotulo: 'Há quanto tempo no programa de egressos',
        opcoes: ['NÃO SE APLICA', 'MENOS DE 6 MESES', 'DE 6 A 12 MESES', 'MAIS DE 12 MESES'],
        padrao: 'NÃO SE APLICA',
      },
    ],
  },
  {
    id: 'educacao-trabalho',
    titulo: 'Educação e trabalho',
    campos: [
      {
        tipo: 'selecao',
        chave: 'saidasOuTrabalhoExterno',
        rotulo: '5 saídas temporárias OU trabalho externo ≥ 12 meses nos últimos 3 anos',
        opcoes: SIM_NAO,
      },
      {
        tipo: 'selecao',
        chave: 'frequenciaCurso',
        rotulo: 'Frequência a curso em 25/12/2025',
        opcoes: ['NÃO', 'MENOS DE 6 MESES', 'DE 6 A 12 MESES', 'MAIS DE 12 MESES'],
        padrao: 'NÃO',
      },
      {
        tipo: 'selecao',
        chave: 'conclusaoCurso',
        rotulo: 'Conclusão de curso nos últimos 3 anos',
        opcoes: ['NÃO', 'FUNDAMENTAL', 'MÉDIO', 'SUPERIOR', 'PROFISSIONALIZANTE'],
        padrao: 'NÃO',
      },
    ],
  },
  {
    id: 'pessoais-familiares',
    titulo: 'Condições pessoais e familiares',
    campos: [
      {
        tipo: 'selecao',
        chave: 'condicaoGraveSaude',
        rotulo: 'Condição grave de saúde',
        opcoes: SIM_NAO,
        ajuda: 'Paraplegia, HIV terminal, gestação de alto risco, doença grave, TEA grau 3.',
      },
      { tipo: 'selecao', chave: 'filhoPrecisaCuidados', rotulo: 'O filho precisa dos cuidados da mãe', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'avoNetosDependentes', rotulo: 'Avó com netos dependentes', opcoes: SIM_NAO_NA },
    ],
  },
  {
    id: 'historico-vedacoes',
    titulo: 'Histórico e vedações',
    descricao:
      'Colaboração premiada, facção, RDD, presídio federal e falta grave no último ano '
      + 'bloqueiam todos os incisos de indulto e a comutação do Art. 11.',
    campos: [
      { tipo: 'selecao', chave: 'faltaGraveUltimoAno', rotulo: 'Falta grave entre 25/12/2024 e 25/12/2025', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'faltaGraveExecucao', rotulo: 'Falta grave em toda a execução', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'colaboracaoPremiada', rotulo: 'Colaboração premiada', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'faccaoCriminosa', rotulo: 'Integra facção criminosa', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'rdd', rotulo: 'Regime Disciplinar Diferenciado (RDD)', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'presidioFederal', rotulo: 'Presídio federal ou de segurança máxima', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'liberdadeMaisDeDoisAnos', rotulo: 'Período em liberdade superior a 2 anos', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'outroCrimeViolento', rotulo: 'Responde ou foi condenado por outro crime violento', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'crimeContraCrianca', rotulo: 'Crime violento contra criança ou adolescente', opcoes: SIM_NAO },
    ],
  },
  {
    id: 'aberto-restritiva',
    titulo: 'Regime aberto e restritiva de direitos',
    campos: [
      { tipo: 'selecao', chave: 'restritivaOuSursis', rotulo: 'Pena substituída por restritiva de direitos ou sursis', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'condenacaoRegimeAberto', rotulo: 'Condenação em regime aberto', opcoes: SIM_NAO },
    ],
  },
  {
    id: 'patrimonio-multa',
    titulo: 'Crime contra o patrimônio e pena de multa',
    campos: [
      { tipo: 'selecao', chave: 'crimePatrimonialSemViolencia', rotulo: 'Crime patrimonial sem violência', opcoes: SIM_NAO },
      { tipo: 'selecao', chave: 'reparacaoDano', rotulo: 'Reparação do dano (ou dispensa)', opcoes: SIM_NAO_NA },
      { tipo: 'selecao', chave: 'bemAteUmSalario', rotulo: 'Valor do bem não superior a um salário-mínimo à época do fato', opcoes: SIM_NAO_NA },
      { tipo: 'numero', chave: 'valorMulta', rotulo: 'Valor da pena de multa (R$)' },
      { tipo: 'selecao', chave: 'hipossuficiencia', rotulo: 'Hipossuficiência (Art. 12, §2º)', opcoes: SIM_NAO },
    ],
  },
  {
    id: 'data-do-fato',
    titulo: 'Requisitos da data do fato',
    descricao:
      '🔴 Responder NÃO em qualquer um dos dois bloqueia o indulto E a comutação inteiros. '
      + 'Por isso os dois nascem em SIM: mude apenas quando for o caso.',
    campos: [
      {
        tipo: 'selecao',
        chave: 'doisTercosImpeditivoDataFato',
        rotulo: 'Cumpridos 2/3 do crime impeditivo, contados da data do fato',
        opcoes: SIM_NAO,
        padrao: 'SIM',
      },
      {
        tipo: 'selecao',
        chave: 'fracaoViolentoDataDelito',
        rotulo: 'Cumprida a fração do crime violento a partir da data do delito',
        opcoes: SIM_NAO,
        padrao: 'SIM',
      },
    ],
  },
  {
    id: 'observacoes',
    titulo: 'Observações',
    descricao: 'Não entra no cálculo.',
    campos: [{ tipo: 'texto', chave: 'observacoes', rotulo: 'Observações' }],
  },
]
```

- [ ] **Step 4: Ligar o questionário ao motor**

Em `src/lib/indulto-comutacao/motores/2025/index.ts`, troque o questionário de exemplo pelo real:

```ts
import { QUESTIONARIO_2025 } from './questionario'
```

e substitua a propriedade `questionario: [...]` inteira por:

```ts
  questionario: QUESTIONARIO_2025,
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS. O teste de contrato da Task 3 agora valida o questionário real — inclusive a ausência de chave repetida entre as 12 seções.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/questionario.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/questionario-2025.spec.ts
git commit -m "Adiciona o questionário do Decreto 12.970/2025

As 12 seções temáticas do decreto. Os dois campos de requisito da data do
fato nascem em SIM porque têm efeito de veto total: o padrão errado
bloquearia indulto e comutação inteiros sem o advogado entender por quê."
```

---

### Task 5: Os metadados dos incisos e os avisos

O que a tela mostra em cada cartão, e os textos que aparecem sempre.

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/incisos.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/incisos-2025.spec.ts`

**Interfaces:**
- Consumes: `MetaInciso` de `tipos.ts`.
- Produces: `INCISOS_INDULTO_2025: MetaInciso[]`, `INCISOS_COMUTACAO_2025: MetaInciso[]`, `AVISOS_2025: { fixos: string[]; validarJuridicamente: string[] }`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/indulto-comutacao/incisos-2025.spec.ts
import { describe, it, expect } from 'vitest'
import {
  INCISOS_INDULTO_2025,
  INCISOS_COMUTACAO_2025,
  AVISOS_2025,
} from '@/lib/indulto-comutacao/motores/2025/incisos'

describe('incisos de indulto', () => {
  it('traz os 16 incisos do Art. 9º mais o Art. 10 e o Art. 12', () => {
    expect(INCISOS_INDULTO_2025).toHaveLength(18)
    expect(INCISOS_INDULTO_2025[0].id).toBe('art9-i')
    expect(INCISOS_INDULTO_2025.map((i) => i.id)).toContain('art9-xvi')
    expect(INCISOS_INDULTO_2025.map((i) => i.id)).toContain('art10')
    expect(INCISOS_INDULTO_2025.map((i) => i.id)).toContain('art12')
  })

  it('marca sem regra especial os incisos XII a XVI e os Arts. 10 e 12', () => {
    // O §2º não tem previsão para esses dispositivos — a tela mostra
    // "Sem previsão no Decreto" em vez de um veredito.
    const semEspecial = ['art9-xii', 'art9-xiii', 'art9-xiv', 'art9-xv', 'art9-xvi', 'art10', 'art12']
    for (const id of semEspecial) {
      const meta = INCISOS_INDULTO_2025.find((i) => i.id === id)
      expect(meta, `faltou o metadado de ${id}`).toBeDefined()
      expect(meta?.temRegraEspecial, `${id} não deveria ter regra especial`).toBe(false)
    }
  })

  it('marca com regra especial os incisos I a XI', () => {
    const comEspecial = ['art9-i', 'art9-ii', 'art9-iii', 'art9-iv', 'art9-v', 'art9-vi',
      'art9-vii', 'art9-viii', 'art9-ix', 'art9-x', 'art9-xi']
    for (const id of comEspecial) {
      expect(INCISOS_INDULTO_2025.find((i) => i.id === id)?.temRegraEspecial).toBe(true)
    }
  })
})

describe('incisos de comutação', () => {
  it('traz os três do Art. 11, o Art. 13 e o Art. 13 §4º', () => {
    expect(INCISOS_COMUTACAO_2025.map((i) => i.id)).toEqual([
      'art11-i', 'art11-ii', 'art11-iii', 'art13', 'art13-p4',
    ])
  })
})

describe('avisos', () => {
  it('traz as duas ambiguidades jurídicas para validar', () => {
    expect(AVISOS_2025.validarJuridicamente).toHaveLength(2)
    expect(AVISOS_2025.validarJuridicamente.join(' ')).toMatch(/pena total imposta/i)
    expect(AVISOS_2025.validarJuridicamente.join(' ')).toMatch(/remanescente/i)
  })

  it('traz as quatro notas fixas do documento', () => {
    expect(AVISOS_2025.fixos).toHaveLength(4)
    expect(AVISOS_2025.fixos.join(' ')).toMatch(/impeditivos/i)
  })

  it('dá rótulo e descrição a todo inciso', () => {
    for (const meta of [...INCISOS_INDULTO_2025, ...INCISOS_COMUTACAO_2025]) {
      expect(meta.rotulo.trim().length).toBeGreaterThan(0)
      expect(meta.descricao.trim().length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test incisos
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar os metadados**

```ts
// src/lib/indulto-comutacao/motores/2025/incisos.ts
//
// O que a tela mostra em cada cartão do Decreto 12.970/2025.
//
// `temRegraEspecial: false` significa que o §2º NÃO TEM PREVISÃO para aquele
// dispositivo — a tela mostra "Sem previsão no Decreto", que é diferente de
// "não preenche os requisitos".

import type { MetaInciso } from '../../tipos'

export const INCISOS_INDULTO_2025: MetaInciso[] = [
  { id: 'art9-i', rotulo: 'Art. 9º, I', descricao: 'Fração de pena cumprida — não alcança crime com violência ou grave ameaça.', temRegraEspecial: true },
  { id: 'art9-ii', rotulo: 'Art. 9º, II', descricao: 'Fração de pena cumprida por reincidente — não alcança crime com violência ou grave ameaça.', temRegraEspecial: true },
  { id: 'art9-iii', rotulo: 'Art. 9º, III', descricao: 'Fração de pena cumprida, crime com violência ou grave ameaça.', temRegraEspecial: true },
  { id: 'art9-iv', rotulo: 'Art. 9º, IV', descricao: 'Tempo ininterrupto em regime, contado em dias de calendário desde a última prisão.', temRegraEspecial: true },
  { id: 'art9-v', rotulo: 'Art. 9º, V', descricao: 'Cumprimento em regime semiaberto por tempo ininterrupto.', temRegraEspecial: true },
  { id: 'art9-vi', rotulo: 'Art. 9º, VI', descricao: 'Cumprimento somado em regime semiaberto e aberto.', temRegraEspecial: true },
  { id: 'art9-vii', rotulo: 'Art. 9º, VII', descricao: 'Livramento condicional em curso.', temRegraEspecial: true },
  { id: 'art9-viii', rotulo: 'Art. 9º, VIII', descricao: 'Pena restritiva de direitos ou sursis.', temRegraEspecial: true },
  { id: 'art9-ix', rotulo: 'Art. 9º, IX', descricao: 'Monitoramento eletrônico (Súmula Vinculante 56/STF).', temRegraEspecial: true },
  { id: 'art9-x', rotulo: 'Art. 9º, X', descricao: 'Programa de acompanhamento de egressos.', temRegraEspecial: true },
  { id: 'art9-xi', rotulo: 'Art. 9º, XI', descricao: 'Educação e trabalho: saídas temporárias, trabalho externo ou curso.', temRegraEspecial: true },
  { id: 'art9-xii', rotulo: 'Art. 9º, XII', descricao: 'Condição pessoal ou familiar.', temRegraEspecial: false },
  { id: 'art9-xiii', rotulo: 'Art. 9º, XIII', descricao: 'Pessoa com deficiência ou condição grave de saúde.', temRegraEspecial: false },
  { id: 'art9-xiv', rotulo: 'Art. 9º, XIV', descricao: 'Crime patrimonial sem violência — não alcança crime com violência ou grave ameaça.', temRegraEspecial: false },
  { id: 'art9-xv', rotulo: 'Art. 9º, XV', descricao: 'Crime patrimonial de pequeno valor — não alcança crime com violência ou grave ameaça.', temRegraEspecial: false },
  { id: 'art9-xvi', rotulo: 'Art. 9º, XVI', descricao: 'Condenação em regime aberto.', temRegraEspecial: false },
  { id: 'art10', rotulo: 'Art. 10', descricao: 'Indulto especial às mulheres presas, com requisitos cumulativos próprios.', temRegraEspecial: false },
  { id: 'art12', rotulo: 'Art. 12', descricao: 'Indulto coletivo a condenados a pena de multa.', temRegraEspecial: false },
]

export const INCISOS_COMUTACAO_2025: MetaInciso[] = [
  { id: 'art11-i', rotulo: 'Art. 11, I', descricao: 'Comutação de 1/4 a mulheres. Só para crimes sem violência ou grave ameaça.', temRegraEspecial: false },
  { id: 'art11-ii', rotulo: 'Art. 11, II', descricao: 'Comutação de 2/3 a mulheres. Só para crimes sem violência ou grave ameaça.', temRegraEspecial: false },
  { id: 'art11-iii', rotulo: 'Art. 11, III', descricao: 'Comutação de 1/2 a mulheres. Só para crimes sem violência ou grave ameaça.', temRegraEspecial: false },
  { id: 'art13', rotulo: 'Art. 13', descricao: 'Comutação geral: 1/5 para não reincidente, 1/4 para reincidente.', temRegraEspecial: false },
  { id: 'art13-p4', rotulo: 'Art. 13, §4º', descricao: 'Comutação de 2/3 para o perfil de vulnerabilidade do §2º.', temRegraEspecial: false },
]

export const AVISOS_2025 = {
  fixos: [
    'A ferramenta não dispensa conhecimento técnico sobre o assunto.',
    'Crimes impeditivos nunca são atingidos por indulto ou comutação.',
    'O indulto do Art. 9º (I, II, XIV e XV) e do Art. 10 não alcança crimes cometidos com '
      + 'violência ou grave ameaça.',
    'A comutação do Art. 11 só é calculada para crimes sem violência ou grave ameaça.',
  ],
  validarJuridicamente: [
    'A "pena após a comutação" usa a PENA TOTAL IMPOSTA como base do desconto, não a pena '
      + 'remanescente. Uma leitura mais rigorosa poderia sustentar que a comutação deveria '
      + 'incidir sobre o que resta cumprir.',
    'A comutação do Art. 13 e do §4º usa o MAIOR VALOR entre pena cumprida e pena '
      + 'remanescente como base do quantum, quando tecnicamente incidiria sobre a pena '
      + 'remanescente.',
  ],
}
```

- [ ] **Step 4: Ligar ao motor**

Em `src/lib/indulto-comutacao/motores/2025/index.ts`, acrescente o import:

```ts
import { INCISOS_INDULTO_2025, INCISOS_COMUTACAO_2025, AVISOS_2025 } from './incisos'
```

e substitua as propriedades `incisos` e `avisos` inteiras por:

```ts
  incisos: { indulto: INCISOS_INDULTO_2025, comutacao: INCISOS_COMUTACAO_2025 },
  avisos: AVISOS_2025,
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm test
```

Esperado: PASS. O `calcular()` provisório ainda devolve só `art9-i`, que tem metadado — o
teste "cobre com metadado todo inciso que o cálculo devolve" fica verde. Ele só passa a
exercer os 23 dispositivos quando o motor real entrar, na Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/incisos.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/incisos-2025.spec.ts
git commit -m "Adiciona os metadados dos incisos e os avisos de 2025

18 dispositivos de indulto e 5 de comutação. Os incisos XII a XVI e os
Arts. 10 e 12 ficam marcados como sem regra especial: o §2º não tem
previsão para eles, o que é diferente de não preencher requisitos."
```

---

### Task 6: Porte do motor de 2025 ⛔ BLOQUEADA

**Depende de:** `engine.js` da POC, colocado em `validacao/2025/engine.js` (referência de porte, não entra no build).

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/motor.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`
- Test: `tests/indulto-comutacao/reconciliacao-2025.spec.ts`

**Interfaces:**
- Consumes: `Entrada`, `Resultado` de `tipos.ts`; `dias`, `diasCorridos` de `tempo.ts`; `QUESTIONARIO_2025`.
- Produces: `calcular2025(entrada: Entrada): Resultado`; `CHAVES_CONSUMIDAS: readonly string[]`.

- [ ] **Step 1: Colocar o `engine.js` no lugar**

```bash
mkdir -p validacao/2025
# copie o engine.js da POC para validacao/2025/engine.js
ls -la validacao/2025/engine.js
```

- [ ] **Step 2: Portar, bloco por bloco, sem refatorar**

Regras do porte, nesta ordem de prioridade:

1. **Mesma ordem de blocos** do `engine.js`. Não reorganize.
2. **Mesmos nomes de variável** (`N6`, `N7`, `N8`, `N9`, `D6`, `N13`, `N16`, `P14`, `P17`, `gates4`, `gates5`, `hediondo`, `i18ok`, `i72ok`, `elegivelP`, `qOk`, `temPenaNaoImped`).
3. **Comentários de célula preservados** (`linha 75`, `G149`, `L145:L149`).
4. Tipos entram na assinatura de `calcular2025` e nos tipos de retorno. **Não** no miolo.
5. Cada inciso devolve `{ id, geral, especial }` com os ids de `incisos.ts`.
6. Os dois bugs corrigidos ganham comentário no formato:

```ts
// ⚠️ BUG DA PLANILHA, CORRIGIDO AQUI — L145:L149
// A planilha devolve #VALUE! quando não há comutação aplicável, porque a
// fórmula opera sobre uma célula vazia. Aqui devolvemos null (ausência de
// valor), que fmtDias() renderiza como travessão.
```

7. As duas ambiguidades jurídicas ganham comentário no formato:

```ts
// ⚖️ AMBIGUIDADE JURÍDICA PRESERVADA — não "conserte"
// A base do desconto é a pena TOTAL IMPOSTA, não a remanescente. Herdado da
// planilha de propósito e exibido ao advogado em "Pontos a validar
// juridicamente". Mudar isto sem validação dos autores do método altera um
// número que vai para petição.
```

8. No fim do arquivo, exporte a lista de chaves que o motor de fato lê:

```ts
/**
 * Toda chave de `Entrada` que este motor consome.
 *
 * Existe para o teste de reconciliação: uma chave que o questionário coleta e
 * o motor ignora é uma pergunta inútil na tela; uma que o motor lê e o
 * questionário não coleta é um cálculo que silenciosamente usa `undefined`.
 */
export const CHAVES_CONSUMIDAS = [
  // Uma por linha, na ordem em que o motor as lê. Exemplo do formato, com as
  // chaves que o bloco de penas e o de vedações já consomem:
  'penaImpeditiva',
  'penaComViolencia',
  'penaSemViolencia',
  'cumpridoSeeu',
  'cumpridoForaSeeu',
  'reincidente',
  'colaboracaoPremiada',
  'faccaoCriminosa',
  'rdd',
  'presidioFederal',
  'faltaGraveUltimoAno',
  'doisTercosImpeditivoDataFato',
  'fracaoViolentoDataDelito',
  // … acrescente cada chave restante conforme portar os demais blocos.
  // O teste do Step 3 falha enquanto a lista não bater com o questionário,
  // nos dois sentidos — é ele que diz quando terminou.
] as const
```

A lista não é documentação: é o que o teste do próximo passo confere. Uma chave a menos aqui
e o teste acusa "o motor lê o que ninguém pergunta"; uma a mais e ele acusa "pergunta sem uso
no motor".

- [ ] **Step 3: Escrever o teste de reconciliação**

```ts
// tests/indulto-comutacao/reconciliacao-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { CHAVES_CONSUMIDAS } from '@/lib/indulto-comutacao/motores/2025/motor'
import { QUESTIONARIO_2025 } from '@/lib/indulto-comutacao/motores/2025/questionario'

// Campos que existem só para o advogado reconhecer o caso — nunca entram no cálculo.
const SO_DOCUMENTAL = new Set(['sentenciado', 'numeroExecucao', 'unidadePrisional', 'observacoes'])

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

- [ ] **Step 4: Ligar o motor ao módulo do decreto**

Em `index.ts`, importe e substitua o `calcular()` provisório:

```ts
import { calcular2025 } from './motor'
```

```ts
  calcular: calcular2025,
```

E suba a versão para `'1.0.0'`.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
pnpm test
```

Esperado: PASS. O teste de contrato da Task 3 agora exerce o motor real — inclusive "calcula com entrada vazia sem lançar", que pega acesso a propriedade de `undefined`.

- [ ] **Step 6: Conferir os tipos**

```bash
pnpm exec tsc --noEmit
```

Esperado: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2025/motor.ts src/lib/indulto-comutacao/motores/2025/index.ts tests/indulto-comutacao/reconciliacao-2025.spec.ts validacao/2025/engine.js
git commit -m "Porta o motor do Decreto 12.970/2025

Porte literal do engine.js da POC: mesma ordem de blocos, mesmos nomes de
variável e comentários de célula da planilha preservados. A correspondência
com a planilha é o que mantém auditável a comparação contra o oráculo.

Os dois bugs da planilha ficam corrigidos e marcados em comentário; as duas
ambiguidades jurídicas ficam preservadas e marcadas."
```

---

### Task 7: O oráculo e a regressão ⛔ BLOQUEADA

**Depende de:** a planilha Excel do GPS da Pena em `validacao/2025/planilha.xlsx` e o `scenarios.json` em `validacao/2025/cenarios.json`.

Esta é a tarefa que prova que o porte está certo. **Portão: zero divergências** fora dos dois bugs documentados.

**Files:**
- Create: `validacao/README.md`, `validacao/oraculo.py`, `validacao/requirements.txt`
- Create: `tests/indulto-comutacao/motor-2025.spec.ts`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `calcular2025` da Task 6.
- Produces: `validacao/2025/esperado.json` — o congelado que vira regressão.

- [ ] **Step 1: Manter a validação fora da imagem Docker**

`validacao/` é versionada (proveniência: qual planilha validou qual motor) mas não tem papel em runtime. Acrescente ao fim do `.dockerignore`:

```
# A validação do motor da calculadora: planilha original, harness Python e cenários.
# Versionada no repositório por proveniência, mas sem papel em runtime — o motor já é
# código. Fora daqui, a planilha viajaria para dentro da imagem.
validacao
```

- [ ] **Step 2: Declarar a dependência do harness**

```
# validacao/requirements.txt
formulas==1.2.10
```

- [ ] **Step 3: Escrever o oráculo**

```python
# validacao/oraculo.py
"""Avalia a planilha original e congela o resultado esperado de cada cenário.

A biblioteca `formulas` interpreta o .xlsx e calcula suas fórmulas sem Excel nem
LibreOffice instalados. Ela é um SEGUNDO implementador do mesmo problema, que não
conhece o motor em TypeScript — é isso que torna a comparação uma evidência.

Uso:
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r validacao/requirements.txt
    python validacao/oraculo.py 2025
"""

import json
import sys
from pathlib import Path

import formulas

RAIZ = Path(__file__).resolve().parent


def avaliar(ano: str) -> None:
    base = RAIZ / ano
    planilha = base / "planilha.xlsx"
    cenarios = json.loads((base / "cenarios.json").read_text(encoding="utf-8"))

    modelo = formulas.ExcelModel().loads(str(planilha)).finish()

    esperado = []
    for cenario in cenarios:
        # `entradas` mapeia célula -> valor; `saidas` lista as células a ler.
        # Os dois vêm do cenarios.json da POC, que já traz a referência de célula.
        solucao = modelo.calculate(inputs=cenario["entradas"])
        esperado.append({
            "nome": cenario["nome"],
            "entrada": cenario["entrada"],
            "saidas": {
                celula: desembrulhar(solucao[celula]) for celula in cenario["saidas"]
            },
        })

    destino = base / "esperado.json"
    destino.write_text(
        json.dumps(esperado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"✓ {len(esperado)} cenários congelados em {destino}")


def desembrulhar(valor):
    """`formulas` devolve arrays numpy de 1 elemento; o JSON quer o escalar."""
    try:
        return valor.value[0, 0].item()
    except AttributeError:
        return valor


if __name__ == "__main__":
    avaliar(sys.argv[1] if len(sys.argv) > 1 else "2025")
```

- [ ] **Step 4: Rodar o oráculo**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r validacao/requirements.txt
python validacao/oraculo.py 2025
```

Esperado: `validacao/2025/esperado.json` criado, com um objeto por cenário.

Se `formulas` falhar ao ler alguma fórmula, **não contorne editando a planilha**: anote a fórmula, reduza o cenário e trate como achado — uma fórmula que o oráculo não entende é exatamente o tipo de lugar onde o porte pode estar errado.

- [ ] **Step 5: Escrever o teste de regressão**

```ts
// tests/indulto-comutacao/motor-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'

type Cenario = {
  nome: string
  entrada: Record<string, unknown>
  saidas: Record<string, unknown>
}

// O congelado do oráculo. Se este arquivo não existe, rode:
//   python validacao/oraculo.py 2025
const cenarios: Cenario[] = JSON.parse(
  readFileSync(new URL('../../validacao/2025/esperado.json', import.meta.url), 'utf8'),
)

describe('motor 2025 contra a planilha original', () => {
  it('tem cenários para comparar', () => {
    expect(cenarios.length).toBeGreaterThan(0)
  })

  it.each(cenarios.map((c) => [c.nome, c] as const))('%s', (_nome, cenario) => {
    const obtido = calcular2025(cenario.entrada as never)

    // `mapear` traduz a célula da planilha para o caminho no Resultado.
    // Mantenha-o ao lado do porte: ele é a mesma correspondência que os
    // comentários de célula do motor.ts documentam.
    for (const [celula, esperado] of Object.entries(cenario.saidas)) {
      expect(mapear(obtido, celula), `célula ${celula}`).toEqual(esperado)
    }
  })
})

function mapear(resultado: ReturnType<typeof calcular2025>, celula: string): unknown {
  // Uma linha por célula que o cenarios.json lê. Há três formatos, um por tipo
  // de saída da planilha — copie o que corresponder:
  const rota: Record<string, () => unknown> = {
    // resumo de tempos
    N9: () => resultado.resumo.totalImposto,
    N13: () => resultado.resumo.totalCumprido,
    N16: () => resultado.resumo.remanescente,
    // veredito de um inciso (a planilha guarda geral e especial em colunas vizinhas)
    G75: () => resultado.incisos.find((i) => i.id === 'art9-i')?.geral,
    H75: () => resultado.incisos.find((i) => i.id === 'art9-i')?.especial,
    // quantum e pena após, nos dispositivos de comutação
    G149: () => resultado.incisos.find((i) => i.id === 'art13-p4')?.quantum,
    L145: () => resultado.incisos.find((i) => i.id === 'art13')?.penaApos,
  }
  const ler = rota[celula]
  if (!ler) throw new Error(`célula ${celula} sem mapeamento em mapear()`)
  return ler()
}
```

- [ ] **Step 6: Rodar e reconciliar até zerar**

```bash
pnpm test motor-2025
```

Cada divergência é uma de três coisas, e a ordem de suspeita é esta:

1. **Erro de porte** — o caso mais provável. Corrija o `motor.ts`.
2. **Um dos dois bugs conhecidos** (`L145:L149`, `G149`) — esperado; ajuste o cenário para registrar o valor corrigido e deixe um comentário citando o bug.
3. **Bug novo da planilha** — **pare e relate ao dono do produto**. Não decida sozinho: a planilha é a fonte de verdade jurídica e corrigi-la é decisão dos autores do método.

**Portão: a suíte precisa ficar inteiramente verde antes da Task 8.**

- [ ] **Step 7: Escrever o README da validação**

```markdown
<!-- validacao/README.md -->
# Validação dos motores

Prova que um motor portado calcula o mesmo que a planilha original do GPS da Pena.

## Por que existe

Um motor de decreto tem dezenas de frações e condições. Um `>=` que virou `>`, ou um
1/5 que virou 1/6, não quebra teste, não aparece na tela e produz um número plausível
— que vai para uma petição. A única defesa é comparar contra um implementador
independente.

A biblioteca `formulas` interpreta o `.xlsx` e calcula suas fórmulas sem Excel nem
LibreOffice. Ela não conhece o motor em TypeScript: é isso que torna a comparação
uma evidência, e não uma repetição.

## Como rodar

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r validacao/requirements.txt
python validacao/oraculo.py 2025
pnpm test motor-2025
```

## Quando rodar

Quando um motor nasce, e quando uma fórmula dele muda. **Não é teste de cada commit:**
o `esperado.json` fica congelado no repositório e a regressão em Vitest roda sozinha,
rápida, sem Python e sem planilha.

## O que NÃO fazer

- **Não edite a planilha para o oráculo passar.** Ela é a fonte de verdade jurídica.
  Fórmula que o `formulas` não entende é achado, não obstáculo.
- **Não "conserte" divergência mexendo no `esperado.json`.** O caminho é o `motor.ts`.
- **Não resolva ambiguidade jurídica sozinho.** As duas conhecidas estão marcadas no
  `motor.ts` com ⚖️ e são exibidas ao advogado. Uma terceira é assunto para os autores
  do método.

## Esta pasta não entra na imagem Docker

`validacao` está no `.dockerignore`. Ela é versionada por proveniência — saber qual
planilha validou qual versão de qual motor —, mas não tem papel em runtime.
```

- [ ] **Step 8: Commit**

```bash
git add validacao .dockerignore tests/indulto-comutacao/motor-2025.spec.ts
git commit -m "Valida o motor de 2025 contra a planilha original

Harness Python com a lib formulas como oráculo independente, cenário a
cenário, com zero divergências fora dos dois bugs documentados. O
esperado.json fica congelado e vira a regressão em Vitest — rápida, sem
Python e sem planilha.

validacao/ entra no .dockerignore: versionada por proveniência, sem papel
em runtime."
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
        <div><span>Cumprido computável nos impeditivos</span><b>{fmtDias(resultado.resumo.cumpridoComputavel)}</b></div>
        <div><span>Pena remanescente</span><b>{fmtDias(resultado.resumo.remanescente)}</b></div>
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
