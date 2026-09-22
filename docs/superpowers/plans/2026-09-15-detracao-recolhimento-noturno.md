# Detração por Recolhimento Noturno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a calculadora de Detração por Recolhimento Noturno como novo produto vendável, com motor de cálculo puro, persistência por membro, rota própria, menu atualizado ("Calculadoras" → "Detração" → "Recolhimento Noturno") e documentação de lógica versionada.

**Architecture:** Nova família de produto `detracao`, independente da rota/motor do CIC. Motor puro (`src/lib/detracao/recolhimento-noturno/`) que soma intervalos de recolhimento noturno/folga integral, consolida sobreposições e converte em dias de 24h. Rota própria `/ferramentas/detracao/recolhimento-noturno`, mesma casca de tela (formulário + resultado ao vivo + salvar/excluir) e mesmo padrão de acesso por venda que o CIC já usa.

**Tech Stack:** Next.js App Router (RSC + client components), TypeScript, Zod, Supabase/Postgres (RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md`

## Global Constraints

- Versão do algoritmo: `RN-1.0` (constante `ALGORITMO_VERSAO`).
- Timezone default: `America/Sao_Paulo`; datas/horas são sempre locais da decisão (sem conversão real de fuso — ver §12 da spec, decisão deliberada por não haver DST no Brasil hoje).
- `dias = floor(total_minutos / 1440)`; saldo `= total_minutos % 1440`; saldo **nunca** arredonda para cima nem vira dia.
- Toda duração em **inteiros** (minutos na saída, milissegundos internamente) — nunca `float`.
- Intervalos são **semiabertos** `[início, fim)`.
- `monitoramento_eletronico` é **só metadado** — o motor nunca lê esse campo para decidir o cálculo.
- Nunca excluir automaticamente um período por falta de monitoramento — só exclusões que o usuário informar explicitamente, com motivo.
- `00:00–00:00` (início igual ao fim) no horário noturno é **rejeitado** como ambíguo — dia inteiro é sempre `diasFolgaIntegral`/`feriadosIntegral` explícito, nunca inferido do horário.
- RLS da tabela nova: só `select`, restrito ao próprio membro (`e_membro(workspace_id) and user_id = auth.uid()`); toda escrita passa por server action com `admin()` (service-role).
- O cliente manda sempre a **entrada**, nunca o resultado — quem calcula o que vai para o banco é sempre o servidor.

---

## Task 1: Tipos do domínio e helpers de intervalo

**Files:**
- Create: `src/lib/detracao/recolhimento-noturno/tipos.ts`
- Create: `src/lib/detracao/recolhimento-noturno/intervalos.ts`
- Test: `tests/detracao/recolhimento-noturno/intervalos.spec.ts`

**Interfaces:**
- Produces: `WEEKDAYS`, `Weekday`, `ROTULOS_DIA_SEMANA`, `ALGORITMO_VERSAO`, `Intervalo`, `IntervaloComMotivo`, `SegmentoRegra`, `EntradaCalculo`, `ResultadoCalculo` (tipos.ts); `Faixa`, `paraInstante(iso)`, `paraInstanteDeData(data, hora)`, `somarDias(ms, dias)`, `proximoDia(data)`, `formatarInstante(ms)`, `intersectar(a,b)`, `mergeIntervalos(faixas)`, `subtrairIntervalos(faixas, excluidas)`, `duracaoMinutos(faixas)` (intervalos.ts).

- [ ] **Step 1: Escrever `tipos.ts`**

```ts
// src/lib/detracao/recolhimento-noturno/tipos.ts
//
// Os contratos do domínio de detração por recolhimento noturno. Forma, sem regra de negócio —
// quem soma e converte é `motor.ts`.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const ROTULOS_DIA_SEMANA: Record<Weekday, string> = {
  MON: 'Segunda',
  TUE: 'Terça',
  WED: 'Quarta',
  THU: 'Quinta',
  FRI: 'Sexta',
  SAT: 'Sábado',
  SUN: 'Domingo',
}

/** A versão do algoritmo, gravada em cada cálculo salvo — o que permite avisar o membro quando
 *  uma correção de fórmula muda um número que ele já usou (ver `[id]/page.tsx`). */
export const ALGORITMO_VERSAO = 'RN-1.0' as const

/** Sempre `[início, fim)` — semiaberto, para que o instante final não conte duas vezes quando
 *  dois períodos são contíguos. Strings ISO `YYYY-MM-DDTHH:MM[:SS]`, sem fuso. */
export type Intervalo = { inicio: string; fim: string }
export type IntervaloComMotivo = Intervalo & { motivo: string }

export type SegmentoRegra = {
  /** Janela de vigência deste segmento — `[inicio, fim)`. */
  inicio: string
  fim: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]
  intervalosAdicionais: Intervalo[]
  intervalosExcluidos: IntervaloComMotivo[]
}

export type EntradaCalculo = {
  timezone: string
  segmentos: SegmentoRegra[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

export type ResultadoCalculo = {
  totalMinutos: number
  totalHoras: string
  diasDetracao: number
  saldoMinutos: number
  saldoHoras: string
  intervalosConsolidados: Intervalo[]
  intervalosExcluidos: IntervaloComMotivo[]
  algoritmoVersao: typeof ALGORITMO_VERSAO
}
```

- [ ] **Step 2: Escrever `intervalos.ts`**

```ts
// src/lib/detracao/recolhimento-noturno/intervalos.ts
//
// Funções puras sobre o eixo do tempo. Nada aqui sabe o que é "noite" ou "folga integral" — isso
// é do `motor.ts`. `Faixa` trabalha em milissegundos (eixo "ingênuo", sem fuso: ver Global
// Constraints do plano) para que a aritmética de sobreposição seja trivial e exata.

export type Faixa = { inicio: number; fim: number }

export function paraInstante(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso)
  if (!m) throw new Error(`data/hora inválida: ${iso}`)
  const [, ano, mes, dia, h, min, s] = m
  return Date.UTC(Number(ano), Number(mes) - 1, Number(dia), Number(h), Number(min), Number(s ?? 0))
}

export function paraInstanteDeData(dataISO: string, hora: string): number {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  const mh = /^(\d{2}):(\d{2})$/.exec(hora)
  if (!md || !mh) throw new Error(`data ou hora inválida: ${dataISO} ${hora}`)
  return Date.UTC(Number(md[1]), Number(md[2]) - 1, Number(md[3]), Number(mh[1]), Number(mh[2]), 0)
}

export function somarDias(instanteMs: number, dias: number): number {
  return instanteMs + dias * 86_400_000
}

export function proximoDia(dataISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  if (!m) throw new Error(`data inválida: ${dataISO}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

export function formatarInstante(instanteMs: number): string {
  const d = new Date(instanteMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** `null` quando as duas faixas não se tocam — fiel ao `[início, fim)` semiaberto: fronteiras
 *  encostadas (`a.fim === b.inicio`) não geram interseção. */
export function intersectar(a: Faixa, b: Faixa): Faixa | null {
  const inicio = Math.max(a.inicio, b.inicio)
  const fim = Math.min(a.fim, b.fim)
  return fim > inicio ? { inicio, fim } : null
}

function ordenarPorInicio(faixas: Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => a.inicio - b.inicio)
}

/** `mergeIntervals` do §5.3 do plano, ao pé da letra: sem isto, "sexta 22h–sábado 6h" +
 *  "sábado integral" contaria as 6 primeiras horas de sábado duas vezes. */
export function mergeIntervalos(faixas: Faixa[]): Faixa[] {
  const ordenadas = ordenarPorInicio(faixas)
  const unidas: Faixa[] = []
  for (const atual of ordenadas) {
    const ultima = unidas[unidas.length - 1]
    if (!ultima || atual.inicio > ultima.fim) {
      unidas.push({ ...atual })
    } else if (atual.fim > ultima.fim) {
      ultima.fim = atual.fim
    }
  }
  return unidas
}

/** Recorta `excluidas` de `faixas`, inclusive quando a exclusão cai no meio de uma faixa (parte
 *  em dois pedaços) ou cruza a borda dela (corta só o pedaço que sobrepõe). */
export function subtrairIntervalos(faixas: Faixa[], excluidas: Faixa[]): Faixa[] {
  if (excluidas.length === 0) return faixas
  const excluidasUnidas = mergeIntervalos(excluidas)
  let resultado = faixas
  for (const exclusao of excluidasUnidas) {
    const proximo: Faixa[] = []
    for (const faixa of resultado) {
      if (exclusao.fim <= faixa.inicio || exclusao.inicio >= faixa.fim) {
        proximo.push(faixa)
        continue
      }
      if (exclusao.inicio > faixa.inicio) {
        proximo.push({ inicio: faixa.inicio, fim: Math.min(exclusao.inicio, faixa.fim) })
      }
      if (exclusao.fim < faixa.fim) {
        proximo.push({ inicio: Math.max(exclusao.fim, faixa.inicio), fim: faixa.fim })
      }
    }
    resultado = proximo
  }
  return resultado
}

/** Sempre inteiro: as faixas vêm de horas `HH:MM` (sem segundos), então o total em ms é sempre
 *  múltiplo de 60 000 — o `floor` aqui é exatidão, não arredondamento. */
export function duracaoMinutos(faixas: Faixa[]): number {
  const totalMs = faixas.reduce((soma, f) => soma + (f.fim - f.inicio), 0)
  return Math.floor(totalMs / 60_000)
}
```

- [ ] **Step 3: Escrever o teste de `intervalos.ts`**

```ts
// tests/detracao/recolhimento-noturno/intervalos.spec.ts
import { describe, it, expect } from 'vitest'
import {
  paraInstante,
  paraInstanteDeData,
  somarDias,
  proximoDia,
  formatarInstante,
  intersectar,
  mergeIntervalos,
  subtrairIntervalos,
  duracaoMinutos,
} from '@/lib/detracao/recolhimento-noturno/intervalos'

describe('intervalos — funções puras', () => {
  it('converte data+hora em instante e formata de volta', () => {
    const ms = paraInstanteDeData('2026-01-02', '22:00')
    expect(formatarInstante(ms)).toBe('2026-01-02T22:00:00')
  })

  it('paraInstante aceita datetime com e sem segundos', () => {
    expect(paraInstante('2026-01-02T22:00')).toBe(paraInstante('2026-01-02T22:00:00'))
  })

  it('somarDias avança 24h por dia', () => {
    const a = paraInstanteDeData('2026-01-02', '22:00')
    expect(formatarInstante(somarDias(a, 1))).toBe('2026-01-03T22:00:00')
  })

  it('proximoDia atravessa virada de mês e de ano', () => {
    expect(proximoDia('2026-01-31')).toBe('2026-02-01')
    expect(proximoDia('2026-12-31')).toBe('2027-01-01')
  })

  it('intersectar corta pelas duas pontas, e devolve null sem sobreposição real', () => {
    expect(intersectar({ inicio: 0, fim: 100 }, { inicio: 50, fim: 150 })).toEqual({ inicio: 50, fim: 100 })
    expect(intersectar({ inicio: 0, fim: 10 }, { inicio: 10, fim: 20 })).toBeNull()
  })

  it('mergeIntervalos une sobrepostos e contíguos, mas preserva lacunas reais', () => {
    const unidos = mergeIntervalos([
      { inicio: 0, fim: 10 },
      { inicio: 10, fim: 20 },
      { inicio: 30, fim: 40 },
    ])
    expect(unidos).toEqual([
      { inicio: 0, fim: 20 },
      { inicio: 30, fim: 40 },
    ])
  })

  it('subtrairIntervalos recorta dos dois lados e do meio', () => {
    const base = [{ inicio: 0, fim: 100 }]
    expect(subtrairIntervalos(base, [{ inicio: -10, fim: 10 }])).toEqual([{ inicio: 10, fim: 100 }])
    expect(subtrairIntervalos(base, [{ inicio: 90, fim: 200 }])).toEqual([{ inicio: 0, fim: 90 }])
    expect(subtrairIntervalos(base, [{ inicio: 40, fim: 60 }])).toEqual([
      { inicio: 0, fim: 40 },
      { inicio: 60, fim: 100 },
    ])
  })

  it('duracaoMinutos soma em minutos inteiros', () => {
    expect(
      duracaoMinutos([
        { inicio: 0, fim: 60_000 },
        { inicio: 100_000, fim: 160_000 },
      ]),
    ).toBe(2)
  })
})
```

- [ ] **Step 4: Rodar o teste**

Run: `pnpm vitest run tests/detracao/recolhimento-noturno/intervalos.spec.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/detracao/recolhimento-noturno/tipos.ts src/lib/detracao/recolhimento-noturno/intervalos.ts tests/detracao/recolhimento-noturno/intervalos.spec.ts
git commit -m "feat(detracao): tipos e helpers de intervalo do motor de recolhimento noturno"
```

---

## Task 2: Motor de cálculo (pipeline + comparação de resultado)

**Files:**
- Create: `src/lib/detracao/recolhimento-noturno/motor.ts`
- Create: `src/lib/detracao/recolhimento-noturno/comparar.ts`
- Test: `tests/detracao/recolhimento-noturno/motor.spec.ts`
- Test: `tests/detracao/recolhimento-noturno/comparar.spec.ts`

**Interfaces:**
- Consumes: tudo de `tipos.ts` e `intervalos.ts` (Task 1).
- Produces: `calcular(entrada: EntradaCalculo): ResultadoCalculo` (lança `Error` em entrada inválida); `mesmoResultado(a: ResultadoCalculo, b: ResultadoCalculo): boolean`.

- [ ] **Step 1: Escrever `motor.ts`**

```ts
// src/lib/detracao/recolhimento-noturno/motor.ts
//
// O pipeline do §5/§10 do plano de implementação: gera os intervalos de cada segmento, recorta
// pela vigência, subtrai exclusões, une sobreposições e só então soma e converte em dias.

import {
  type Faixa,
  intersectar,
  mergeIntervalos,
  subtrairIntervalos,
  duracaoMinutos,
  paraInstante,
  paraInstanteDeData,
  somarDias,
  formatarInstante,
  proximoDia,
} from './intervalos'
import { ALGORITMO_VERSAO } from './tipos'
import type { EntradaCalculo, IntervaloComMotivo, ResultadoCalculo, Weekday } from './tipos'

const WEEKDAY_POR_INDICE_JS: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function diaSemanaDe(dataISO: string): Weekday {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  if (!m) throw new Error(`data inválida: ${dataISO}`)
  const indice = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return WEEKDAY_POR_INDICE_JS[indice]
}

function dataDeInstante(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** Do dia da data de início ao dia do último instante ANTES do fim (fim é exclusivo). */
function datasTocadasPorJanela(inicioMs: number, fimMs: number): string[] {
  if (fimMs <= inicioMs) return []
  const datas: string[] = []
  let cursor = dataDeInstante(inicioMs)
  const ultima = dataDeInstante(fimMs - 1)
  while (true) {
    datas.push(cursor)
    if (cursor === ultima) break
    cursor = proximoDia(cursor)
  }
  return datas
}

function validarHora(hora: string, campo: string) {
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error(`${campo} deve estar no formato HH:MM.`)
}

function formatarHoras(totalMinutos: number): string {
  return `${Math.floor(totalMinutos / 60)}:${String(totalMinutos % 60).padStart(2, '0')}`
}

function formatarHHMM(totalMinutos: number): string {
  return `${String(Math.floor(totalMinutos / 60)).padStart(2, '0')}:${String(totalMinutos % 60).padStart(2, '0')}`
}

export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  if (!entrada.segmentos || entrada.segmentos.length === 0) {
    throw new Error('Informe ao menos um segmento de regra.')
  }

  const todasFaixas: Faixa[] = []
  const excluidasFaixas: Faixa[] = []
  const excluidasComMotivo: IntervaloComMotivo[] = []

  for (const segmento of entrada.segmentos) {
    validarHora(segmento.horaInicioNoturno, 'horaInicioNoturno')
    validarHora(segmento.horaFimNoturno, 'horaFimNoturno')
    // 🔴 §12 do plano: 00:00–00:00 NÃO vira "24 horas" por presunção — é rejeitado.
    if (segmento.diasSemanaNoturno.length > 0 && segmento.horaInicioNoturno === segmento.horaFimNoturno) {
      throw new Error(
        'Horário noturno com início igual ao fim é ambíguo. Para dia inteiro, use dias de folga integral ou feriados, não o horário noturno.',
      )
    }

    const janela: Faixa = { inicio: paraInstante(segmento.inicio), fim: paraInstante(segmento.fim) }
    if (janela.fim <= janela.inicio) {
      throw new Error('A data final do segmento deve ser posterior à data inicial.')
    }

    for (const dataISO of datasTocadasPorJanela(janela.inicio, janela.fim)) {
      const diaSemana = diaSemanaDe(dataISO)

      if (segmento.diasSemanaNoturno.includes(diaSemana)) {
        let a = paraInstanteDeData(dataISO, segmento.horaInicioNoturno)
        let b = paraInstanteDeData(dataISO, segmento.horaFimNoturno)
        if (b <= a) b = somarDias(b, 1)
        const cortado = intersectar({ inicio: a, fim: b }, janela)
        if (cortado) todasFaixas.push(cortado)
      }

      if (segmento.diasFolgaIntegral.includes(diaSemana) || segmento.feriadosIntegral.includes(dataISO)) {
        const a = paraInstanteDeData(dataISO, '00:00')
        const cortado = intersectar({ inicio: a, fim: somarDias(a, 1) }, janela)
        if (cortado) todasFaixas.push(cortado)
      }
    }

    for (const extra of segmento.intervalosAdicionais) {
      const cortado = intersectar({ inicio: paraInstante(extra.inicio), fim: paraInstante(extra.fim) }, janela)
      if (cortado) todasFaixas.push(cortado)
    }

    for (const exclusao of segmento.intervalosExcluidos) {
      const cortado = intersectar(
        { inicio: paraInstante(exclusao.inicio), fim: paraInstante(exclusao.fim) },
        janela,
      )
      if (cortado) {
        excluidasFaixas.push(cortado)
        excluidasComMotivo.push({
          inicio: formatarInstante(cortado.inicio),
          fim: formatarInstante(cortado.fim),
          motivo: exclusao.motivo,
        })
      }
    }
  }

  const validas = subtrairIntervalos(todasFaixas, excluidasFaixas)
  const consolidadas = mergeIntervalos(validas)
  const totalMinutos = duracaoMinutos(consolidadas)
  const diasDetracao = Math.floor(totalMinutos / 1440)
  const saldoMinutos = totalMinutos % 1440

  return {
    totalMinutos,
    totalHoras: formatarHoras(totalMinutos),
    diasDetracao,
    saldoMinutos,
    saldoHoras: formatarHHMM(saldoMinutos),
    intervalosConsolidados: consolidadas.map((f) => ({
      inicio: formatarInstante(f.inicio),
      fim: formatarInstante(f.fim),
    })),
    intervalosExcluidos: excluidasComMotivo,
    algoritmoVersao: ALGORITMO_VERSAO,
  }
}
```

- [ ] **Step 2: Escrever o teste do motor (T01–T12 do §11 do plano + bordas do §12)**

```ts
// tests/detracao/recolhimento-noturno/motor.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { EntradaCalculo, SegmentoRegra, Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'

const WEEKDAY_POR_INDICE_JS: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function fmtData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}
function fmtDataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtData(d)}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}
function diaSemanaDe(d: Date): Weekday {
  return WEEKDAY_POR_INDICE_JS[d.getUTCDay()]
}

function segmentoBase(overrides: Partial<SegmentoRegra>): SegmentoRegra {
  return {
    inicio: '2026-01-01T00:00:00',
    fim: '2026-01-02T00:00:00',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: [],
    diasFolgaIntegral: [],
    feriadosIntegral: [],
    intervalosAdicionais: [],
    intervalosExcluidos: [],
    ...overrides,
  }
}

function entradaCom(segmentos: SegmentoRegra[]): EntradaCalculo {
  return { timezone: 'America/Sao_Paulo', segmentos }
}

describe('motor de recolhimento noturno — casos de aceitação (§11 do plano)', () => {
  it('T01 — 1439 min computáveis: 0 dias, saldo 23:59', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T23:59:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1439)
    expect(r.diasDetracao).toBe(0)
    expect(r.saldoHoras).toBe('23:59')
  })

  it('T02 — exatamente 24h: 1 dia, saldo 00:00', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T00:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1440)
    expect(r.diasDetracao).toBe(1)
    expect(r.saldoHoras).toBe('00:00')
  })

  it('T03 — 47h59: 1 dia, saldo 23:59', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          fim: '2026-01-03T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T23:59:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(2879)
    expect(r.diasDetracao).toBe(1)
    expect(r.saldoHoras).toBe('23:59')
  })

  it('T04 — 48h: 2 dias, saldo 00:00', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          fim: '2026-01-04T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-03T00:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(2880)
    expect(r.diasDetracao).toBe(2)
    expect(r.saldoHoras).toBe('00:00')
  })

  it('T05 — 30 noites de 22h–05h (7h cada): 8 dias, saldo 18:00', () => {
    const inicio = new Date(Date.UTC(2026, 1, 1))
    const fim = new Date(inicio.getTime() + 30 * 86_400_000 + 5 * 3_600_000)
    const todosOsDias: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(inicio),
          fim: fmtDataHora(fim),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '05:00',
          diasSemanaNoturno: todosOsDias,
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(30 * 7 * 60)
    expect(r.diasDetracao).toBe(8)
    expect(r.saldoHoras).toBe('18:00')
  })

  it('T06 — sexta 22h–sábado 06h + sábado integral: une para 26h, não 32h', () => {
    const dia1 = new Date(Date.UTC(2026, 0, 2))
    const dia2 = new Date(dia1.getTime() + 86_400_000)
    const dia3 = new Date(dia2.getTime() + 86_400_000)
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(dia1),
          fim: fmtDataHora(dia3),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '06:00',
          diasSemanaNoturno: [diaSemanaDe(dia1)],
          diasFolgaIntegral: [diaSemanaDe(dia2)],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(26 * 60)
  })

  it('T07 — intervalo cruza o início da cautelar: soma só depois do início exato', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-02T00:00:00',
          fim: '2026-01-03T00:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T20:00:00', fim: '2026-01-02T04:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
  })

  it('T08 — intervalo cruza o fim/revogação: soma só até o fim exato', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-01T00:00:00',
          fim: '2026-01-01T04:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T08:00:00' }],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
  })

  it('T09 — exclusão parcial de 2h dentro de uma noite: total reduz em 120 min', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: '2026-01-01T00:00:00',
          fim: '2026-01-02T06:00:00',
          intervalosAdicionais: [{ inicio: '2026-01-01T22:00:00', fim: '2026-01-02T06:00:00' }],
          intervalosExcluidos: [
            { inicio: '2026-01-01T23:00:00', fim: '2026-01-02T01:00:00', motivo: 'viagem autorizada' },
          ],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(8 * 60 - 120)
    expect(r.intervalosExcluidos).toHaveLength(1)
  })

  it('T10 — ausência de monitoramento eletrônico não altera o resultado', () => {
    const base = segmentoBase({
      intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T10:00:00' }],
    })
    const com = calcular({ timezone: 'America/Sao_Paulo', segmentos: [base], monitoramentoEletronico: 'sim' })
    const sem = calcular({ timezone: 'America/Sao_Paulo', segmentos: [base], monitoramentoEletronico: 'nao' })
    expect(sem.totalMinutos).toBe(com.totalMinutos)
    expect(sem.totalMinutos).toBeGreaterThan(0)
  })

  it('T11 — mudança de regra no meio do período: cada segmento usa a sua', () => {
    const dia1 = new Date(Date.UTC(2026, 0, 2))
    const dia2 = new Date(Date.UTC(2026, 2, 2))
    const r = calcular(
      entradaCom([
        segmentoBase({
          inicio: fmtDataHora(dia1),
          fim: fmtDataHora(new Date(dia1.getTime() + 86_400_000)),
          horaInicioNoturno: '22:00',
          horaFimNoturno: '23:00',
          diasSemanaNoturno: [diaSemanaDe(dia1)],
        }),
        segmentoBase({
          inicio: fmtDataHora(dia2),
          fim: fmtDataHora(new Date(dia2.getTime() + 86_400_000)),
          horaInicioNoturno: '20:00',
          horaFimNoturno: '22:00',
          diasSemanaNoturno: [diaSemanaDe(dia2)],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(1 * 60 + 2 * 60)
  })

  it('T12 — intervalos contíguos 06h–08h e 08h–10h: 4h totais, um único bloco', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({
          intervalosAdicionais: [
            { inicio: '2026-01-01T06:00:00', fim: '2026-01-01T08:00:00' },
            { inicio: '2026-01-01T08:00:00', fim: '2026-01-01T10:00:00' },
          ],
        }),
      ]),
    )
    expect(r.totalMinutos).toBe(4 * 60)
    expect(r.intervalosConsolidados).toHaveLength(1)
  })
})

describe('motor — casos de borda (§12 do plano)', () => {
  it('rejeita horário noturno com início igual ao fim (ambíguo)', () => {
    expect(() =>
      calcular(
        entradaCom([
          segmentoBase({ horaInicioNoturno: '00:00', horaFimNoturno: '00:00', diasSemanaNoturno: ['MON'] }),
        ]),
      ),
    ).toThrow(/ambígu/)
  })

  it('nunca produz float: totalMinutos e saldoMinutos são sempre inteiros', () => {
    const r = calcular(
      entradaCom([
        segmentoBase({ intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T00:37:00' }] }),
      ]),
    )
    expect(Number.isInteger(r.totalMinutos)).toBe(true)
    expect(Number.isInteger(r.saldoMinutos)).toBe(true)
  })

  it('rejeita segmento sem nenhum segmento informado', () => {
    expect(() => calcular({ timezone: 'America/Sao_Paulo', segmentos: [] })).toThrow(/segmento/)
  })
})
```

- [ ] **Step 3: Rodar o teste do motor**

Run: `pnpm vitest run tests/detracao/recolhimento-noturno/motor.spec.ts`
Expected: PASS (15 testes).

- [ ] **Step 4: Escrever `comparar.ts`**

```ts
// src/lib/detracao/recolhimento-noturno/comparar.ts
//
// Compara dois `ResultadoCalculo` POR ESTRUTURA — nunca `JSON.stringify` bruto: um dos dois pode
// ter vindo de uma coluna `jsonb`, e o Postgres não preserva ordem de chaves.

import type { Intervalo, ResultadoCalculo } from './tipos'

function mesmosIntervalos(a: Intervalo[], b: Intervalo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((iv, i) => iv.inicio === b[i].inicio && iv.fim === b[i].fim)
}

export function mesmoResultado(a: ResultadoCalculo, b: ResultadoCalculo): boolean {
  return (
    a.totalMinutos === b.totalMinutos &&
    a.diasDetracao === b.diasDetracao &&
    a.saldoMinutos === b.saldoMinutos &&
    a.algoritmoVersao === b.algoritmoVersao &&
    mesmosIntervalos(a.intervalosConsolidados, b.intervalosConsolidados) &&
    mesmosIntervalos(a.intervalosExcluidos, b.intervalosExcluidos)
  )
}
```

- [ ] **Step 5: Escrever o teste de `comparar.ts`**

```ts
// tests/detracao/recolhimento-noturno/comparar.spec.ts
import { describe, it, expect } from 'vitest'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { mesmoResultado } from '@/lib/detracao/recolhimento-noturno/comparar'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

const ENTRADA: EntradaCalculo = {
  timezone: 'America/Sao_Paulo',
  segmentos: [
    {
      inicio: '2026-01-01T00:00:00',
      fim: '2026-01-02T00:00:00',
      horaInicioNoturno: '22:00',
      horaFimNoturno: '06:00',
      diasSemanaNoturno: [],
      diasFolgaIntegral: [],
      feriadosIntegral: [],
      intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-01T10:00:00' }],
      intervalosExcluidos: [],
    },
  ],
}

describe('mesmoResultado', () => {
  it('é true para o mesmo cálculo recalculado', () => {
    expect(mesmoResultado(calcular(ENTRADA), calcular(ENTRADA))).toBe(true)
  })

  it('é true mesmo com as chaves do objeto em outra ordem (simula ida e volta por jsonb)', () => {
    const r = calcular(ENTRADA)
    const reordenado = JSON.parse(JSON.stringify(r).split('').reverse().join('')) as unknown
    // A rodada acima quebraria como JSON — o teste real de "ordem de chave não importa" é
    // reconstruir o objeto manualmente com as chaves em outra ordem:
    const outraOrdem = {
      algoritmoVersao: r.algoritmoVersao,
      totalMinutos: r.totalMinutos,
      intervalosExcluidos: r.intervalosExcluidos,
      diasDetracao: r.diasDetracao,
      saldoMinutos: r.saldoMinutos,
      totalHoras: r.totalHoras,
      saldoHoras: r.saldoHoras,
      intervalosConsolidados: r.intervalosConsolidados,
    }
    expect(mesmoResultado(r, outraOrdem)).toBe(true)
    expect(reordenado).toBeDefined() // só para não sobrar variável não usada
  })

  it('é false quando o total muda', () => {
    const r = calcular(ENTRADA)
    expect(mesmoResultado(r, { ...r, totalMinutos: r.totalMinutos + 1 })).toBe(false)
  })
})
```

- [ ] **Step 6: Rodar o teste de `comparar.ts`**

Run: `pnpm vitest run tests/detracao/recolhimento-noturno/comparar.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add src/lib/detracao/recolhimento-noturno/motor.ts src/lib/detracao/recolhimento-noturno/comparar.ts tests/detracao/recolhimento-noturno/motor.spec.ts tests/detracao/recolhimento-noturno/comparar.spec.ts
git commit -m "feat(detracao): motor de cálculo do recolhimento noturno (T01-T12) e comparação de resultado"
```

---

## Task 3: Conversão do formulário para a entrada do motor

**Files:**
- Create: `src/lib/detracao/recolhimento-noturno/formulario.ts`
- Test: `tests/detracao/recolhimento-noturno/formulario.spec.ts`

**Interfaces:**
- Consumes: `Intervalo`, `IntervaloComMotivo`, `SegmentoRegra`, `EntradaCalculo`, `Weekday` de `tipos.ts`; `proximoDia` de `intervalos.ts`.
- Produces: `SegmentoFormulario`, `EntradaFormulario` (tipos usados pela UI, Tasks 7-8), `segmentoFormularioEmBranco(): SegmentoFormulario`, `segmentoParaRegra(sf): SegmentoRegra`, `entradaFormularioParaCalculo(ef): EntradaCalculo`.

- [ ] **Step 1: Escrever `formulario.ts`**

```ts
// src/lib/detracao/recolhimento-noturno/formulario.ts
//
// A ponte entre os campos que a TELA edita (datas soltas, data/hora exata opcional) e o que o
// MOTOR espera (janela `[inicio, fim)` sempre fechada). O motor não tem noção de "modo simples"
// ou "avançado" — isso é só como esta camada preenche `SegmentoRegra` (ver §4 da spec).

import { proximoDia } from './intervalos'
import type { EntradaCalculo, Intervalo, IntervaloComMotivo, SegmentoRegra, Weekday } from './tipos'

export type SegmentoFormulario = {
  dataInicio: string
  dataFim: string
  dataHoraInicioExata?: string
  dataHoraFimExata?: string
  horaInicioNoturno: string
  horaFimNoturno: string
  diasSemanaNoturno: Weekday[]
  diasFolgaIntegral: Weekday[]
  feriadosIntegral: string[]
  intervalosAdicionais: Intervalo[]
  intervalosExcluidos: IntervaloComMotivo[]
}

export type EntradaFormulario = {
  timezone: string
  segmentos: SegmentoFormulario[]
  observacoes?: string
  monitoramentoEletronico?: 'sim' | 'nao' | 'nao_informado'
}

/** `<input type="datetime-local">` devolve "YYYY-MM-DDTHH:MM", sem segundos. */
function normalizarDataHora(valor: string): string {
  return valor.length === 16 ? `${valor}:00` : valor
}

export function segmentoParaRegra(sf: SegmentoFormulario): SegmentoRegra {
  return {
    inicio: sf.dataHoraInicioExata?.trim()
      ? normalizarDataHora(sf.dataHoraInicioExata)
      : `${sf.dataInicio}T00:00:00`,
    // 🔴 §12 da spec: fim exclusivo preferido internamente — "último dia" vira o INÍCIO do dia
    // seguinte, não "23:59:59" (que cortaria 1 minuto de um dia de folga integral no fim).
    fim: sf.dataHoraFimExata?.trim() ? normalizarDataHora(sf.dataHoraFimExata) : `${proximoDia(sf.dataFim)}T00:00:00`,
    horaInicioNoturno: sf.horaInicioNoturno,
    horaFimNoturno: sf.horaFimNoturno,
    diasSemanaNoturno: sf.diasSemanaNoturno,
    diasFolgaIntegral: sf.diasFolgaIntegral,
    feriadosIntegral: sf.feriadosIntegral,
    intervalosAdicionais: sf.intervalosAdicionais,
    intervalosExcluidos: sf.intervalosExcluidos,
  }
}

export function entradaFormularioParaCalculo(ef: EntradaFormulario): EntradaCalculo {
  return {
    timezone: ef.timezone,
    segmentos: ef.segmentos.map(segmentoParaRegra),
    observacoes: ef.observacoes,
    monitoramentoEletronico: ef.monitoramentoEletronico,
  }
}

export function segmentoFormularioEmBranco(): SegmentoFormulario {
  return {
    dataInicio: '',
    dataFim: '',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: [],
    diasFolgaIntegral: [],
    feriadosIntegral: [],
    intervalosAdicionais: [],
    intervalosExcluidos: [],
  }
}
```

- [ ] **Step 2: Escrever o teste**

```ts
// tests/detracao/recolhimento-noturno/formulario.spec.ts
import { describe, it, expect } from 'vitest'
import {
  entradaFormularioParaCalculo,
  segmentoFormularioEmBranco,
  segmentoParaRegra,
} from '@/lib/detracao/recolhimento-noturno/formulario'

describe('conversão do formulário para a entrada do motor', () => {
  it('usa data_inicio 00:00 e o dia SEGUINTE a data_fim 00:00 quando não há data/hora exata', () => {
    const sf = { ...segmentoFormularioEmBranco(), dataInicio: '2026-01-31', dataFim: '2026-01-31' }
    const regra = segmentoParaRegra(sf)
    expect(regra.inicio).toBe('2026-01-31T00:00:00')
    expect(regra.fim).toBe('2026-02-01T00:00:00')
  })

  it('usa a data/hora exata quando informada, mesmo sem segundos', () => {
    const sf = {
      ...segmentoFormularioEmBranco(),
      dataInicio: '2026-01-31',
      dataFim: '2026-01-31',
      dataHoraInicioExata: '2026-01-31T13:45',
      dataHoraFimExata: '2026-02-02T09:15',
    }
    const regra = segmentoParaRegra(sf)
    expect(regra.inicio).toBe('2026-01-31T13:45:00')
    expect(regra.fim).toBe('2026-02-02T09:15:00')
  })

  it('entradaFormularioParaCalculo converte todos os segmentos e preserva metadados', () => {
    const ef = {
      timezone: 'America/Sao_Paulo',
      segmentos: [{ ...segmentoFormularioEmBranco(), dataInicio: '2026-01-01', dataFim: '2026-01-01' }],
      observacoes: 'nota',
      monitoramentoEletronico: 'nao' as const,
    }
    const ec = entradaFormularioParaCalculo(ef)
    expect(ec.segmentos).toHaveLength(1)
    expect(ec.observacoes).toBe('nota')
    expect(ec.monitoramentoEletronico).toBe('nao')
  })
})
```

- [ ] **Step 3: Rodar o teste**

Run: `pnpm vitest run tests/detracao/recolhimento-noturno/formulario.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 4: Commit**

```bash
git add src/lib/detracao/recolhimento-noturno/formulario.ts tests/detracao/recolhimento-noturno/formulario.spec.ts
git commit -m "feat(detracao): conversão do formulário (datas soltas) para a entrada do motor"
```

---

## Task 4: Catálogo de produtos — família e novo produto

**Files:**
- Modify: `src/lib/produtos/catalogo.ts`
- Modify: `tests/produtos/catalogo.spec.ts`

**Interfaces:**
- Produces: `Familia = 'indulto-comutacao' | 'detracao'`; `Produto.familia`; produto `detracao-recolhimento-noturno` (slug `recolhimento-noturno`); `caminhoDoProduto(slug)` agora devolve `/ferramentas/detracao/${slug}` para produtos da família `detracao` e mantém `/ferramentas/${slug}` para os demais.

- [ ] **Step 1: Reescrever `catalogo.ts`**

```ts
// src/lib/produtos/catalogo.ts
/**
 * O que se vende. Cada produto de `familia: 'indulto-comutacao'` É um motor de decreto: o id é o
 * mesmo do REGISTRO da calculadora, e um teste de contrato exige a correspondência nos dois
 * sentidos. Produtos de outras famílias (ex.: `detracao`) não têm essa exigência — não existe
 * "registro de motores" fora do domínio de decreto.
 *
 * É código, não dado, de propósito: um id mal escrito é erro de compilação, e não uma oferta
 * que silenciosamente não libera nada.
 *
 * 🔴 `slug` é a ÚNICA fonte do caminho da rota. Não acrescente um campo `href`: duas verdades
 * divergem no primeiro decreto novo. Quem precisa do caminho chama `caminhoDoProduto`.
 *
 * 🔴 `familia` decide o PREFIXO da rota (ver `caminhoDoProduto`) e como o menu agrupa o produto
 * (Rail.tsx) — é o que permite existir uma seção "Detração" ao lado de "Indulto e Comutação"
 * sem duplicar rota nem menu para cada produto novo daquela família.
 */
export type Familia = 'indulto-comutacao' | 'detracao'

export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    familia: 'indulto-comutacao',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    // Título/descrição do item no menu lateral (Rail.tsx) — mais curtos que `rotulo`, que é o
    // nome cheio usado na vitrine de `/ferramentas`.
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
  },
  {
    id: 'indulto-comutacao-2024',
    slug: 'cic-2024',
    familia: 'indulto-comutacao',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.338/2024',
    menuTitulo: 'GPS CIC - Calculadora 2024',
    menuDescricao: 'Decreto 12.338/2024',
  },
  {
    id: 'detracao-recolhimento-noturno',
    slug: 'recolhimento-noturno',
    familia: 'detracao',
    rotulo: 'Detração por Recolhimento Noturno — Tema Repetitivo 1.155/STJ',
    menuTitulo: 'GPS Detração - Recolhimento Noturno',
    menuDescricao: 'Tema 1.155/STJ',
  },
] as const

export type Produto = (typeof PRODUTOS)[number]
export type ProdutoId = Produto['id']

export function ehProdutoConhecido(id: unknown): id is ProdutoId {
  return typeof id === 'string' && PRODUTOS.some((p) => p.id === id)
}

export function produtoDoMotor(motorId: string): ProdutoId | null {
  return ehProdutoConhecido(motorId) ? motorId : null
}

export function rotuloDoProduto(id: ProdutoId): string {
  return PRODUTOS.find((p) => p.id === id)?.rotulo ?? id
}

/** O caminho da rota daquele produto. Fonte única: o `slug` + a `familia` de quem o possui —
 *  produtos de `indulto-comutacao` mantêm `/ferramentas/<slug>` (nenhum link existente muda);
 *  produtos de `detracao` (e futuras famílias) ganham prefixo próprio. */
export function caminhoDoProduto(slug: string): string {
  const produto = produtoPorSlug(slug)
  const prefixo = produto && produto.familia !== 'indulto-comutacao' ? `${produto.familia}/` : ''
  return `/ferramentas/${prefixo}${slug}`
}

export function produtoPorSlug(slug: string): Produto | null {
  return PRODUTOS.find((p) => p.slug === slug) ?? null
}

export function slugDoMotor(motorId: string): string | null {
  return PRODUTOS.find((p) => p.id === motorId)?.slug ?? null
}
```

- [ ] **Step 2: Ajustar `tests/produtos/catalogo.spec.ts`**

Adicionar os casos abaixo ao describe existente, e trocar o teste `'todo produto do catálogo tem motor no registro'` para só cobrir a família `indulto-comutacao` (produtos de outras famílias não têm motor nesse registro):

```ts
// tests/produtos/catalogo.spec.ts — SUBSTITUIR o teste 'todo produto do catálogo tem motor no
// registro' por este, e ACRESCENTAR os dois `it` seguintes ao mesmo describe.

  it('todo produto de indulto-comutacao tem motor no registro', () => {
    const idsMotor = REGISTRO.map((m) => m.id)
    for (const p of PRODUTOS.filter((p) => p.familia === 'indulto-comutacao')) {
      expect(idsMotor, `produto ${p.id} sem motor`).toContain(p.id)
    }
  })

  it('monta o caminho de produto de detração com o prefixo da família', () => {
    expect(caminhoDoProduto('recolhimento-noturno')).toBe('/ferramentas/detracao/recolhimento-noturno')
  })

  it('não muda o caminho de produtos de indulto-comutacao já publicados', () => {
    expect(caminhoDoProduto('cic-2025')).toBe('/ferramentas/cic-2025')
    expect(caminhoDoProduto('cic-2024')).toBe('/ferramentas/cic-2024')
  })
```

- [ ] **Step 3: Rodar os testes do catálogo**

Run: `pnpm vitest run tests/produtos/catalogo.spec.ts tests/vendas/catalogo.spec.ts`
Expected: PASS.

- [ ] **Step 4: Rodar a suíte inteira de indulto-comutação (garantir que nada quebrou)**

Run: `pnpm vitest run tests/indulto-comutacao`
Expected: PASS (nenhuma mudança de comportamento nessa família).

- [ ] **Step 5: Commit**

```bash
git add src/lib/produtos/catalogo.ts tests/produtos/catalogo.spec.ts
git commit -m "feat(catalogo): familia de produto e novo produto detracao-recolhimento-noturno"
```

---

## Task 5: Migration da tabela `detracao_calculos`

**Files:**
- Create: `supabase/migrations/0066_ferramentas_detracao.sql`

**Interfaces:**
- Produces: tabela `public.detracao_calculos` (colunas: `id`, `workspace_id`, `user_id`, `calculo_tipo`, `algoritmo_versao`, `titulo`, `entrada` jsonb, `resultado` jsonb, `criado_em`, `atualizado_em`); policy de `select` `detracao_calculos_sel`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0066_ferramentas_detracao.sql — os cálculos de detração que cada membro
-- guarda para si. Mesmo padrão da 0062 (indulto_comutacao_calculos).
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE: o CRM reaplica no boot
-- qualquer migration que não encontre registrada, então toda instrução aqui aguenta rodar duas
-- vezes. Nada apaga dado e nada exige ownership de objeto do Supabase.

create table if not exists public.detracao_calculos (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- Qual calculadora de detração gerou este resultado — hoje só 'recolhimento-noturno', mas o
  -- campo já separa por tipo se entrar um segundo produto de detração na mesma família.
  calculo_tipo      text not null,
  algoritmo_versao  text not null,
  titulo            text not null,
  entrada           jsonb not null,
  resultado         jsonb not null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists detracao_calculos_dono_idx
  on public.detracao_calculos (workspace_id, user_id, atualizado_em desc);

alter table public.detracao_calculos enable row level security;

-- Privilégio de tabela, explícito — mesmo raciocínio da 0062 (herdaria da 0061, concedemos
-- mesmo assim pelo motivo dela: o produto não depende de privilégio que não concedeu).
grant all on table public.detracao_calculos to anon, authenticated, service_role;

-- 🔴 SÓ LEITURA, e só do próprio dono. NENHUMA policy de escrita para `authenticated`: as
-- escritas vão por server action, com service-role, que não passa por RLS — ver Task 6.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'detracao_calculos'
      and policyname = 'detracao_calculos_sel'
  ) then
    create policy detracao_calculos_sel on public.detracao_calculos
      for select to authenticated
      using (public.e_membro(workspace_id) and user_id = auth.uid());
  end if;
end $$;
```

- [ ] **Step 2: Confirmar que o número da migration é o próximo livre**

Run: `ls supabase/migrations | tail -5`
Expected: a última listada antes desta é `0065_membros_e_workspaces_so_para_quem_pode.sql` — `0066_ferramentas_detracao.sql` é o próximo número.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0066_ferramentas_detracao.sql
git commit -m "feat(detracao): migration da tabela detracao_calculos"
```

---

## Task 6: Camada de dados do servidor (leitura, validação, server actions)

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/calculos.ts`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/acoes.ts`

**Interfaces:**
- Consumes: `EntradaCalculo`, `ResultadoCalculo`, `ALGORITMO_VERSAO` de `@/lib/detracao/recolhimento-noturno/tipos`; `calcular` de `@/lib/detracao/recolhimento-noturno/motor`; `caminhoDoProduto` de `@/lib/produtos/catalogo` (Task 4); `exigirEscrita`/`estadoDoProduto` de `@/server/vendas/acesso` (já existe); tabela `detracao_calculos` (Task 5).
- Produces: `listarCalculos(calculoTipo): Promise<CalculoResumo[]>`, `lerCalculo(id): Promise<CalculoSalvo | null>` (calculos.ts); `preparar(bruto): { erro } | { titulo, entrada, resultado }` (preparar.ts); `salvarCalculo`, `atualizarCalculo`, `excluirCalculo` (acoes.ts) — consumidos pela UI nas Tasks 10-12.

- [ ] **Step 1: Escrever `calculos.ts`**

```ts
// src/app/(app)/ferramentas/detracao/[calculadora]/calculos.ts
import 'server-only'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { codigoDeBanco } from '@/lib/erro-de-banco'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

export type CalculoSalvo = {
  id: string
  calculo_tipo: string
  algoritmo_versao: string
  titulo: string
  entrada: EntradaCalculo
  resultado: ResultadoCalculo
  criado_em: string
  atualizado_em: string
}

export type CalculoResumo = {
  id: string
  calculo_tipo: string
  algoritmo_versao: string
  titulo: string
  criado_em: string
  atualizado_em: string
}

const COLUNAS = 'id, calculo_tipo, algoritmo_versao, titulo, entrada, resultado, criado_em, atualizado_em'
const COLUNAS_RESUMO = 'id, calculo_tipo, algoritmo_versao, titulo, criado_em, atualizado_em'

const ERRO_LEITURA = 'Não consegui carregar os seus cálculos agora. Tente de novo em alguns instantes.'

/** Os cálculos do membro logado, no workspace ATIVO e NAQUELE TIPO — mesma regra da
 *  `indulto-comutacao/calculos.ts`: a RLS restringe ao dono, e `.eq('workspace_id', ws)`
 *  restringe ao workspace ativo (sem isso, quem pertence a dois veria os cálculos do outro). */
export async function listarCalculos(calculoTipo: string): Promise<CalculoResumo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data, error } = await cliente
    .from('detracao_calculos')
    .select(COLUNAS_RESUMO)
    .eq('workspace_id', ws)
    .eq('calculo_tipo', calculoTipo)
    .order('atualizado_em', { ascending: false })

  if (error) {
    console.error('[detracao] listarCalculos', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }
  return (data ?? []) as CalculoResumo[]
}

export async function lerCalculo(id: string): Promise<CalculoSalvo | null> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return null

  const { data, error } = await cliente
    .from('detracao_calculos')
    .select(COLUNAS)
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle()

  if (error) {
    if (codigoDeBanco(error) === '22P02') return null
    console.error('[detracao] lerCalculo', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }
  return (data as CalculoSalvo | null) ?? null
}
```

- [ ] **Step 2: Escrever `preparar.ts`**

```ts
// src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts
import { z } from 'zod'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

// Módulo SEM `'use server'` de propósito, mesma razão do `preparar.ts` do CIC: é lógica pura
// (validação + recálculo), testável direto, sem sessão nem rede.

const Intervalo = z.object({ inicio: z.string().min(1), fim: z.string().min(1) })
const IntervaloComMotivo = Intervalo.extend({
  motivo: z.string().trim().min(1, 'Descreva o motivo da exclusão.'),
})

const Segmento = z.object({
  inicio: z.string().min(1),
  fim: z.string().min(1),
  horaInicioNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  horaFimNoturno: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  diasSemanaNoturno: z.array(z.string()),
  diasFolgaIntegral: z.array(z.string()),
  feriadosIntegral: z.array(z.string()),
  intervalosAdicionais: z.array(Intervalo),
  intervalosExcluidos: z.array(IntervaloComMotivo),
})

export const Dados = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'Dê um título ao cálculo — o nº de execução serve.')
    .max(200, 'Use no máximo 200 caracteres no título.'),
  entrada: z.object({
    timezone: z.string().trim().min(1, 'Informe o fuso horário.'),
    segmentos: z.array(Segmento).min(1, 'Informe ao menos um segmento de regra.'),
    observacoes: z.string().optional(),
    monitoramentoEletronico: z.enum(['sim', 'nao', 'nao_informado']).optional(),
  }),
})

/** Valida, e RECALCULA — nunca lança. O cliente manda a entrada, nunca o resultado (ver Global
 *  Constraints do plano): o que fica gravado é sempre produto do motor desta versão.
 *
 *  🔴 `calcular` roda dentro do `try`: uma entrada forjada (data fora do formato, horário
 *  inválido) faz o motor lançar, e uma action nunca pode lançar. */
export function preparar(
  bruto: unknown,
): { erro: string } | { titulo: string; entrada: EntradaCalculo; resultado: ResultadoCalculo } {
  const r = Dados.safeParse(bruto)
  if (!r.success) {
    return { erro: r.error.issues[0]?.message ?? 'Confira os dados do cálculo.' }
  }
  try {
    const entrada = r.data.entrada as EntradaCalculo
    const resultado = calcular(entrada)
    return { titulo: r.data.titulo, entrada, resultado }
  } catch (err) {
    console.error('[detracao] preparar', detalheSeguro(err))
    return { erro: 'Confira os dados do cálculo — datas, horários e intervalos.' }
  }
}
```

- [ ] **Step 3: Escrever `acoes.ts`**

```ts
// src/app/(app)/ferramentas/detracao/[calculadora]/acoes.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { exigirSessao } from '@/server/auth/sessao'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { admin } from '@/server/supabase'
import { fraseDeBanco } from '@/lib/erro-de-banco'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import { preparar } from './preparar'
import { exigirEscrita } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { ALGORITMO_VERSAO } from '@/lib/detracao/recolhimento-noturno/tipos'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'

const TABELA = 'detracao_calculos'
const CALCULO_TIPO = 'recolhimento-noturno'
const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'

const Id = z.string().uuid()

const NAO_ACHOU =
  'Este cálculo não existe mais, ou não está na sua conta. Recarregue a lista e tente de novo.'

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function contexto(): Promise<{ userId: string; ws: string } | { erro: string }> {
  const user = await exigirSessao()
  const ws = await resolverWorkspaceAtivo()
  if (!ws) return { erro: 'Escolha um espaço de trabalho antes de salvar.' }
  return { userId: user.id, ws }
}

function revalidar(calculoId?: string) {
  const base = caminhoDoProduto(SLUG)
  revalidatePath(base)
  if (calculoId) revalidatePath(`${base}/${calculoId}`)
}

export async function salvarCalculo(input: {
  titulo: string
  entrada: EntradaCalculo
}): Promise<{ ok: true; id: string } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: 'Confira os dados do cálculo.' }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  const acesso = await exigirEscrita(PRODUTO_ID)
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .insert({
        workspace_id: ctx.ws,
        user_id: ctx.userId,
        calculo_tipo: CALCULO_TIPO,
        algoritmo_versao: ALGORITMO_VERSAO,
        titulo: p.titulo,
        entrada: p.entrada,
        resultado: p.resultado,
      })
      .select('id')
      .single()
    if (error) throw error
    revalidar()
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    console.error('[detracao] salvarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function atualizarCalculo(input: {
  id: string
  titulo: string
  entrada: EntradaCalculo
}): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (!ehObjeto(input)) return { erro: NAO_ACHOU }
  const id = Id.safeParse(input.id)
  if (!id.success) return { erro: NAO_ACHOU }
  const p = preparar(input)
  if ('erro' in p) return { erro: p.erro }
  const acesso = await exigirEscrita(PRODUTO_ID)
  if ('erro' in acesso) return { erro: acesso.erro }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .update({
        calculo_tipo: CALCULO_TIPO,
        algoritmo_versao: ALGORITMO_VERSAO,
        titulo: p.titulo,
        entrada: p.entrada,
        resultado: p.resultado,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id.data)
      .eq('workspace_id', ctx.ws)
      .eq('user_id', ctx.userId)
      .select('id')
    if (error) throw error
    if (!data?.length) return { erro: NAO_ACHOU }
    revalidar(id.data)
    return { ok: true }
  } catch (err) {
    console.error('[detracao] atualizarCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}

export async function excluirCalculo(idBruto: string): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ctx = await contexto()
  if ('erro' in ctx) return ctx
  if (typeof idBruto !== 'string') return { erro: NAO_ACHOU }
  const id = Id.safeParse(idBruto)
  if (!id.success) return { erro: NAO_ACHOU }

  try {
    const { data, error } = await admin()
      .from(TABELA)
      .delete()
      .eq('id', id.data)
      .eq('workspace_id', ctx.ws)
      .eq('user_id', ctx.userId)
      .select('id')
    if (error) throw error
    if (!data?.length) return { erro: NAO_ACHOU }
    revalidar()
    return { ok: true }
  } catch (err) {
    console.error('[detracao] excluirCalculo', detalheSeguro(err))
    return { erro: fraseDeBanco(err) }
  }
}
```

- [ ] **Step 4: Checar que compila (sem testes de banco aqui — dependem de Supabase; a suíte só valida tipos e o `preparar` puro)**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos nos três arquivos criados.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/calculos.ts" "src/app/(app)/ferramentas/detracao/[calculadora]/preparar.ts" "src/app/(app)/ferramentas/detracao/[calculadora]/acoes.ts"
git commit -m "feat(detracao): leitura, validação e server actions dos cálculos salvos"
```

---

## Task 7: CSS do módulo + editor de intervalos

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/calculadora.module.css`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/EditorIntervalos.tsx`

**Interfaces:**
- Consumes: `Intervalo`, `IntervaloComMotivo` de `@/lib/detracao/recolhimento-noturno/tipos`; `Botao` (`@/components/ui/Botao`), `Campo`/`Entrada` (`@/components/ui/Campo`).
- Produces: classes CSS usadas por todos os componentes das Tasks 8-12; `<EditorIntervalos>` — reusado por `CamposSegmento` (Task 8) para `intervalosAdicionais` (`comMotivo={false}`) e `intervalosExcluidos` (`comMotivo={true}`).

- [ ] **Step 1: Escrever `calculadora.module.css`**

```css
/* calculadora.module.css — formulário e resultado do Recolhimento Noturno, no mesmo vocabulário
 * de token do resto do produto (ver calculadora.module.css do CIC, mesma receita).
 *
 * 🔴 Sem cor em hexadecimal e sem `--borda` (não existe no kit): só token. */

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}
.coluna { min-width: 0; }

.pagina { display: grid; gap: var(--s-6); }

.fieldsetSemBorda { border: 0; padding: 0; margin: 0; min-width: 0; }

.questionario { display: grid; gap: var(--s-5); }

.secao {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
  background: var(--superficie);
  border: 1px solid var(--linha);
  border-radius: var(--r-painel);
  box-shadow: var(--elev-1);
}

.tituloSecao {
  padding: 0 var(--s-2);
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--tinta);
}

.campos { display: grid; gap: var(--s-4); }
.campoTempo { display: grid; gap: var(--s-2); }
.rotuloGrupo { font-size: var(--fs-body); font-weight: 500; color: var(--tinta-2); }
.ajudaGrupo { margin: 0; font-size: var(--fs-body); color: var(--tinta-3); }

.alternadorModo {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-body);
  font-weight: 500;
  color: var(--tinta);
}

.diasSemana { display: flex; flex-wrap: wrap; gap: var(--s-3); }
.diaSemanaItem {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-body);
  color: var(--tinta-2);
}

.editorLista { display: grid; gap: var(--s-3); }
.editorCabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.linhaIntervalo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--linha);
  border-radius: var(--r-controle);
}
.linhaIntervalo > * { min-width: 160px; }

/* ── Resultado ── */
.painel {
  display: grid;
  gap: var(--s-5);
  padding: var(--s-5);
  background: var(--superficie);
  border: 1px solid var(--linha);
  border-radius: var(--r-painel);
  box-shadow: var(--elev-1);
}
.destaque { display: flex; align-items: baseline; gap: var(--s-3); }
.numero { font-size: 2.5rem; font-weight: 700; color: var(--tinta); line-height: 1; }
.rotuloNumero { font-size: var(--fs-body); color: var(--tinta-2); }

.metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-4);
  margin: 0;
}
.metricas dt { font-size: var(--fs-micro); color: var(--tinta-3); }
.metricas dd { margin: 0; font-size: var(--fs-body); font-weight: 600; color: var(--tinta); }

.memoria { font-size: var(--fs-body); color: var(--tinta-2); }
.memoria summary { cursor: pointer; font-weight: 500; color: var(--tinta); }
.listaMemoria {
  display: grid;
  gap: var(--s-1);
  margin: var(--s-2) 0 var(--s-4);
  padding: 0;
  list-style: none;
  font-size: var(--fs-micro);
  color: var(--tinta-3);
}

/* ── Barra de salvar, exclusão, lista — mesma receita do CIC ── */
.barra { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--s-3); margin-bottom: var(--s-5); }
.campoTitulo { flex: 1; min-width: 240px; }
.voltar {
  display: inline-flex; align-items: center; gap: var(--s-2);
  font-size: var(--fs-body); color: var(--tinta-3); text-decoration: none;
  transition: color var(--t-rapido) var(--suave);
}
.voltar:hover { color: var(--tinta); }
.voltar:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; border-radius: var(--r-pequeno); }

.linhaTitulo { display: flex; flex-wrap: wrap; gap: var(--s-3); }
.linhaTitulo > :first-child { flex: 1; min-width: 200px; }

.mensagem {
  flex-basis: 100%; margin: 0; padding: var(--s-2) var(--s-4);
  border-radius: var(--r-controle); font-size: var(--fs-body); font-weight: 500;
}
.mensagem[data-tom='erro'] { background: var(--erro-wash); color: var(--erro); }
.mensagem[data-tom='ok'] { background: var(--ok-wash); color: var(--ok); }

.excluirWrap { display: flex; flex-direction: column; gap: var(--s-3); }
.confirmaExcluir {
  display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4);
  border: 1px solid var(--erro); border-radius: var(--r-controle); background: var(--erro-wash);
}
.confirmaTexto { margin: 0; font-size: var(--fs-body); color: var(--tinta); }
.confirmaAcoes { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }

.notaPrivacidade { max-width: 68ch; margin: 0; font-size: var(--fs-body); color: var(--tinta-2); }

.lista { display: grid; gap: var(--s-3); list-style: none; margin: 0; padding: 0; }
.item {
  display: block; padding: var(--s-4) var(--s-5); background: var(--superficie);
  border: 1px solid var(--linha); border-radius: var(--r-painel); box-shadow: var(--elev-1);
  color: inherit; text-decoration: none; transition: border-color var(--t-rapido) var(--suave);
}
.item:hover { border-color: var(--linha-forte); }
.item:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; border-radius: var(--r-pequeno); }
.itemTitulo { margin: 0 0 var(--s-1); font-size: var(--fs-body); font-weight: 600; color: var(--tinta); }
.itemMeta { font-size: var(--fs-micro); color: var(--tinta-3); }

.listaWrap { display: grid; gap: var(--s-4); }
.busca { max-width: 480px; }
.buscaVazia { margin: 0; padding: var(--s-4) var(--s-5); color: var(--tinta-3); font-size: var(--fs-body); }

.avisoVersao {
  padding: var(--s-4) var(--s-5); background: var(--aviso-wash); border: 1px solid var(--aviso);
  border-radius: var(--r-painel); color: var(--tinta); font-size: var(--fs-body);
}

@media print {
  .layout { grid-template-columns: 1fr; }
  .coluna:first-child { display: none; }
  .barra, .excluirWrap, .voltar { display: none; }
}
```

- [ ] **Step 2: Escrever `EditorIntervalos.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/EditorIntervalos.tsx
'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import type { Intervalo, IntervaloComMotivo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

type Linha = Intervalo | IntervaloComMotivo

/** Reusado para `intervalosAdicionais` (`comMotivo={false}`) e `intervalosExcluidos`
 *  (`comMotivo={true}`) dentro de um segmento — o único jeito de exclusão entrar no cálculo é
 *  aqui, com motivo obrigatório (nunca inferida por falta de monitoramento eletrônico). */
export default function EditorIntervalos<T extends Linha>({
  titulo,
  ajuda,
  itens,
  aoMudar,
  comMotivo,
  emBranco,
}: {
  titulo: string
  ajuda?: string
  itens: T[]
  aoMudar: (itens: T[]) => void
  comMotivo: boolean
  emBranco: T
}) {
  function atualizar(indice: number, campo: 'inicio' | 'fim' | 'motivo', valor: string) {
    aoMudar(itens.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)) as T[])
  }

  function remover(indice: number) {
    aoMudar(itens.filter((_, i) => i !== indice))
  }

  return (
    <div className={estilos.editorLista}>
      <div className={estilos.editorCabecalho}>
        <span className={estilos.rotuloGrupo}>{titulo}</span>
        <Botao type="button" tamanho="pequeno" onClick={() => aoMudar([...itens, emBranco])}>
          <Plus size={14} strokeWidth={2} />
          Adicionar
        </Botao>
      </div>
      {ajuda && <p className={estilos.ajudaGrupo}>{ajuda}</p>}
      {itens.length === 0 ? (
        <p className={estilos.ajudaGrupo}>Nenhum intervalo adicionado.</p>
      ) : (
        itens.map((item, indice) => (
          <div key={indice} className={estilos.linhaIntervalo}>
            <Campo rotulo="Início">
              <EntradaControle
                type="datetime-local"
                value={item.inicio}
                onChange={(e) => atualizar(indice, 'inicio', e.target.value)}
              />
            </Campo>
            <Campo rotulo="Fim">
              <EntradaControle
                type="datetime-local"
                value={item.fim}
                onChange={(e) => atualizar(indice, 'fim', e.target.value)}
              />
            </Campo>
            {comMotivo && (
              <Campo rotulo="Motivo">
                <EntradaControle
                  value={(item as IntervaloComMotivo).motivo}
                  onChange={(e) => atualizar(indice, 'motivo', e.target.value)}
                  placeholder="Viagem autorizada, descumprimento…"
                />
              </Campo>
            )}
            <Botao
              type="button"
              variante="fantasma"
              tom="erro"
              soIcone
              aria-label="Remover intervalo"
              onClick={() => remover(indice)}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </Botao>
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/calculadora.module.css" "src/app/(app)/ferramentas/detracao/[calculadora]/EditorIntervalos.tsx"
git commit -m "feat(detracao): CSS do módulo e editor reusável de intervalos"
```

---

## Task 8: Formulário — campos de um segmento e composição modo simples/avançado

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento.tsx`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/Formulario.tsx`

**Interfaces:**
- Consumes: `EditorIntervalos` (Task 7); `SegmentoFormulario`, `EntradaFormulario`, `segmentoFormularioEmBranco` de `@/lib/detracao/recolhimento-noturno/formulario` (Task 3); `WEEKDAYS`, `ROTULOS_DIA_SEMANA`, `Weekday` de `@/lib/detracao/recolhimento-noturno/tipos`; `Campo`/`Entrada`/`Selecao`/`AreaTexto` de `@/components/ui/Campo`; `Botao`.
- Produces: `<CamposSegmento>` (um segmento) e `<Formulario>` (lista de segmentos + alternância simples/avançado) — consumidos por `Calculadora.tsx` (Task 11).

- [ ] **Step 1: Escrever `CamposSegmento.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento.tsx
'use client'

import { Plus, Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import EditorIntervalos from './EditorIntervalos'
import { ROTULOS_DIA_SEMANA, WEEKDAYS } from '@/lib/detracao/recolhimento-noturno/tipos'
import type { Intervalo, IntervaloComMotivo, Weekday } from '@/lib/detracao/recolhimento-noturno/tipos'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import estilos from './calculadora.module.css'

function SeletorDiasSemana({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string
  valor: Weekday[]
  aoMudar: (v: Weekday[]) => void
}) {
  function alternar(dia: Weekday) {
    aoMudar(valor.includes(dia) ? valor.filter((d) => d !== dia) : [...valor, dia])
  }
  return (
    <div className={estilos.campoTempo}>
      <span className={estilos.rotuloGrupo}>{rotulo}</span>
      <div className={estilos.diasSemana}>
        {WEEKDAYS.map((dia) => (
          <label key={dia} className={estilos.diaSemanaItem}>
            <input type="checkbox" checked={valor.includes(dia)} onChange={() => alternar(dia)} />
            {ROTULOS_DIA_SEMANA[dia]}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function CamposSegmento({
  segmento,
  aoMudar,
  aoRemover,
  avancado,
}: {
  segmento: SegmentoFormulario
  aoMudar: (s: SegmentoFormulario) => void
  aoRemover?: () => void
  avancado: boolean
}) {
  function set<K extends keyof SegmentoFormulario>(campo: K, valor: SegmentoFormulario[K]) {
    aoMudar({ ...segmento, [campo]: valor })
  }

  return (
    <div className={estilos.secao}>
      <div className={estilos.editorCabecalho}>
        <b className={estilos.tituloSecao}>Regra do período</b>
        {aoRemover && (
          <Botao type="button" variante="fantasma" tom="erro" tamanho="pequeno" onClick={aoRemover}>
            <Trash2 size={14} strokeWidth={1.75} />
            Remover segmento
          </Botao>
        )}
      </div>

      <div className={estilos.campos}>
        <Campo rotulo="Início da cautelar" obrigatorio>
          <EntradaControle type="date" value={segmento.dataInicio} onChange={(e) => set('dataInicio', e.target.value)} />
        </Campo>
        <Campo rotulo="Fim da cautelar" obrigatorio>
          <EntradaControle type="date" value={segmento.dataFim} onChange={(e) => set('dataFim', e.target.value)} />
        </Campo>

        {avancado && (
          <>
            <Campo
              rotulo="Data/hora exata de início (opcional)"
              ajuda="Use quando a cautelar começa no meio do dia — evita computar horas anteriores."
            >
              <EntradaControle
                type="datetime-local"
                value={segmento.dataHoraInicioExata ?? ''}
                onChange={(e) => set('dataHoraInicioExata', e.target.value || undefined)}
              />
            </Campo>
            <Campo
              rotulo="Data/hora exata de fim (opcional)"
              ajuda="Use quando a cautelar termina ou é revogada no meio do dia."
            >
              <EntradaControle
                type="datetime-local"
                value={segmento.dataHoraFimExata ?? ''}
                onChange={(e) => set('dataHoraFimExata', e.target.value || undefined)}
              />
            </Campo>
          </>
        )}

        <Campo rotulo="Início do horário noturno" obrigatorio>
          <EntradaControle type="time" value={segmento.horaInicioNoturno} onChange={(e) => set('horaInicioNoturno', e.target.value)} />
        </Campo>
        <Campo rotulo="Fim do horário noturno" obrigatorio ajuda="Pode cair no dia seguinte.">
          <EntradaControle type="time" value={segmento.horaFimNoturno} onChange={(e) => set('horaFimNoturno', e.target.value)} />
        </Campo>

        <SeletorDiasSemana
          rotulo="Dias em que a regra noturna se inicia"
          valor={segmento.diasSemanaNoturno}
          aoMudar={(v) => set('diasSemanaNoturno', v)}
        />
        <SeletorDiasSemana
          rotulo="Dias de folga integral"
          valor={segmento.diasFolgaIntegral}
          aoMudar={(v) => set('diasFolgaIntegral', v)}
        />

        {avancado && (
          <>
            <div className={estilos.editorLista}>
              <div className={estilos.editorCabecalho}>
                <span className={estilos.rotuloGrupo}>Feriados de recolhimento integral</span>
                <Botao type="button" tamanho="pequeno" onClick={() => set('feriadosIntegral', [...segmento.feriadosIntegral, ''])}>
                  <Plus size={14} strokeWidth={2} />
                  Adicionar
                </Botao>
              </div>
              {segmento.feriadosIntegral.map((data, indice) => (
                <div key={indice} className={estilos.linhaIntervalo}>
                  <Campo rotulo={`Feriado ${indice + 1}`}>
                    <EntradaControle
                      type="date"
                      value={data}
                      onChange={(e) => {
                        const proximos = [...segmento.feriadosIntegral]
                        proximos[indice] = e.target.value
                        set('feriadosIntegral', proximos)
                      }}
                    />
                  </Campo>
                  <Botao
                    type="button"
                    variante="fantasma"
                    tom="erro"
                    soIcone
                    aria-label="Remover feriado"
                    onClick={() => set('feriadosIntegral', segmento.feriadosIntegral.filter((_, i) => i !== indice))}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </Botao>
                </div>
              ))}
            </div>

            <EditorIntervalos<Intervalo>
              titulo="Intervalos adicionais"
              ajuda="Restrições especiais que não seguem o padrão semanal."
              itens={segmento.intervalosAdicionais}
              aoMudar={(v) => set('intervalosAdicionais', v)}
              comMotivo={false}
              emBranco={{ inicio: '', fim: '' }}
            />

            <EditorIntervalos<IntervaloComMotivo>
              titulo="Exclusões (descumprimento, viagem autorizada…)"
              ajuda="Reduzem o total pela interseção temporal excluída — nunca por falta de monitoramento eletrônico."
              itens={segmento.intervalosExcluidos}
              aoMudar={(v) => set('intervalosExcluidos', v)}
              comMotivo
              emBranco={{ inicio: '', fim: '', motivo: '' }}
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escrever `Formulario.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/Formulario.tsx
'use client'

import Botao from '@/components/ui/Botao'
import { Campo, Entrada as EntradaControle, AreaTexto, Selecao } from '@/components/ui/Campo'
import CamposSegmento from './CamposSegmento'
import { segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario, SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import estilos from './calculadora.module.css'

export default function Formulario({
  entrada,
  aoMudar,
  avancado,
  aoMudarAvancado,
}: {
  entrada: EntradaFormulario
  aoMudar: (e: EntradaFormulario) => void
  avancado: boolean
  aoMudarAvancado: (v: boolean) => void
}) {
  function mudarSegmento(indice: number, s: SegmentoFormulario) {
    aoMudar({ ...entrada, segmentos: entrada.segmentos.map((seg, i) => (i === indice ? s : seg)) })
  }

  function adicionarSegmento() {
    aoMudar({ ...entrada, segmentos: [...entrada.segmentos, segmentoFormularioEmBranco()] })
  }

  function removerSegmento(indice: number) {
    aoMudar({ ...entrada, segmentos: entrada.segmentos.filter((_, i) => i !== indice) })
  }

  return (
    <div className={estilos.questionario}>
      <label className={estilos.alternadorModo}>
        <input type="checkbox" checked={avancado} onChange={(e) => aoMudarAvancado(e.target.checked)} />
        Modo avançado — múltiplos segmentos, feriados, exclusões e intervalos especiais
      </label>

      {entrada.segmentos.map((segmento, indice) => (
        <CamposSegmento
          key={indice}
          segmento={segmento}
          aoMudar={(s) => mudarSegmento(indice, s)}
          aoRemover={avancado && entrada.segmentos.length > 1 ? () => removerSegmento(indice) : undefined}
          avancado={avancado}
        />
      ))}

      {avancado && (
        <Botao type="button" variante="secundario" onClick={adicionarSegmento}>
          Adicionar segmento de regra (mudança de horário ou revogação no meio do período)
        </Botao>
      )}

      {avancado && (
        <div className={estilos.secao}>
          <b className={estilos.tituloSecao}>Outras informações</b>
          <div className={estilos.campos}>
            <Campo rotulo="Fuso horário" ajuda="Datas/horas locais da decisão.">
              <EntradaControle value={entrada.timezone} onChange={(e) => aoMudar({ ...entrada, timezone: e.target.value })} />
            </Campo>
            <Campo rotulo="Monitoramento eletrônico" ajuda="Informativo — nunca altera o cálculo.">
              <Selecao
                value={entrada.monitoramentoEletronico ?? 'nao_informado'}
                onChange={(e) =>
                  aoMudar({ ...entrada, monitoramentoEletronico: e.target.value as EntradaFormulario['monitoramentoEletronico'] })
                }
              >
                <option value="nao_informado">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Observações" ajuda="Informação de auditoria, sem efeito matemático.">
              <AreaTexto value={entrada.observacoes ?? ''} onChange={(e) => aoMudar({ ...entrada, observacoes: e.target.value })} rows={3} />
            </Campo>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento.tsx" "src/app/(app)/ferramentas/detracao/[calculadora]/Formulario.tsx"
git commit -m "feat(detracao): formulário — campos de segmento e alternância simples/avançado"
```

---

## Task 9: Resultado (destaque + memória de cálculo)

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/Resultado.tsx`

**Interfaces:**
- Consumes: `ResultadoCalculo` de `@/lib/detracao/recolhimento-noturno/tipos`.
- Produces: `<Resultado resultado={...}>` — consumido por `Calculadora.tsx` (Task 11).

- [ ] **Step 1: Escrever `Resultado.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/Resultado.tsx
import type { ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

function formatarInstanteExibicao(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}

export default function Resultado({ resultado }: { resultado: ResultadoCalculo }) {
  return (
    <div className={estilos.painel}>
      <div className={estilos.destaque}>
        <span className={estilos.numero}>{resultado.diasDetracao}</span>
        <span className={estilos.rotuloNumero}>
          {resultado.diasDetracao === 1 ? 'dia de detração' : 'dias de detração'}
        </span>
      </div>

      <dl className={estilos.metricas}>
        <div>
          <dt>Total computável</dt>
          <dd>{resultado.totalHoras}</dd>
        </div>
        <div>
          <dt>Saldo abaixo de 24h (não gera dia a mais)</dt>
          <dd>{resultado.saldoHoras}</dd>
        </div>
        <div>
          <dt>Versão do algoritmo</dt>
          <dd>{resultado.algoritmoVersao}</dd>
        </div>
      </dl>

      <details className={estilos.memoria}>
        <summary>Memória de cálculo</summary>

        <b className={estilos.tituloSecao}>Intervalos consolidados</b>
        {resultado.intervalosConsolidados.length === 0 ? (
          <p className={estilos.ajudaGrupo}>Nenhum intervalo válido — total 0.</p>
        ) : (
          <ul className={estilos.listaMemoria}>
            {resultado.intervalosConsolidados.map((iv, i) => (
              <li key={i}>
                {formatarInstanteExibicao(iv.inicio)} — {formatarInstanteExibicao(iv.fim)}
              </li>
            ))}
          </ul>
        )}

        {resultado.intervalosExcluidos.length > 0 && (
          <>
            <b className={estilos.tituloSecao}>Intervalos excluídos</b>
            <ul className={estilos.listaMemoria}>
              {resultado.intervalosExcluidos.map((iv, i) => (
                <li key={i}>
                  {formatarInstanteExibicao(iv.inicio)} — {formatarInstanteExibicao(iv.fim)} · {iv.motivo}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/Resultado.tsx"
git commit -m "feat(detracao): tela de resultado com memória de cálculo expansível"
```

---

## Task 10: Barra de salvar e exclusão

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/BarraSalvar.tsx`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/ExcluirCalculo.tsx`

**Interfaces:**
- Consumes: `salvarCalculo`, `atualizarCalculo`, `excluirCalculo` de `./acoes` (Task 6); `caminhoDoProduto` (Task 4); `EntradaCalculo` (Task 1).
- Produces: `<BarraSalvar>`, `<ExcluirCalculo>` — consumidos por `Calculadora.tsx`/`[id]/page.tsx` (Tasks 11-12).

- [ ] **Step 1: Escrever `BarraSalvar.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/BarraSalvar.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
import { Campo as CampoUI, Entrada as EntradaControle } from '@/components/ui/Campo'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import type { EntradaCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import { atualizarCalculo, salvarCalculo } from './acoes'
import estilos from './calculadora.module.css'

type Aviso = { tom: 'ok' | 'erro'; texto: string }

const SLUG = 'recolhimento-noturno'

export default function BarraSalvar({
  entrada,
  calculoId,
  titulo,
  aoMudarTitulo,
}: {
  entrada: EntradaCalculo
  calculoId?: string
  titulo: string
  aoMudarTitulo: (valor: string) => void
}) {
  const router = useRouter()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [pendente, iniciar] = useTransition()

  function avisar(tom: Aviso['tom'], texto: string) {
    setAviso({ tom, texto })
    setTimeout(() => setAviso(null), 6000)
  }

  function salvar() {
    iniciar(async () => {
      if (calculoId) {
        const r = await atualizarCalculo({ id: calculoId, titulo, entrada })
        if ('erro' in r) return avisar('erro', r.erro)
        avisar('ok', 'Alterações salvas.')
        router.refresh()
        return
      }
      const r = await salvarCalculo({ titulo, entrada })
      if ('erro' in r) return avisar('erro', r.erro)
      router.push(`${caminhoDoProduto(SLUG)}/${r.id}`)
    })
  }

  return (
    <div className={estilos.barra}>
      <CampoUI
        rotulo="Título do cálculo"
        ajuda="Use o nº de execução para não guardar o nome do sentenciado."
        className={estilos.campoTitulo}
      >
        <div className={estilos.linhaTitulo}>
          <EntradaControle
            value={titulo}
            onChange={(e) => aoMudarTitulo(e.target.value)}
            placeholder="Nº de execução ou identificação do caso"
            maxLength={200}
          />
          <Botao variante="primario" onClick={salvar} carregando={pendente} desabilitado={pendente}>
            {calculoId ? 'Salvar alterações' : 'Salvar cálculo'}
          </Botao>
        </div>
      </CampoUI>
      {aviso && (
        <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={estilos.mensagem} data-tom={aviso.tom}>
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Escrever `ExcluirCalculo.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/ExcluirCalculo.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { excluirCalculo } from './acoes'
import estilos from './calculadora.module.css'

const SLUG = 'recolhimento-noturno'

export default function ExcluirCalculo({ id }: { id: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function excluir() {
    setErro(null)
    iniciar(async () => {
      const r = await excluirCalculo(id)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      router.push(caminhoDoProduto(SLUG))
      router.refresh()
    })
  }

  if (!confirmando) {
    return (
      <div className={estilos.excluirWrap}>
        <Botao type="button" variante="fantasma" tom="erro" carregando={pendente} onClick={() => setConfirmando(true)}>
          <Trash2 size={14} strokeWidth={1.75} />
          Excluir este cálculo
        </Botao>
        {erro && (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={estilos.excluirWrap}>
      <div className={estilos.confirmaExcluir} role="alertdialog" aria-live="polite">
        <p className={estilos.confirmaTexto}>
          Este cálculo será apagado de vez, com tudo o que foi respondido nele. Não dá para desfazer.
        </p>
        <div className={estilos.confirmaAcoes}>
          <Botao type="button" variante="primario" tom="erro" carregando={pendente} onClick={excluir}>
            {pendente ? 'Excluindo…' : 'Excluir mesmo assim'}
          </Botao>
          <Botao type="button" carregando={pendente} onClick={() => setConfirmando(false)}>
            Cancelar
          </Botao>
        </div>
        {erro && (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/BarraSalvar.tsx" "src/app/(app)/ferramentas/detracao/[calculadora]/ExcluirCalculo.tsx"
git commit -m "feat(detracao): barra de salvar e exclusão em duas etapas"
```

---

## Task 11: Calculadora (orquestração) e lista de cálculos

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/Calculadora.tsx`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/ListaCalculos.tsx`

**Interfaces:**
- Consumes: `Formulario` (Task 8), `Resultado` (Task 9), `BarraSalvar` (Task 10), `calcular` (Task 2), `entradaFormularioParaCalculo`/`segmentoFormularioEmBranco` (Task 3), `CalculoResumo` (Task 6).
- Produces: `<Calculadora inicial? calculoId? tituloInicial? somenteLeitura?>`, `<ListaCalculos calculos={...}>` — consumidos pelas páginas (Task 12).

- [ ] **Step 1: Escrever `Calculadora.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/Calculadora.tsx
'use client'

import { useMemo, useState } from 'react'
import Formulario from './Formulario'
import Resultado from './Resultado'
import BarraSalvar from './BarraSalvar'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { paraInstante } from '@/lib/detracao/recolhimento-noturno/intervalos'
import { entradaFormularioParaCalculo, segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/tipos'
import estilos from './calculadora.module.css'

/** O `fim` salvo é sempre exclusivo (ex.: "dia seguinte às 00:00" para representar o último dia
 *  inteiro — ver `formulario.ts`). Mostrar essa data direto no campo "Fim da cautelar" adiantaria
 *  um dia na tela; a data exibida é a do ÚLTIMO INSTANTE ainda dentro da janela. */
function dataFimExibicao(fimISO: string): string {
  return new Date(paraInstante(fimISO) - 1).toISOString().slice(0, 10)
}

function entradaInicial(inicial?: EntradaCalculo): EntradaFormulario {
  if (!inicial) {
    return { timezone: 'America/Sao_Paulo', segmentos: [segmentoFormularioEmBranco()] }
  }
  return {
    timezone: inicial.timezone,
    observacoes: inicial.observacoes,
    monitoramentoEletronico: inicial.monitoramentoEletronico,
    // O segmento salvo já tem `inicio`/`fim` exatos — reaproveitados como data/hora exata, para
    // que reabrir um cálculo nunca perca precisão nem recalcule diferente do que foi gravado.
    // `dataInicio`/`dataFim` só alimentam a EXIBIÇÃO do modo simples; quem manda no recálculo é
    // sempre `dataHoraInicioExata`/`dataHoraFimExata` (ver `segmentoParaRegra`).
    segmentos: inicial.segmentos.map((s) => ({
      dataInicio: s.inicio.slice(0, 10),
      dataFim: dataFimExibicao(s.fim),
      dataHoraInicioExata: s.inicio,
      dataHoraFimExata: s.fim,
      horaInicioNoturno: s.horaInicioNoturno,
      horaFimNoturno: s.horaFimNoturno,
      diasSemanaNoturno: s.diasSemanaNoturno,
      diasFolgaIntegral: s.diasFolgaIntegral,
      feriadosIntegral: s.feriadosIntegral,
      intervalosAdicionais: s.intervalosAdicionais,
      intervalosExcluidos: s.intervalosExcluidos,
    })),
  }
}

export default function Calculadora({
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura,
}: {
  inicial?: EntradaCalculo
  calculoId?: string
  tituloInicial?: string
  somenteLeitura?: boolean
}) {
  const [entrada, setEntrada] = useState<EntradaFormulario>(() => entradaInicial(inicial))
  const [avancado, setAvancado] = useState(() => Boolean(inicial && inicial.segmentos.length > 1))
  const [titulo, setTitulo] = useState(tituloInicial ?? '')

  // Sair do modo avançado descarta segmentos extras — em modo simples só o primeiro é editável,
  // e deixá-los "escondidos" contribuindo pro cálculo confundiria o membro (ver spec §4).
  function mudarAvancado(v: boolean) {
    setAvancado(v)
    if (!v) setEntrada((e) => ({ ...e, segmentos: e.segmentos.slice(0, 1) }))
  }

  const resultado = useMemo<{ ok: true; valor: ResultadoCalculo } | { ok: false; erro: string }>(() => {
    try {
      return { ok: true, valor: calcular(entradaFormularioParaCalculo(entrada)) }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Confira os dados do cálculo.' }
    }
  }, [entrada])

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        {!somenteLeitura && (
          <BarraSalvar
            entrada={entradaFormularioParaCalculo(entrada)}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
          />
        )}
        <fieldset disabled={somenteLeitura} className={estilos.fieldsetSemBorda}>
          <Formulario entrada={entrada} aoMudar={setEntrada} avancado={avancado} aoMudarAvancado={mudarAvancado} />
        </fieldset>
      </div>
      <div className={estilos.coluna}>
        {resultado.ok ? (
          <Resultado resultado={resultado.valor} />
        ) : (
          <p className={estilos.mensagem} data-tom="erro" role="alert">
            {resultado.erro}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escrever `ListaCalculos.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/ListaCalculos.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { formatarDataHora } from '@/lib/data-hora'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import type { CalculoResumo } from './calculos'
import estilos from './calculadora.module.css'

const SLUG = 'recolhimento-noturno'

function filtrar(calculos: CalculoResumo[], termo: string): CalculoResumo[] {
  const t = termo.trim().toLowerCase()
  if (!t) return calculos
  return calculos.filter((c) => c.titulo.toLowerCase().includes(t))
}

export default function ListaCalculos({ calculos }: { calculos: CalculoResumo[] }) {
  const [termo, setTermo] = useState('')
  const filtrados = useMemo(() => filtrar(calculos, termo), [calculos, termo])

  return (
    <div className={estilos.listaWrap}>
      <Campo rotulo="Buscar" className={estilos.busca}>
        <EntradaControle type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Título do cálculo" />
      </Campo>

      {filtrados.length === 0 ? (
        <p className={estilos.buscaVazia}>Nenhum cálculo encontrado para &quot;{termo}&quot;.</p>
      ) : (
        <ul className={estilos.lista}>
          {filtrados.map((c) => (
            <li key={c.id}>
              <Link href={`${caminhoDoProduto(SLUG)}/${c.id}`} className={estilos.item}>
                <b className={estilos.itemTitulo}>{c.titulo}</b>
                <div className={estilos.itemMeta}>
                  algoritmo {c.algoritmo_versao} · {formatarDataHora(c.atualizado_em)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/Calculadora.tsx" "src/app/(app)/ferramentas/detracao/[calculadora]/ListaCalculos.tsx"
git commit -m "feat(detracao): orquestração da calculadora e lista de cálculos salvos"
```

---

## Task 12: Páginas (lista, novo, reabrir)

**Files:**
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/novo/page.tsx`
- Create: `src/app/(app)/ferramentas/detracao/[calculadora]/[id]/page.tsx`

**Interfaces:**
- Consumes: `ListaCalculos`/`Calculadora` (Task 11); `ExcluirCalculo` (Task 10); `listarCalculos`/`lerCalculo` (Task 6); `calcular`/`mesmoResultado` (Task 2); `estadoDoProduto` (existente); `caminhoDoProduto` (Task 4).
- Produces: rotas `/ferramentas/detracao/recolhimento-noturno`, `/ferramentas/detracao/recolhimento-noturno/novo`, `/ferramentas/detracao/recolhimento-noturno/<id>`.

> Nota: a pasta é `[calculadora]` (mesmo nome da rota do CIC) só por convenção de projeto — hoje
> só existe o slug `recolhimento-noturno` nela, mas as páginas não fixam isso: leem `estadoDoProduto`
> e `caminhoDoProduto` pelo id/slug do produto, igual ao CIC.

- [ ] **Step 1: Escrever `page.tsx` (lista)**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx
import { Moon } from 'lucide-react'
import { redirect } from 'next/navigation'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { listarCalculos } from './calculos'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import ListaCalculos from './ListaCalculos'
import estilos from './calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'
const CALCULO_TIPO = 'recolhimento-noturno'

export async function generateMetadata() {
  return { title: await tituloDaPagina('GPS Detração - Recolhimento Noturno') }
}

export default async function ListaPage() {
  const estado = await estadoDoProduto(PRODUTO_ID)
  if (estado === 'nunca') redirect('/ferramentas')
  const ativo = estado === 'ativo'

  const base = caminhoDoProduto(SLUG)
  const calculos = await listarCalculos(CALCULO_TIPO)
  const novo = ativo ? (
    <Botao href={`${base}/novo`} variante="primario">
      Novo cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo="GPS Detração - Recolhimento Noturno"
        subtitulo="Some as horas de recolhimento noturno e converta em dias de detração (Tema 1.155/STJ)"
        acoes={novo}
      />

      {!ativo && (
        <div className={estilos.avisoVersao} role="status">
          <b>Acesso encerrado.</b> Os seus cálculos continuam aqui para consulta. Para criar ou
          editar, renove o acesso.
        </div>
      )}

      {calculos.length === 0 ? (
        <EstadoVazio
          icone={<Moon size={20} strokeWidth={2} />}
          titulo="Nenhum cálculo salvo"
          texto="Crie o primeiro e ele fica guardado na sua conta."
          acao={novo}
        />
      ) : (
        <ListaCalculos calculos={calculos} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Escrever `novo/page.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/novo/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import { tituloDaPagina } from '@/server/marca'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default async function NovoPage() {
  const base = caminhoDoProduto(SLUG)
  if ((await estadoDoProduto(PRODUTO_ID)) !== 'ativo') redirect(base)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={base} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            GPS Detração - Recolhimento Noturno
          </Link>
        }
        titulo="Novo cálculo"
        subtitulo="Tema Repetitivo 1.155/STJ"
      />
      <p className={estilos.notaPrivacidade}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
      <Calculadora />
    </div>
  )
}
```

- [ ] **Step 3: Escrever `[id]/page.tsx`**

```tsx
// src/app/(app)/ferramentas/detracao/[calculadora]/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { mesmoResultado } from '@/lib/detracao/recolhimento-noturno/comparar'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

const PRODUTO_ID = 'detracao-recolhimento-noturno'
const SLUG = 'recolhimento-noturno'
const CALCULO_TIPO = 'recolhimento-noturno'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function CalculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id inexistente, malformado
  // ou de outro membro/workspace — os três viram 404 do mesmo jeito, sem diferenciar qual foi.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()
  if (calculo.calculo_tipo !== CALCULO_TIPO) notFound()

  const estado = await estadoDoProduto(PRODUTO_ID)
  if (estado === 'nunca') notFound()

  // O cálculo é refeito com o motor ATUAL. Se a fórmula mudou desde que foi salvo, o membro
  // precisa saber — o número antigo pode já ter virado petição. `mesmoResultado` compara por
  // estrutura, não por `JSON.stringify` (a coluna é jsonb — ordem de chave não é garantida).
  const agora = calcular(calculo.entrada)
  const mudou = calculo.algoritmo_versao !== agora.algoritmoVersao && !mesmoResultado(agora, calculo.resultado)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={caminhoDoProduto(SLUG)} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            GPS Detração - Recolhimento Noturno
          </Link>
        }
        titulo={calculo.titulo}
        subtitulo="Tema Repetitivo 1.155/STJ"
      />

      {mudou && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo mudou.</b> Ele foi salvo com o algoritmo versão {calculo.algoritmo_versao};
          a versão atual é a {agora.algoritmoVersao} e produz um resultado diferente. O que
          aparece abaixo é o cálculo <b>refeito agora</b>. Salve de novo para gravar o resultado
          atualizado.
        </div>
      )}

      <Calculadora
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
        somenteLeitura={estado !== 'ativo'}
      />

      <ExcluirCalculo id={calculo.id} />
    </div>
  )
}
```

- [ ] **Step 4: Checar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx" "src/app/(app)/ferramentas/detracao/[calculadora]/novo/page.tsx" "src/app/(app)/ferramentas/detracao/[calculadora]/[id]/page.tsx"
git commit -m "feat(detracao): páginas de lista, novo cálculo e reabertura"
```

---

## Task 13: Menu — "Calculadoras" e a seção "Detração"

**Files:**
- Modify: `src/components/shell/Rail.tsx`

**Interfaces:**
- Consumes: `Produto`, `caminhoDoProduto`, `PRODUTOS` de `@/lib/produtos/catalogo` (Task 4).
- Produces: menu lateral com "Calculadoras" (antes "Ferramentas") agrupando "Indulto e Comutação" e "Detração".

- [ ] **Step 1: Importar `Moon` e o tipo `Produto`**

Em `src/components/shell/Rail.tsx`, na linha 2-7 (o bloco de import de ícones), acrescentar `Moon` à lista importada de `lucide-react`:

```tsx
import {
  LayoutGrid, LayoutDashboard, Target, CalendarClock, BarChart3,
  Contact, Building2, Settings, Zap, MessageSquare, BookOpen,
  Wallet, FileText, Package, Truck, Receipt, Users,
  Bot, Boxes, ClipboardList, Landmark, Sparkles, Puzzle, Scale, Moon,
} from 'lucide-react'
```

E na linha 18 (`import { PRODUTOS, caminhoDoProduto } from '@/lib/produtos/catalogo'`), acrescentar o tipo:

```tsx
import { PRODUTOS, caminhoDoProduto, type Produto } from '@/lib/produtos/catalogo'
```

- [ ] **Step 2: Declarar as famílias do menu, acima do componente `Rail`**

Logo após o bloco `ICONES`/`iconeDe` (antes de `export default async function Rail`):

```tsx
const FAMILIAS: Array<{ chave: Produto['familia']; rotulo: string; icone: React.ReactNode }> = [
  { chave: 'indulto-comutacao', rotulo: 'Indulto e Comutação', icone: <Scale size={16} strokeWidth={2} /> },
  { chave: 'detracao', rotulo: 'Detração', icone: <Moon size={16} strokeWidth={2} /> },
]
```

- [ ] **Step 3: Substituir o bloco da seção de ferramentas**

Substituir todo o trecho (linhas ~125-143 do arquivo lido nesta sessão):

```tsx
        {produtosNoMenu.length > 0 && (
        <>
        <div className={estilos.sec}>Ferramentas</div>
        {}
        <div className={estilos.navGrupo}>
          <Scale size={16} strokeWidth={2} />
          <span>Indulto e Comutação</span>
        </div>
        {produtosNoMenu.map(({ produto }) => (
          <ItemNav
            key={produto.id}
            href={caminhoDoProduto(produto.slug)}
            rotulo={produto.menuTitulo}
            descricao={produto.menuDescricao}
            indentado
          />
        ))}
        </>
        )}
```

por:

```tsx
        {produtosNoMenu.length > 0 && (
        <>
        <div className={estilos.sec}>Calculadoras</div>
        {FAMILIAS.map(({ chave, rotulo, icone }) => {
          const itens = produtosNoMenu.filter(({ produto }) => produto.familia === chave)
          if (itens.length === 0) return null
          return (
            <Fragment key={chave}>
              <div className={estilos.navGrupo}>
                {icone}
                <span>{rotulo}</span>
              </div>
              {itens.map(({ produto }) => (
                <ItemNav
                  key={produto.id}
                  href={caminhoDoProduto(produto.slug)}
                  rotulo={produto.menuTitulo}
                  descricao={produto.menuDescricao}
                  indentado
                />
              ))}
            </Fragment>
          )
        })}
        </>
        )}
```

(`Fragment` já está importado na linha 1 do arquivo — nenhum import novo necessário para isso.)

- [ ] **Step 4: Checar tipos e rodar a suíte inteira**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sem erros novos; toda a suíte (CIC + detração + catálogo) PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/Rail.tsx
git commit -m "feat(menu): renomeia Ferramentas para Calculadoras e agrupa por família (Indulto e Comutação / Detração)"
```

---

## Task 14: Documentação de lógica versionada

**Files:**
- Create: `docs/detracao-recolhimento-noturno/logica.md`

**Interfaces:**
- Nenhuma — documento, sem código.

- [ ] **Step 1: Escrever `logica.md`**

```md
# Detração por Recolhimento Noturno — lógica versionada

> Documento de referência da REGRA jurídica e do ALGORITMO da calculadora "GPS Detração -
> Recolhimento Noturno". Atualize a seção "Histórico de versões" toda vez que a jurisprudência ou
> o motor mudarem — é este arquivo que responde "por que este cálculo deu esse número" um ano
> depois.
>
> Código: `src/lib/detracao/recolhimento-noturno/`. Tela: `src/app/(app)/ferramentas/detracao/[calculadora]/`.
> Spec de origem: `../superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md`.

## 1. Base jurídica

- **Tema Repetitivo 1.155/STJ** (REsp 1.977.135/SC, Terceira Seção, julgado em 23/11/2022,
  publicado em 28/11/2022): o recolhimento domiciliar noturno e em dias de folga é computável
  para detração penal.
- **Monitoramento eletrônico não é requisito** para o cômputo — a tornozeleira é informativa,
  nunca condição matemática do cálculo.
- **Conversão**: somam-se as horas de todos os períodos válidos e consolidados; o total em
  minutos é dividido por 1440 (`floor`), e a fração inferior a 24h é desprezada — nunca
  arredondada para cima.
- **Descumprimento comprovado** exclui o respectivo período do cômputo (jurisprudência posterior
  do STJ, 2026) — mas essa é uma decisão de CADA CASO: o motor nunca presume descumprimento por
  conta própria, só aplica as exclusões que o usuário informar, com motivo.

## 2. O que o motor NÃO faz (por decisão deliberada)

- Não infere "dia inteiro" de um horário `00:00–00:00` — isso é rejeitado como ambíguo. Dia
  inteiro é sempre um dia de folga integral ou feriado, explícito.
- Não lê `monitoramentoEletronico` em nenhum ponto do cálculo — o campo existe só para o
  relatório, nunca para decidir se um período conta.
- Não exclui automaticamente por falta de monitoramento eletrônico.
- Não converte dias de detração em "meses de 30 dias" — essa conversão, se necessária, é de um
  módulo de execução da pena, não desta calculadora.

## 3. Algoritmo (versão RN-1.0)

Implementado em `src/lib/detracao/recolhimento-noturno/motor.ts`, função `calcular`:

1. Valida cada segmento: horário no formato `HH:MM`, início ≠ fim do horário noturno quando há
   dias noturnos configurados, janela do segmento com fim posterior ao início.
2. Para cada data tocada pela janela do segmento:
   - Se o dia da semana está entre os dias noturnos, gera `[data+horaInicio, data+horaFim)`
     (rolando para o dia seguinte quando `horaFim <= horaInicio`).
   - Se o dia da semana está entre os dias de folga integral, ou a data está entre os feriados
     integrais, gera `[data 00:00, data+1 00:00)`.
   - Os dois casos acima são recortados pela janela do próprio segmento.
3. Acrescenta os intervalos adicionais do segmento (já recortados pela janela).
4. Recorta e acumula os intervalos excluídos do segmento (motivo obrigatório).
5. Subtrai as exclusões de todos os intervalos gerados (`subtrairIntervalos`).
6. Une os intervalos sobrepostos ou contíguos (`mergeIntervalos`) — é este passo que evita
   contar duas vezes a sobreposição entre, por exemplo, "sexta 22h–sábado 06h" e "sábado
   integral": sem união, a soma ingênua chegaria a 32h; com união, o resultado correto é 26h.
7. Soma a duração em minutos inteiros.
8. `diasDetracao = floor(totalMinutos / 1440)`; `saldoMinutos = totalMinutos % 1440`.

### Fórmula central

```
TOTAL_MINUTOS   = Σ duração(intervalos_válidos_consolidados)
DIAS_DETRACAO   = floor(TOTAL_MINUTOS / 1440)
SALDO_MINUTOS   = TOTAL_MINUTOS mod 1440
```

## 4. Modelo de dados

Ver `src/lib/detracao/recolhimento-noturno/tipos.ts` para os tipos exatos (`SegmentoRegra`,
`EntradaCalculo`, `ResultadoCalculo`). Resumo:

- Um cálculo tem 1+ **segmentos de regra**, cada um com vigência própria — permite representar
  mudança de horário, folga ou revogação no meio do processo sem misturar regras.
- Cada segmento carrega: janela `[início, fim)`, horário noturno, dias da semana noturnos, dias
  de folga integral, feriados integrais, intervalos adicionais (fora do padrão semanal) e
  intervalos excluídos (com motivo).
- O resultado salvo carrega a memória de cálculo inteira: intervalos consolidados, intervalos
  excluídos, totais e a versão do algoritmo — o suficiente para reconstruir manualmente o total.

## 5. Casos de borda tratados

| Caso | Decisão |
|---|---|
| Horário `00:00–00:00` | Rejeitado como ambíguo — use folga integral. |
| Fuso horário | Datas/horas são sempre locais da decisão; sem conversão de fuso real (o Brasil não adota horário de verão hoje — ver §6 para o limite disso). |
| Precisão | Duração sempre em inteiros (minutos/milissegundos), nunca `float`. |
| Data final | Internamente sempre fim exclusivo — "último dia" vira o início do dia seguinte. |
| Feriados | Nunca presumidos (nacional/estadual/municipal) — só os que o usuário informar. |
| Resultado zero | É um resultado válido, não um erro — 0 dias quando não há intervalos válidos ou o total é menor que 24h. |

## 6. Limitações conhecidas (registradas, não escondidas)

- **Sem conversão real de fuso horário**: o campo `timezone` é gravado para auditoria, mas o
  motor trata toda data/hora como um eixo "ingênuo" (sem deslocamento de fuso). Isso é seguro
  hoje porque o Brasil não adota horário de verão. Se um caso precisar de um fuso com DST, o
  motor precisa ganhar aritmética de fuso real antes de ser usado nesse cenário — não faça essa
  suposição silenciosamente.
- **Sem exportação em PDF/CSV/JSON** do resultado — fica para uma versão seguinte.
- **Sem "golden master" contra a calculadora de referência**: o plano de implementação recomenda
  rodar 10-20 cenários conhecidos na ferramenta original (Streamlit) e comparar — isso ainda não
  foi feito. Antes de confiar cegamente num número desta calculadora em um caso de alto valor,
  vale essa conferência manual.

## Histórico de versões

- **RN-1.0** (2026-09-15) — primeira versão. Implementa o pipeline do plano de implementação
  anexado nesta data (base: Tema 1.155/STJ, REsp 1.977.135/SC). Ver
  `docs/superpowers/specs/2026-09-15-detracao-recolhimento-noturno-design.md` e
  `docs/superpowers/plans/2026-09-15-detracao-recolhimento-noturno.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/detracao-recolhimento-noturno/logica.md
git commit -m "docs(detracao): documento de lógica versionada (base jurídica, algoritmo, limitações)"
```

---

## Task 15: Verificação final

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS, sem regressão em `tests/indulto-comutacao`, `tests/produtos`, `tests/vendas`, e com toda `tests/detracao` verde.

- [ ] **Step 2: Checagem de tipos do projeto inteiro**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `pnpm build`
Expected: build conclui sem erro — confirma que as rotas novas (`/ferramentas/detracao/recolhimento-noturno`, `.../novo`, `.../[id]`) compilam e que nenhum componente de servidor está passando função para um componente de cliente (o defeito documentado em `docs/calculadora-indulto-comutacao/fronteira-rsc.md`).

- [ ] **Step 4: Conferência manual rápida no navegador (dev server)**

Run: `pnpm dev`, depois abrir `/ferramentas/detracao/recolhimento-noturno` logado como dono do deploy (que passa por cima do gate de venda — ver `contextoDeAcesso` em `server/vendas/acesso.ts`).

Expected:
- Menu lateral mostra "Calculadoras" com as duas seções "Indulto e Comutação" e "Detração".
- "Novo cálculo" abre o formulário em modo simples; alternar para avançado revela segmentos
  múltiplos, feriados, exclusões e as outras informações (fuso/observações/monitoramento).
- Preencher um segmento simples (datas + horário noturno + um dia da semana) atualiza o
  resultado ao vivo, com dias de detração em destaque e a memória de cálculo expansível.
- Salvar cria o registro e navega para `/ferramentas/detracao/recolhimento-noturno/<id>`;
  reabrir a lista mostra o cálculo salvo; excluir remove e volta para a lista.

- [ ] **Step 5: Nenhum commit neste task — é só verificação. Se algo falhar, volte ao task correspondente, corrija, rode o teste daquele task de novo, e só então repita a Task 15.**
