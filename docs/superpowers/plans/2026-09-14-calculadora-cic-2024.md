# GPS CIC — Calculadora 2024 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a GPS CIC - Calculadora 2024, que aplica o Decreto nº 12.338/2024 com a mesma experiência da calculadora de 2025, vendida como produto próprio.

**Architecture:** Um motor isolado em `src/lib/indulto-comutacao/motores/2024/`, transcrito célula a célula da planilha comercial, plugado no `REGISTRO` existente. As telas de 2025 são movidas para uma rota parametrizada `/ferramentas/[calculadora]` que serve os dois decretos sem duplicar componente. A prova de corretude é a comparação contra a planilha, congelada por um oráculo Python.

**Tech Stack:** Next.js App Router (RSC + server actions), TypeScript, Vitest, Supabase/PostgREST, Python 3.9 com `formulas==1.3.4` e `openpyxl` (só para gerar o congelado, fora do `pnpm test`).

**Spec:** `docs/superpowers/specs/2026-09-14-calculadora-cic-2024-design.md`

## Global Constraints

- **Fonte de verdade jurídica:** `validacao/2024/planilha.xlsx` (versão comercial). Nunca editar nenhuma planilha.
- **`validacao/2024/planilha-rascunho.xlsx`** serve só como documentação: a coluna `C` da aba `Cálculo` descreve cada requisito em português. As **fórmulas** dele estão desatualizadas em três pontos (§0.1 do spec) — nunca transcrever fórmula do rascunho.
- **Não tocar em `src/lib/indulto-comutacao/motores/2025/`** nem em `validacao/2025/esperado.json`.
- **Convenção de tempo de pena:** 30 dias/mês, 360 dias/ano. Exceção: o inciso IV usa dias-calendário reais (célula `F43` = `E43 - D43`).
- **O §2º de 2024 usa idade ≥ 60 anos** (`DATE(2024-60,12,25)`), com **5** marcadores: `I32`, `I35`, `I36`, `I38`, `I39`.
- **Data-base:** `2024-12-25`. Toda pergunta é apurada nessa data.
- **`id` do motor e do produto:** `indulto-comutacao-2024`. **Slug de rota:** `cic-2024`.
- **Rótulo do produto no menu:** `GPS CIC - Calculadora 2024`. **Descrição:** `Decreto 12.338/2024`.
- **Commits em português**, no padrão do repositório (`feat(cic-2024): …`, `refactor(ferramentas): …`).
- **Branch:** `calculadora2024`. **Não fazer push** — push no `main` publica em produção.
- Rodar `pnpm test` ao fim de cada task. A árvore fica verde entre tasks.

## File Structure

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/indulto-comutacao/motores/2024/questionario.ts` | as 50 perguntas com a redação de 2024 |
| `src/lib/indulto-comutacao/motores/2024/incisos.ts` | metadados dos 23 dispositivos + `AVISOS_2024` |
| `src/lib/indulto-comutacao/motores/2024/motor.ts` | `calcular2024` e `CHAVES_CONSUMIDAS` |
| `src/lib/indulto-comutacao/motores/2024/peticoes.ts` | os dois modelos de petição (Task 13) |
| `src/lib/indulto-comutacao/motores/2024/index.ts` | `motor2024` |
| `validacao/2024/cenarios.json` | entradas do oráculo |
| `validacao/2024/esperado.json` | **gerado** pelo oráculo |
| `tests/indulto-comutacao/motor-2024.spec.ts` | motor × planilha |
| `tests/indulto-comutacao/questionario-2024.spec.ts` | forma do questionário |
| `tests/indulto-comutacao/incisos-2024.spec.ts` | ordem e regra especial dos dispositivos |
| `tests/indulto-comutacao/reconciliacao-2024.spec.ts` | questionário ↔ motor |
| `tests/indulto-comutacao/peticao-2024.spec.ts` | petições (Task 13) |
| `tests/produtos/catalogo.spec.ts` | slug único, produto ↔ motor |

**Movidos** (de `src/app/(app)/ferramentas/cic-2025/` para `src/app/(app)/ferramentas/[calculadora]/`): os 21 arquivos da rota, sem mudar responsabilidade.

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `src/lib/produtos/catalogo.ts` | campo `slug`, `href` derivado, helpers, entrada de 2024 |
| `src/lib/indulto-comutacao/registro.ts` | `motor2024` no array |
| `src/components/shell/Rail.tsx` | `produto.href` → `caminhoDoProduto(produto.slug)` |
| `src/app/(app)/ferramentas/page.tsx` | itera os produtos em vez de um `<Link>` fixo |
| `validacao/oraculo.py` | aceita `2024` com mapa próprio |
| `validacao/README.md` | seção de 2024 |
| `tests/fronteira-rsc.spec.ts`, `tests/indulto-comutacao/preparar.spec.ts`, `filtro-calculos.spec.ts`, `respostas-anexo.spec.ts` | caminhos `cic-2025/` → `[calculadora]/` |

---

## FATIA 1 — Rota parametrizada

Nenhuma regra de cálculo muda aqui. 2025 continua na mesma URL.

### Task 1: Slug no catálogo de produtos

**Files:**
- Modify: `src/lib/produtos/catalogo.ts`
- Modify: `src/components/shell/Rail.tsx:77`
- Test: `tests/produtos/catalogo.spec.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `PRODUTOS[n].slug: string`; `caminhoDoProduto(slug: string): string`; `produtoPorSlug(slug: string): Produto | null`; `slugDoMotor(motorId: string): string | null`; tipo `Produto = (typeof PRODUTOS)[number]`. O campo `href` **deixa de existir**.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/produtos/catalogo.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PRODUTOS,
  caminhoDoProduto,
  produtoPorSlug,
  slugDoMotor,
  produtoDoMotor,
} from '@/lib/produtos/catalogo'
import { REGISTRO } from '@/lib/indulto-comutacao/registro'

describe('catálogo de produtos', () => {
  it('não repete slug', () => {
    const slugs = PRODUTOS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('usa slug em forma de segmento de URL', () => {
    for (const p of PRODUTOS) {
      expect(p.slug, p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('monta o caminho a partir do slug', () => {
    expect(caminhoDoProduto('cic-2025')).toBe('/ferramentas/cic-2025')
  })

  it('resolve slug para produto, e devolve null para o resto', () => {
    expect(produtoPorSlug('cic-2025')?.id).toBe('indulto-comutacao-2025')
    expect(produtoPorSlug('nao-existe')).toBeNull()
    expect(produtoPorSlug('')).toBeNull()
  })

  it('resolve motor para slug, e devolve null para o resto', () => {
    expect(slugDoMotor('indulto-comutacao-2025')).toBe('cic-2025')
    expect(slugDoMotor('indulto-comutacao-1988')).toBeNull()
  })

  it('todo produto do catálogo tem motor no registro', () => {
    const idsMotor = REGISTRO.map((m) => m.id)
    for (const p of PRODUTOS) {
      expect(idsMotor, `produto ${p.id} sem motor`).toContain(p.id)
    }
  })

  it('todo motor do registro tem produto no catálogo', () => {
    for (const m of REGISTRO) {
      expect(produtoDoMotor(m.id), `motor ${m.id} sem produto`).toBe(m.id)
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/produtos/catalogo.spec.ts`
Expected: FAIL — `caminhoDoProduto is not a function`.

> O teste "todo motor do registro tem produto" passa desde já, porque só existe 2025. Ele é a rede que a Task 11 vai acionar: quando o motor de 2024 entrar no `REGISTRO` ainda sem produto, ele fica vermelho de propósito e a Task 11 o marca como `it.fails`. A Task 14 acrescenta o produto e o devolve a `it`.

- [ ] **Step 3: Implementar**

Substituir o corpo de `src/lib/produtos/catalogo.ts` por:

```ts
/**
 * O que se vende. Cada produto É um motor de decreto: o id é o mesmo do REGISTRO da calculadora,
 * e um teste de contrato exige a correspondência nos dois sentidos.
 *
 * É código, não dado, de propósito: um id mal escrito é erro de compilação, e não uma oferta
 * que silenciosamente não libera nada.
 *
 * 🔴 `slug` é a ÚNICA fonte do caminho da rota. Não acrescente um campo `href`: duas verdades
 * divergem no primeiro decreto novo. Quem precisa do caminho chama `caminhoDoProduto`.
 */
export const PRODUTOS = [
  {
    id: 'indulto-comutacao-2025',
    slug: 'cic-2025',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.970/2025',
    // Título/descrição do item no menu lateral (Rail.tsx) — mais curtos que `rotulo`, que é o
    // nome cheio usado na vitrine de `/ferramentas`.
    menuTitulo: 'GPS CIC - Calculadora 2025',
    menuDescricao: 'Decreto 12.970/2025',
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

/** O caminho da rota daquele produto. Fonte única: o `slug`. */
export function caminhoDoProduto(slug: string): string {
  return `/ferramentas/${slug}`
}

export function produtoPorSlug(slug: string): Produto | null {
  return PRODUTOS.find((p) => p.slug === slug) ?? null
}

export function slugDoMotor(motorId: string): string | null {
  return PRODUTOS.find((p) => p.id === motorId)?.slug ?? null
}
```

Em `src/components/shell/Rail.tsx`, trocar a linha `href={produto.href}` por:

```tsx
            href={caminhoDoProduto(produto.slug)}
```

e acrescentar `caminhoDoProduto` ao import existente de `@/lib/produtos/catalogo`:

```tsx
import { PRODUTOS, caminhoDoProduto } from '@/lib/produtos/catalogo'
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/produtos/catalogo.spec.ts`
Expected: PASS (7 testes).

Run: `pnpm exec tsc --noEmit`
Expected: erro em `src/app/(app)/ferramentas/page.tsx`? Não — aquela página usa `<Link href="/ferramentas/cic-2025">` literal, não `produto.href`. Se `tsc` acusar algum outro uso de `.href`, corrija-o para `caminhoDoProduto(produto.slug)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/produtos/catalogo.ts src/components/shell/Rail.tsx tests/produtos/catalogo.spec.ts
git commit -m "refactor(produtos): slug como fonte única do caminho de cada calculadora"
```

---

### Task 2: A lista filtra por decreto

Vem **antes** da mudança de rota de propósito: a página parametrizada da Task 3 chama
`listarCalculos(produto.id)`, e essa chamada só compila depois que a função ganha o parâmetro.

**Files:**
- Modify: `src/app/(app)/ferramentas/cic-2025/calculos.ts:48-68`
- Modify: `src/app/(app)/ferramentas/cic-2025/page.tsx:26`
- Test: `tests/indulto-comutacao/calculos-filtro-decreto.spec.ts` (criar)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `listarCalculos(decretoId: string): Promise<CalculoResumo[]>` — passa a exigir o argumento.

- [ ] **Step 1: Escrever o teste que falha**

`listarCalculos` fala com o Supabase, então o teste verifica a montagem da consulta com um cliente
falso. Criar `tests/indulto-comutacao/calculos-filtro-decreto.spec.ts`:

```ts
// Prova que a listagem restringe por DECRETO, além de por workspace.
//
// Sem isto, a tela de 2024 mostraria cálculos de 2025 misturados — cada cartão
// abrindo num motor diferente, sob o cabeçalho errado.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const filtros: Array<[string, unknown]> = []

const consulta = {
  select: vi.fn(() => consulta),
  eq: vi.fn((coluna: string, valor: unknown) => {
    filtros.push([coluna, valor])
    return consulta
  }),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}

vi.mock('server-only', () => ({}))
vi.mock('@/server/supabase-session', () => ({
  criarClienteServidor: async () => ({ from: () => consulta }),
}))
vi.mock('@/server/auth/workspace-ativo', () => ({
  resolverWorkspaceAtivo: async () => 'ws-1',
}))

const { listarCalculos } = await import('@/app/(app)/ferramentas/cic-2025/calculos')

describe('listarCalculos', () => {
  beforeEach(() => {
    filtros.length = 0
  })

  it('filtra por workspace ativo E por decreto', async () => {
    await listarCalculos('indulto-comutacao-2024')
    expect(filtros).toEqual([
      ['workspace_id', 'ws-1'],
      ['decreto_id', 'indulto-comutacao-2024'],
    ])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/calculos-filtro-decreto.spec.ts`
Expected: FAIL — `filtros` traz só `['workspace_id','ws-1']`.

- [ ] **Step 3: Implementar**

Em `src/app/(app)/ferramentas/cic-2025/calculos.ts`, trocar a assinatura e a consulta de
`listarCalculos`:

```ts
/**
 * Os cálculos do membro logado, no workspace ATIVO e NAQUELE DECRETO — resumo, sem
 * `entrada`/`resultado`.
 *
 * A RLS aplica `e_membro(workspace_id) and user_id = auth.uid()`, mas isso é
 * verdadeiro em TODOS os workspaces de que o usuário é membro — quem pertence a
 * dois veria, dentro de um, os cálculos feitos no outro. O `.eq('workspace_id',
 * ws)` é o que falta para restringir ao espaço de trabalho ativo; a RLS
 * continua sendo o que restringe ao próprio dono.
 *
 * 🔴 `decreto_id` NÃO é refinamento cosmético: cada rota de calculadora é de um
 * decreto só, e um cálculo de outro decreto abriria com o motor errado no cabeçalho.
 */
export async function listarCalculos(decretoId: string): Promise<CalculoResumo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data, error } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS_RESUMO)
    .eq('workspace_id', ws)
    .eq('decreto_id', decretoId)
    .order('atualizado_em', { ascending: false })
```

O resto da função fica igual.

Em `src/app/(app)/ferramentas/cic-2025/page.tsx`, a chamada passa a nomear o decreto desta rota:

```ts
  // Temporário: esta rota ainda é só de 2025. A Task 3 troca por `produto.id`,
  // resolvido pelo slug da rota parametrizada.
  const calculos = await listarCalculos('indulto-comutacao-2025')
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/calculos-filtro-decreto.spec.ts`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ferramentas/cic-2025/calculos.ts" "src/app/(app)/ferramentas/cic-2025/page.tsx" tests/indulto-comutacao/calculos-filtro-decreto.spec.ts
git commit -m "fix(ferramentas): a listagem passa a restringir os cálculos ao decreto da rota"
```

---

### Task 3: Mover a rota para `[calculadora]`

**Files:**
- Move: `src/app/(app)/ferramentas/cic-2025/**` → `src/app/(app)/ferramentas/[calculadora]/**` (21 arquivos)
- Modify: `src/app/(app)/ferramentas/[calculadora]/page.tsx`, `novo/page.tsx`, `[id]/page.tsx`, `acoes.ts`, `BarraSalvar.tsx`, `ExcluirCalculo.tsx`, `ListaCalculos.tsx`
- Modify: `tests/fronteira-rsc.spec.ts:133,140`
- Modify: `tests/indulto-comutacao/preparar.spec.ts:4-5`, `filtro-calculos.spec.ts:2-3`, `respostas-anexo.spec.ts:4`, `calculos-filtro-decreto.spec.ts` (o import dinâmico)

**Interfaces:**
- Consumes: `caminhoDoProduto`, `produtoPorSlug`, `slugDoMotor` da Task 1.
- Produces: `BarraSalvar` e `ListaCalculos` passam a receber `slug: string`; `ExcluirCalculo` passa a receber `slug: string`; `excluirCalculo(idBruto: string)` mantém a assinatura.

- [ ] **Step 1: Mover os arquivos**

```bash
cd /Users/sigapavon/Documents/Desenvolvimento/gpsdapena-tools
git mv "src/app/(app)/ferramentas/cic-2025" "src/app/(app)/ferramentas/[calculadora]"
git status --short
```

Esperado: 21 renomeações, nenhuma exclusão.

- [ ] **Step 2: Apontar os testes existentes para o novo caminho**

Em `tests/fronteira-rsc.spec.ts`, trocar as duas ocorrências:

```ts
    const calc = readFileSync(resolve(RAIZ, 'app/(app)/ferramentas/[calculadora]/Calculadora.tsx'), 'utf8')
```

```ts
      const txt = readFileSync(resolve(RAIZ, 'app/(app)/ferramentas/[calculadora]', pagina), 'utf8')
```

Em `tests/indulto-comutacao/preparar.spec.ts`:

```ts
import { preparar } from '../../src/app/(app)/ferramentas/[calculadora]/preparar'
import { entradaInicial } from '../../src/app/(app)/ferramentas/[calculadora]/Calculadora'
```

Em `tests/indulto-comutacao/filtro-calculos.spec.ts`:

```ts
import { filtrarCalculos } from '../../src/app/(app)/ferramentas/[calculadora]/filtro-calculos'
import type { CalculoResumo } from '../../src/app/(app)/ferramentas/[calculadora]/calculos'
```

Em `tests/indulto-comutacao/respostas-anexo.spec.ts`:

```ts
import { entradaInicial } from '../../src/app/(app)/ferramentas/[calculadora]/Calculadora'
```

Em `tests/indulto-comutacao/calculos-filtro-decreto.spec.ts` (criado na Task 2):

```ts
const { listarCalculos } = await import('@/app/(app)/ferramentas/[calculadora]/calculos')
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `pnpm exec vitest run tests/fronteira-rsc.spec.ts tests/indulto-comutacao/preparar.spec.ts`
Expected: PASS nos imports (os arquivos existem no novo caminho), mas `pnpm exec tsc --noEmit` ainda passa porque nada quebrou de tipo. A falha real desta task é de comportamento: a rota ainda tem caminhos fixos para `cic-2025`. O Step 4 escreve o teste que prova isso.

- [ ] **Step 4: Escrever o teste que prova a parametrização**

Acrescentar ao fim de `tests/fronteira-rsc.spec.ts`, dentro do `describe` existente:

```ts
  it('a rota de calculadora não tem caminho de decreto fixo no código', () => {
    const base = resolve(RAIZ, 'app/(app)/ferramentas/[calculadora]')
    const arquivos = [
      'page.tsx', 'novo/page.tsx', '[id]/page.tsx', 'acoes.ts',
      'BarraSalvar.tsx', 'ExcluirCalculo.tsx', 'ListaCalculos.tsx',
    ]
    const culpados: string[] = []
    for (const nome of arquivos) {
      const txt = readFileSync(resolve(base, nome), 'utf8')
      // Um literal '/ferramentas/cic-' amarra a rota parametrizada a um decreto só.
      if (/['"`]\/ferramentas\/cic-/.test(txt)) culpados.push(nome)
    }
    expect(culpados).toEqual([])
  })
```

Run: `pnpm exec vitest run tests/fronteira-rsc.spec.ts`
Expected: FAIL — lista `page.tsx`, `novo/page.tsx`, `[id]/page.tsx`, `acoes.ts`, `BarraSalvar.tsx`, `ExcluirCalculo.tsx`, `ListaCalculos.tsx`.

- [ ] **Step 5: Parametrizar `acoes.ts`**

Em `src/app/(app)/ferramentas/[calculadora]/acoes.ts`, remover a constante `BASE` e trocar os imports e as revalidações:

```ts
import { produtoDoMotor, slugDoMotor, caminhoDoProduto } from '@/lib/produtos/catalogo'
```

```ts
const TABELA = 'indulto_comutacao_calculos'

/** O caminho a revalidar para um decreto. Vazio quando o decreto não é vendido —
 *  nesse caso não há rota para invalidar, e `revalidarDecreto` não faz nada. */
function revalidarDecreto(decretoId: string, calculoId?: string) {
  const slug = slugDoMotor(decretoId)
  if (!slug) return
  const base = caminhoDoProduto(slug)
  revalidatePath(base)
  if (calculoId) revalidatePath(`${base}/${calculoId}`)
}
```

Em `salvarCalculo`, trocar `revalidatePath(BASE)` por:

```ts
    revalidarDecreto(p.motor.id)
```

Em `atualizarCalculo`, trocar as duas linhas `revalidatePath(BASE)` / `revalidatePath(\`${BASE}/${id.data}\`)` por:

```ts
    revalidarDecreto(p.motor.id, id.data)
```

Em `excluirCalculo`, trocar `.select('id')` por `.select('id, decreto_id')` e a revalidação:

```ts
    const { data, error } = await admin()
      .from(TABELA)
      .delete()
      .eq('id', id.data)
      .eq('workspace_id', ctx.ws)
      .eq('user_id', ctx.userId)
      // 🔴 `decreto_id` volta do próprio DELETE, e não de um parâmetro do cliente: é o
      // banco que diz qual rota invalidar. Um slug vindo do navegador permitiria mandar
      // revalidar a rota de outro decreto.
      .select('id, decreto_id')
    if (error) throw error
    if (!data?.length) return { erro: NAO_ACHOU }

    revalidarDecreto((data[0] as { decreto_id: string }).decreto_id)
    return { ok: true }
```

- [ ] **Step 6: Parametrizar as três páginas**

`src/app/(app)/ferramentas/[calculadora]/page.tsx` — substituir o arquivo inteiro:

```tsx
import { Scale } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { listarCalculos } from './calculos'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import ListaCalculos from './ListaCalculos'
import estilos from './calculadora.module.css'

export async function generateMetadata({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  return { title: await tituloDaPagina(produto?.menuTitulo ?? 'Calculadora') }
}

// 🔴 `listarCalculos` LANÇA em erro de banco, de propósito (ver `calculos.ts`):
// não envolva a chamada em `try` para "proteger" a tela. Uma lista vazia por
// falha de banco faria o advogado achar que perdeu os cálculos — o erro deve
// cair no limite de erro do Next, não virar `[]` aqui.
export default async function ListaPage({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()

  // O gate é do produto DESTA rota, não de qualquer produto: quem tem 2025 e não
  // tem 2024 não pode ver a tela de 2024 só porque tem alguma calculadora.
  const estado = await estadoDoProduto(produto.id)
  if (estado === 'nunca') redirect('/ferramentas')
  const ativo = estado === 'ativo'

  const base = caminhoDoProduto(produto.slug)
  const calculos = await listarCalculos(produto.id)
  const novo = ativo ? (
    <Botao href={`${base}/novo`} variante="primario">
      Novo cálculo
    </Botao>
  ) : null

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        titulo={produto.menuTitulo}
        subtitulo={`Gerencie seus cálculos para o ${produto.menuDescricao}`}
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
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhum cálculo salvo"
          texto="Crie o primeiro e ele fica guardado na sua conta."
          acao={novo}
        />
      ) : (
        <ListaCalculos calculos={calculos} slug={produto.slug} />
      )}
    </div>
  )
}
```

`src/app/(app)/ferramentas/[calculadora]/novo/page.tsx` — substituir o arquivo inteiro:

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import Calculadora from '../Calculadora'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Novo cálculo') }
}

export default async function NovoPage({ params }: { params: Promise<{ calculadora: string }> }) {
  const { calculadora } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()
  // O decreto vem do SLUG da rota, não de `motorPadrao()`: cada calculadora é a sua.
  const motor = motorPorId(produto.id)
  if (!motor) notFound()

  const base = caminhoDoProduto(produto.slug)
  if ((await estadoDoProduto(produto.id)) !== 'ativo') redirect(base)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={base} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            {produto.menuTitulo}
          </Link>
        }
        titulo="Novo cálculo"
        subtitulo={motor.rotulo}
      />
      <p className={estilos.notaPrivacidade}>
        O cálculo fica guardado na sua conta e nenhum outro membro o vê. Você pode excluí-lo
        quando quiser. Para não guardar o nome do sentenciado, use o nº de execução na
        identificação.
      </p>
      {/* `decretoId`, não `motor`: função não cruza a fronteira RSC. Ver Calculadora.tsx. */}
      <Calculadora decretoId={motor.id} slug={produto.slug} />
    </div>
  )
}
```

`src/app/(app)/ferramentas/[calculadora]/[id]/page.tsx` — substituir o arquivo inteiro:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import { tituloDaPagina } from '@/server/marca'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import { mesmoResultado } from '@/lib/indulto-comutacao/comparar'
import Calculadora from '../Calculadora'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug, caminhoDoProduto } from '@/lib/produtos/catalogo'
import ExcluirCalculo from '../ExcluirCalculo'
import { lerCalculo } from '../calculos'
import estilos from '../calculadora.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Cálculo salvo') }
}

export default async function CalculoPage({
  params,
}: {
  params: Promise<{ calculadora: string; id: string }>
}) {
  const { calculadora, id } = await params
  const produto = produtoPorSlug(calculadora)
  if (!produto) notFound()

  // `lerCalculo` usa o cliente de sessão: a RLS devolve `null` para id
  // inexistente, malformado ou de outro membro/workspace — os três viram 404
  // do mesmo jeito, sem diferenciar qual foi, para não vazar qual caso é.
  const calculo = await lerCalculo(id)
  if (!calculo) notFound()

  // 🔴 O cálculo tem de ser DESTA rota. Sem esta guarda, /ferramentas/cic-2024/<id-de-2025>
  // abriria um cálculo de 2025 sob o cabeçalho de 2024, com o gate do produto errado.
  if (calculo.decreto_id !== produto.id) notFound()

  const motor = motorPorId(calculo.decreto_id)
  if (!motor) notFound()

  const estado = await estadoDoProduto(produto.id)
  if (estado === 'nunca') notFound()

  // O cálculo é refeito a partir da entrada com o motor ATUAL. Se a fórmula
  // mudou desde que foi salvo, o membro precisa saber — o número antigo pode
  // já ter virado petição. O aviso só aparece quando a versão mudou E o
  // resultado refeito diverge do gravado: versão igual com resultado
  // diferente seria bug, e não é para esconder.
  //
  // 🔴 A comparação NÃO pode ser `JSON.stringify` bruto: `calculo.resultado`
  // vem de uma coluna `jsonb`, e o Postgres não preserva a ordem das chaves.
  // `mesmoResultado` compara por estrutura (ver `comparar.ts`).
  const agora = motor.calcular(calculo.entrada)
  const mudou = calculo.motor_versao !== motor.versao && !mesmoResultado(agora, calculo.resultado)

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina
        acima={
          <Link href={caminhoDoProduto(produto.slug)} className={estilos.voltar}>
            <ArrowLeft size={14} aria-hidden />
            {produto.menuTitulo}
          </Link>
        }
        titulo={calculo.titulo}
        subtitulo={motor.rotulo}
      />

      {mudou && (
        <div className={estilos.avisoVersao} role="alert">
          <b>Este cálculo mudou.</b> Ele foi salvo com o motor versão {calculo.motor_versao}; a
          versão atual é a {motor.versao} e produz um resultado diferente. O que aparece abaixo é
          o cálculo <b>refeito agora</b>. Salve de novo para gravar o resultado atualizado.
        </div>
      )}

      {/* `decretoId`, não `motor`: função não cruza a fronteira RSC. Ver Calculadora.tsx. */}
      <Calculadora
        decretoId={motor.id}
        slug={produto.slug}
        inicial={calculo.entrada}
        calculoId={calculo.id}
        tituloInicial={calculo.titulo}
        somenteLeitura={estado !== 'ativo'}
      />

      <ExcluirCalculo id={calculo.id} slug={produto.slug} />
    </div>
  )
}
```

- [ ] **Step 7: Passar o slug pelos componentes de cliente**

Em `Calculadora.tsx`, acrescentar a prop `slug` e repassá-la ao `BarraSalvar`. Na assinatura:

```tsx
export default function Calculadora({
  decretoId,
  slug,
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura = false,
}: {
  /** Id do decreto no registro (`motor.id`), não o motor. Ver o comentário acima. */
  decretoId: string
  /** Slug da rota, para a navegação pós-salvamento. Vem da página, nunca do motor. */
  slug: string
  inicial?: Entrada
  calculoId?: string
  tituloInicial?: string
  /** Acesso encerrado: vê o cálculo, não salva. A ação no servidor recusa de qualquer forma. */
  somenteLeitura?: boolean
}) {
```

e no `<BarraSalvar>`, acrescentar `slug={slug}`:

```tsx
          <BarraSalvar
            motor={motor}
            slug={slug}
            entrada={entrada}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
            acoesExtras={
```

Em `BarraSalvar.tsx`, acrescentar o import e a prop, e trocar o `router.push`:

```tsx
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
```

Na assinatura, depois de `motor`:

```tsx
  motor: MotorDecreto
  /** Slug da rota atual — para onde navegar depois de criar o cálculo. */
  slug: string
```

E a navegação:

```tsx
      router.push(`${caminhoDoProduto(slug)}/${r.id}`)
```

Em `ExcluirCalculo.tsx`, acrescentar o import, a prop e trocar o `router.push`:

```tsx
import { caminhoDoProduto } from '@/lib/produtos/catalogo'
```

```tsx
export default function ExcluirCalculo({ id, slug }: { id: string; slug: string }) {
```

```tsx
      router.push(caminhoDoProduto(slug))
```

Em `ListaCalculos.tsx`, acrescentar o import, a prop e trocar o `<Link>`:

```tsx
import { PRODUTOS, caminhoDoProduto } from '@/lib/produtos/catalogo'
```

```tsx
export default function ListaCalculos({
  calculos,
  slug,
}: {
  calculos: CalculoResumo[]
  slug: string
}) {
```

```tsx
              <Link href={`${caminhoDoProduto(slug)}/${c.id}`} className={estilos.item}>
```

- [ ] **Step 8: Rodar os testes**

Run: `pnpm exec vitest run tests/fronteira-rsc.spec.ts`
Expected: PASS — `culpados` vazio.

Run: `pnpm exec tsc --noEmit`
Expected: um erro em `src/app/(app)/ferramentas/page.tsx`, que ainda referencia `/ferramentas/cic-2025` como literal (não é erro de tipo) — se `tsc` passar, siga. A vitrine é a Task 4.

Run: `pnpm test`
Expected: PASS em tudo.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/ferramentas/[calculadora]" tests/fronteira-rsc.spec.ts tests/indulto-comutacao/preparar.spec.ts tests/indulto-comutacao/filtro-calculos.spec.ts tests/indulto-comutacao/respostas-anexo.spec.ts tests/indulto-comutacao/calculos-filtro-decreto.spec.ts
git commit -m "refactor(ferramentas): rota única por calculadora, resolvida pelo slug"
```

---

### Task 4: Vitrine com um cartão por calculadora

**Files:**
- Modify: `src/app/(app)/ferramentas/page.tsx`

**Interfaces:**
- Consumes: `PRODUTOS`, `caminhoDoProduto` da Task 1.
- Produces: nada.

- [ ] **Step 1: Substituir a página inteira**

`src/app/(app)/ferramentas/page.tsx`:

```tsx
import Link from 'next/link'
import { ChevronRight, Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import EstadoVazio from '@/components/ui/EstadoVazio'
import { tituloDaPagina } from '@/server/marca'
import { PRODUTOS, caminhoDoProduto } from '@/lib/produtos/catalogo'
import { estadoDoProduto } from '@/server/vendas/acesso'
import estilos from './ferramentas.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

export default async function FerramentasPage() {
  const estados = await Promise.all(
    PRODUTOS.map(async (produto) => ({ produto, estado: await estadoDoProduto(produto.id) })),
  )
  // Não existe vitrine do que o membro não tem (§9.2).
  const visiveis = estados.filter((e) => e.estado !== 'nunca')

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

      {visiveis.length === 0 ? (
        <EstadoVazio
          icone={<Scale size={20} strokeWidth={2} />}
          titulo="Nenhuma ferramenta liberada"
          texto="As ferramentas aparecem aqui assim que a compra é confirmada."
        />
      ) : (
        <div className={estilos.destinos}>
          {visiveis.map(({ produto, estado }) => (
            <Link
              key={produto.id}
              href={caminhoDoProduto(produto.slug)}
              className={estilos.destino}
            >
              <span className={estilos.destinoIcone}>
                <Scale size={16} strokeWidth={1.75} />
              </span>
              <span className={estilos.destinoTexto}>
                <span className={estilos.destinoNome}>{produto.menuTitulo}</span>
                <span className={estilos.destinoSub}>
                  Verifica, dispositivo por dispositivo, os requisitos de indulto e de comutação.
                </span>
                <span className={estilos.destinoMeta}>
                  {estado === 'ativo'
                    ? produto.menuDescricao
                    : 'Acesso encerrado — os seus cálculos continuam disponíveis para consulta'}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className={estilos.destinoSeta} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar a verificação de tipo e os testes**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Verificar no navegador**

Run: `pnpm dev`

Abrir `http://localhost:3000/ferramentas` logado como dono do servidor. Conferir: um cartão "GPS CIC - Calculadora 2025"; clicar leva a `/ferramentas/cic-2025`; a lista de cálculos aparece; "Novo cálculo" abre o questionário; salvar um cálculo navega para `/ferramentas/cic-2025/<id>`; excluir volta para a lista. Abrir `/ferramentas/cic-9999` e confirmar 404.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/page.tsx"
git commit -m "feat(ferramentas): vitrine com um cartão por calculadora"
```

---

## FATIA 2 — Motor de 2024

O congelado do oráculo é escrito **antes** do motor: ele é o teste que falha.

### Task 5: Questionário de 2024

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2024/questionario.ts`
- Test: `tests/indulto-comutacao/questionario-2024.spec.ts`

**Interfaces:**
- Consumes: `Secao` de `@/lib/indulto-comutacao/tipos`.
- Produces: `QUESTIONARIO_2024: Secao[]` com exatamente estas 50 chaves, nesta ordem de seção: `identificacao` (`sentenciado`, `execucao`, `unidade`), `penas-impostas` (`penaImpeditiva`, `penaViolencia`, `penaSemViolencia`), `pena-cumprida` (`penaCumpridaSEEU`, `penaCumpridaNaoSEEU`), `perfil` (`sexo`, `dataNascimento`, `reincidente`, `regime`, `livramentoCondicional`, `dataUltimaPrisao`), `regime-situacao` (`diasRemicao`, `tempoSemiaberto`, `tempoSemiabertoAberto`, `monitoramentoSV56`, `programaEgressos`), `educacao-trabalho` (`saidasOuTrabalhoExterno`, `estudo`, `concluiuCurso`), `pessoais-familiares` (`deficiencia`, `condicoesGravesSaude`, `gestanteOuFilho14`, `mulherFilho12`, `mulherFilho16`, `homemUnicoResponsavel`, `imprescindivelCrianca`, `avoNetos`, `justicaRestaurativa`), `historico-vedacoes` (`periodoLiberdade2Anos`, `faltaGraveAno`, `faltaGraveExecucao`, `colaboracaoPremiada`, `faccao`, `rdd`, `presidioFederal`, `crimeContraCrianca`, `respondendoOutroCrimeViolento`), `aberto-restritiva` (`penasSubstituidas`, `condenacaoAberto`), `patrimonio-multa` (`crimePatrimonio`, `reparouDano`, `valorBemSalarioMinimo`, `valorMulta`, `hipossuficiente`), `data-do-fato` (`cumpriu23ImpeditivoDataFato`, `cumpriuFracaoViolenciaDataFato`), `observacoes` (`observacoes`).

**Mapa célula → chave** (da aba `Questionario` de `validacao/2024/planilha.xlsx`). Transcrever o rótulo **exatamente como está na planilha comercial**:

| Célula | Chave | Tipo |
|---|---|---|
| `B4`, `C4`, `C5` | `sentenciado`, `execucao`, `unidade` | texto |
| `C8:E8`, `C9:E9`, `C10:E10` | `penaImpeditiva`, `penaViolencia`, `penaSemViolencia` | tempo |
| `C15:E15`, `C16:E16` | `penaCumpridaSEEU`, `penaCumpridaNaoSEEU` | tempo |
| `E31` | `sexo` | seleção `['MASCULINO','FEMININO']` |
| `E33`, `E53` | `dataNascimento`, `dataUltimaPrisao` | data |
| `E35` | `reincidente` | seleção `SN` |
| `E37` | `regime` | seleção `['FECHADO','SEMIABERTO','ABERTO']` |
| `C40:E40`, `C43:E43` | `tempoSemiaberto`, `tempoSemiabertoAberto` | tempo |
| `E45` | `livramentoCondicional` | seleção `SN` |
| `E47` | `monitoramentoSV56` | seleção `MONITORACAO` |
| `E49` | `programaEgressos` | seleção `EGRESSA` |
| `E51` | `justicaRestaurativa` | seleção `SN` |
| `E55`, `E57`, `E59` | `periodoLiberdade2Anos`, `faltaGraveAno`, `faltaGraveExecucao` | seleção `SN` |
| `E61` | `diasRemicao` | número |
| `E63`, `E65`, `E67`, `E69` | `colaboracaoPremiada`, `faccao`, `rdd`, `presidioFederal` | seleção `SN` |
| `E71`, `E73` | `deficiencia`, `condicoesGravesSaude` | seleção `SN` |
| `E75`, `E77`, `E79`, `E81`, `E83`, `E85` | `gestanteOuFilho14`, `mulherFilho12`, `mulherFilho16`, `homemUnicoResponsavel`, `imprescindivelCrianca`, `avoNetos` | seleção `SN` |
| `E87` | `saidasOuTrabalhoExterno` | seleção `SN` |
| `E89` | `estudo` | seleção `ESTUDO` |
| `E91` | `concluiuCurso` | seleção `SN` |
| `E93`, `E95` | `crimeContraCrianca`, `respondendoOutroCrimeViolento` | seleção `SN` |
| `E97`, `E99` | `penasSubstituidas`, `condenacaoAberto` | seleção `SN` |
| `E101` | `crimePatrimonio` | seleção `SN` |
| `E103`, `E105` | `reparouDano`, `valorBemSalarioMinimo` | seleção `SNA` |
| `E107`, `E109` | `cumpriu23ImpeditivoDataFato`, `cumpriuFracaoViolenciaDataFato` | seleção `SNA`, `padrao: 'SIM'` |
| `E111` | `valorMulta` | número |
| `E113` | `hipossuficiente` | seleção `SN` |
| `B118` | `observacoes` | texto |

As listas de opções saem da aba `Valid_dados`, idêntica à de 2025:
- `SN = ['SIM','NÃO']`; `SNA = ['SIM','NÃO','NÃO SE APLICA']`
- `EGRESSA = ['NÃO','HÁ MENOS DE 01 ANO','ENTRE 01 E 02 ANOS','HÁ MAIS DE 02 ANOS']`
- `MONITORACAO = ['NÃO','HÁ MENOS DE 01 ANO E 06 MESES','ENTRE 01 ANO E 06 MESES E 03 ANOS','HÁ MAIS DE 03 ANOS']`
- `ESTUDO = ['NÃO','MENOS DE 12 MESES','MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS','MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS']`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/indulto-comutacao/questionario-2024.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { QUESTIONARIO_2024 } from '@/lib/indulto-comutacao/motores/2024/questionario'
import { padraoDoCampo } from '@/lib/indulto-comutacao/padrao'

const campos = QUESTIONARIO_2024.flatMap((s) => s.campos)
const porChave = new Map(campos.map((c) => [c.chave, c]))

describe('QUESTIONARIO_2024', () => {
  it('traz as 12 seções na ordem da planilha', () => {
    expect(QUESTIONARIO_2024.map((s) => s.id)).toEqual([
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

  it('coleta exatamente 50 campos, sem chave repetida', () => {
    expect(campos).toHaveLength(50)
    expect(porChave.size).toBe(50)
  })

  it('nasce com SIM nos dois requisitos da data do fato', () => {
    // Sem isto, todo cálculo começaria vetado e o advogado não saberia por quê.
    expect(padraoDoCampo(porChave.get('cumpriu23ImpeditivoDataFato')!)).toBe('SIM')
    expect(padraoDoCampo(porChave.get('cumpriuFracaoViolenciaDataFato')!)).toBe('SIM')
  })

  it('usa a redação de 2024 no inciso XI, com o piso de doze meses', () => {
    expect(porChave.get('saidasOuTrabalhoExterno')!.rotulo).toContain('no mínimo, doze meses')
  })

  it('pergunta "Tem", e não "Todas as", nas penas substituídas e no regime aberto', () => {
    // A planilha de 2024 pergunta se EXISTE alguma; a de 2025 pergunta se são TODAS.
    // Não "melhorar" o texto de 2024 usando o de 2025 como modelo.
    expect(porChave.get('penasSubstituidas')!.rotulo).toMatch(/^Tem pena substituída/)
    expect(porChave.get('condenacaoAberto')!.rotulo).toMatch(/^Tem condenação em regime aberto/)
  })

  it('tem as seis perguntas de filhos e cuidados que o §2º e os Arts. 10 e 11 leem', () => {
    for (const chave of [
      'gestanteOuFilho14',
      'mulherFilho12',
      'mulherFilho16',
      'homemUnicoResponsavel',
      'imprescindivelCrianca',
      'avoNetos',
    ]) {
      expect(porChave.has(chave), chave).toBe(true)
    }
  })

  it('oferta NÃO SE APLICA só onde a planilha oferta', () => {
    const comNA = campos
      .filter((c) => c.tipo === 'selecao' && c.opcoes.includes('NÃO SE APLICA'))
      .map((c) => c.chave)
      .sort()
    expect(comNA).toEqual([
      'cumpriu23ImpeditivoDataFato',
      'cumpriuFracaoViolenciaDataFato',
      'reparouDano',
      'valorBemSalarioMinimo',
    ])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/questionario-2024.spec.ts`
Expected: FAIL — `Cannot find module '.../motores/2024/questionario'`.

- [ ] **Step 3: Escrever o questionário**

Criar `src/lib/indulto-comutacao/motores/2024/questionario.ts`, começando com este cabeçalho e seguindo o mapa acima. Usar `src/lib/indulto-comutacao/motores/2025/questionario.ts` como **modelo de forma**, nunca de conteúdo — os rótulos saem da planilha de 2024.

```ts
// O questionário do Decreto 12.338/2024, transcrito da aba "Questionario" de
// validacao/2024/planilha.xlsx (a versão COMERCIAL).
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO. Não o compartilhe com 2025 ou 2026, mesmo que
// a maioria dos campos se repita: as regras, os incisos e os textos são
// específicos de cada decreto, e um campo movido daqui muda a tela já validada.
//
// 🔴 AS CHAVES SÃO AS QUE O MOTOR LÊ, por nome. Renomear `penaViolencia` para
// algo mais bonito faz o motor ler `undefined` — sem erro, com número errado.
//
// 🔴 A REDAÇÃO É A DE 2024, mesmo onde a de 2025 parece melhor. Aqui se pergunta
// "TEM pena substituída"; em 2025, "TODAS as penas foram substituídas". A
// fórmula é a mesma, o sentido para quem responde não é.
//
// Toda pergunta é apurada "em 25/12/2024", a data-base do decreto.

import type { Secao } from '../../tipos'

const SN = ['SIM', 'NÃO'] as const
const SNA = ['SIM', 'NÃO', 'NÃO SE APLICA'] as const
const EGRESSA = ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'] as const
const MONITORACAO = [
  'NÃO',
  'HÁ MENOS DE 01 ANO E 06 MESES',
  'ENTRE 01 ANO E 06 MESES E 03 ANOS',
  'HÁ MAIS DE 03 ANOS',
] as const
const ESTUDO = [
  'NÃO',
  'MENOS DE 12 MESES',
  'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS',
  'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS',
] as const

export const QUESTIONARIO_2024: Secao[] = [
  {
    id: 'identificacao',
    titulo: 'Identificação',
    campos: [
      { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
      { tipo: 'texto', chave: 'execucao', rotulo: 'Execução nº' },
      { tipo: 'texto', chave: 'unidade', rotulo: 'Unidade prisional' },
    ],
  },
  {
    id: 'penas-impostas',
    titulo: 'Penas impostas (em 25/12/2024)',
    aviso:
      'Some as penas por categoria de crime. Impeditivo = hediondo/equiparado + crimes previstos no Art. 1º.',
    campos: [
      { tipo: 'tempo', chave: 'penaImpeditiva', rotulo: 'Total de penas de crimes IMPEDITIVOS' },
      {
        tipo: 'tempo',
        chave: 'penaViolencia',
        rotulo: 'Total de penas de crimes COM VIOLÊNCIA ou grave ameaça',
      },
      {
        tipo: 'tempo',
        chave: 'penaSemViolencia',
        rotulo: 'Total de penas de crimes SEM VIOLÊNCIA ou grave ameaça',
      },
    ],
  },
  // … as dez seções restantes, na ordem declarada em **Interfaces**.
]
```

**Os rótulos não estão escritos neste plano de propósito:** são 50 textos jurídicos longos, e
copiá-los para cá criaria uma segunda fonte que diverge da planilha na primeira correção. A fonte
é a coluna `B` da aba `Questionario`. Extraia cada um com o comando abaixo e cole no arquivo —
**não digite de memória e não adapte o texto de 2025**.

```bash
.venv/bin/python -c "
import openpyxl
ws = openpyxl.load_workbook('validacao/2024/planilha.xlsx')['Questionario']
for r in range(31, 118, 2):
    v = ws[f'B{r}'].value
    if v: print(f'B{r}: {v}')
" 2>/dev/null
```

Os dois campos da data do fato levam `padrao: 'SIM'` e o `ajuda` com o alerta da planilha:

```ts
      {
        tipo: 'selecao',
        chave: 'cumpriu23ImpeditivoDataFato',
        rotulo:
          'O condenado cumpriu 2/3 do crime impeditivo até o dia 25/12/2024, contando a partir da data do crime?',
        opcoes: SNA,
        padrao: 'SIM',
        ajuda:
          'Cuidado! Ao selecionar "NÃO", a Calculadora bloqueará tanto o Indulto quanto a Comutação.',
      },
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/questionario-2024.spec.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/questionario.ts tests/indulto-comutacao/questionario-2024.spec.ts
git commit -m "feat(cic-2024): questionário do Decreto 12.338/2024"
```

---

### Task 6: Oráculo de 2024 e o congelado

**Files:**
- Modify: `validacao/oraculo.py:37-40, 70-141, 143-156, 103-116`
- Create: `validacao/2024/cenarios.json`
- Create: `validacao/2024/esperado.json` (gerado)
- Modify: `validacao/README.md`

**Interfaces:**
- Consumes: as chaves de `QUESTIONARIO_2024` (Task 5).
- Produces: `validacao/2024/esperado.json` com `planilhaSha256`, `celulas` e `cenarios[]`, cada um com `_nome`, `entrada` e `planilha`. **Sem bloco `apoio`** — ele existe em 2025 só por causa do bug `G149`, que 2024 não tem.

- [ ] **Step 1: Tornar o oráculo multi-ano**

Em `validacao/oraculo.py`, trocar o bloco de argumento (linhas 37-43):

```python
ANOS = ('2024', '2025')
if len(sys.argv) != 2 or sys.argv[1] not in ANOS:
    # Cada decreto traz planilha própria, com células próprias. O mapeamento abaixo
    # é POR ANO: `build_inputs` e `OUT_MAP` de um ano NÃO servem para o outro.
    sys.exit('uso: python validacao/oraculo.py {%s}' % '|'.join(ANOS))

ANO = sys.argv[1]
PASTA = os.path.join(HERE, ANO)
```

Renomear as funções existentes `build_inputs` → `build_inputs_2025` e a constante `OUT_MAP` → `OUT_MAP_2025`, e `APOIO` → `APOIO_2025`, sem mudar o conteúdo delas.

- [ ] **Step 2: Escrever o mapa de 2024**

Acrescentar, logo depois dos de 2025:

```python
# ---------------------------------------------------------------- 2024
# Decreto 12.338/2024. O Questionario tem 118 linhas (contra 124 em 2025) e a aba
# Resultado começa na coluna C (contra D). NÃO reaproveite o mapa de 2025.

def build_inputs_2024(s):
    inp = {}

    def tempo(prefix, campo):
        t = s.get(campo) or {}
        inp[q(prefix[0])] = t.get('anos', 0)
        inp[q(prefix[1])] = t.get('meses', 0)
        inp[q(prefix[2])] = t.get('dias', 0)

    tempo(('C8', 'D8', 'E8'), 'penaImpeditiva')
    tempo(('C9', 'D9', 'E9'), 'penaViolencia')
    tempo(('C10', 'D10', 'E10'), 'penaSemViolencia')
    tempo(('C15', 'D15', 'E15'), 'penaCumpridaSEEU')
    tempo(('C16', 'D16', 'E16'), 'penaCumpridaNaoSEEU')
    # A planilha guarda estes dois como TEXTO; a formulas lida com número.
    tempo(('C40', 'D40', 'E40'), 'tempoSemiaberto')
    tempo(('C43', 'D43', 'E43'), 'tempoSemiabertoAberto')

    def serial(dstr):
        y, m, d = map(int, dstr.split('-'))
        return (datetime.date(y, m, d) - datetime.date(1899, 12, 30)).days

    inp[q('E31')] = s.get('sexo', 'MASCULINO')
    inp[q('E33')] = serial(s.get('dataNascimento', '1980-01-01'))
    inp[q('E35')] = s.get('reincidente', 'NÃO')
    inp[q('E37')] = s.get('regime', 'FECHADO')
    inp[q('E45')] = s.get('livramentoCondicional', 'NÃO')
    inp[q('E47')] = s.get('monitoramentoSV56', 'NÃO')
    inp[q('E49')] = s.get('programaEgressos', 'NÃO')
    inp[q('E51')] = s.get('justicaRestaurativa', 'NÃO')
    inp[q('E53')] = serial(s.get('dataUltimaPrisao', '2015-01-01'))
    inp[q('E55')] = s.get('periodoLiberdade2Anos', 'NÃO')
    inp[q('E57')] = s.get('faltaGraveAno', 'NÃO')
    inp[q('E59')] = s.get('faltaGraveExecucao', 'NÃO')
    inp[q('E61')] = s.get('diasRemicao', 0)
    inp[q('E63')] = s.get('colaboracaoPremiada', 'NÃO')
    inp[q('E65')] = s.get('faccao', 'NÃO')
    inp[q('E67')] = s.get('rdd', 'NÃO')
    inp[q('E69')] = s.get('presidioFederal', 'NÃO')
    inp[q('E71')] = s.get('deficiencia', 'NÃO')
    inp[q('E73')] = s.get('condicoesGravesSaude', 'NÃO')
    # 🔴 E75..E85 são as SEIS perguntas de 2024 sobre filhos e cuidados. Não há
    # correspondência de um para um com as de 2025 — ver §4 do spec.
    inp[q('E75')] = s.get('gestanteOuFilho14', 'NÃO')
    inp[q('E77')] = s.get('mulherFilho12', 'NÃO')
    inp[q('E79')] = s.get('mulherFilho16', 'NÃO')
    inp[q('E81')] = s.get('homemUnicoResponsavel', 'NÃO')
    inp[q('E83')] = s.get('imprescindivelCrianca', 'NÃO')
    inp[q('E85')] = s.get('avoNetos', 'NÃO')
    inp[q('E87')] = s.get('saidasOuTrabalhoExterno', 'NÃO')
    inp[q('E89')] = s.get('estudo', 'NÃO')
    inp[q('E91')] = s.get('concluiuCurso', 'NÃO')
    inp[q('E93')] = s.get('crimeContraCrianca', 'NÃO')
    inp[q('E95')] = s.get('respondendoOutroCrimeViolento', 'NÃO')
    inp[q('E97')] = s.get('penasSubstituidas', 'NÃO')
    inp[q('E99')] = s.get('condenacaoAberto', 'NÃO')
    inp[q('E101')] = s.get('crimePatrimonio', 'NÃO')
    inp[q('E103')] = s.get('reparouDano', 'NÃO')
    inp[q('E105')] = s.get('valorBemSalarioMinimo', 'NÃO')
    inp[q('E107')] = s.get('cumpriu23ImpeditivoDataFato', 'SIM')
    inp[q('E109')] = s.get('cumpriuFracaoViolenciaDataFato', 'SIM')
    inp[q('E111')] = s.get('valorMulta', 0)
    inp[q('E113')] = s.get('hipossuficiente', 'NÃO')
    return inp


# Aba Resultado de 2024: indulto nas linhas 7..41 (passo 2), coluna C = regra geral
# e D = regra especial; comutação nas linhas 45..53 (passo 2), C = veredito e
# D = quantum. NÃO há "pena após a comutação" em 2024 — a planilha não a calcula.
OUT_MAP_2024 = {
    'art9_I.geral': 'C7', 'art9_I.especial': 'D7',
    'art9_II.geral': 'C9', 'art9_II.especial': 'D9',
    'art9_III.geral': 'C11', 'art9_III.especial': 'D11',
    'art9_IV.geral': 'C13', 'art9_IV.especial': 'D13',
    'art9_V.geral': 'C15', 'art9_V.especial': 'D15',
    'art9_VI.geral': 'C17', 'art9_VI.especial': 'D17',
    'art9_VII.geral': 'C19', 'art9_VII.especial': 'D19',
    'art9_VIII.geral': 'C21', 'art9_VIII.especial': 'D21',
    'art9_IX.geral': 'C23', 'art9_IX.especial': 'D23',
    'art9_X.geral': 'C25', 'art9_X.especial': 'D25',
    'art9_XI.geral': 'C27', 'art9_XI.especial': 'D27',
    'art9_XII.geral': 'C29',
    'art9_XIII.geral': 'C31',
    'art9_XIV.geral': 'C33',
    'art9_XV.geral': 'C35',
    'art9_XVI.geral': 'C37',
    'art10.geral': 'C39',
    'art12.geral': 'C41',
    'art11_I.geral': 'C45', 'art11_I.comutacaoTxt': 'D45',
    'art11_II.geral': 'C47', 'art11_II.comutacaoTxt': 'D47',
    'art11_III.geral': 'C49', 'art11_III.comutacaoTxt': 'D49',
    'art13.geral': 'C51', 'art13.comutacaoTxt': 'D51',
    'art13_4.geral': 'C53', 'art13_4.comutacaoTxt': 'D53',
}

# 2024 NÃO tem o bug G149 (cada quantum é condicionado ao próprio requisito), então
# não há células de apoio a congelar.
APOIO_2024 = []

MAPAS = {
    '2024': (build_inputs_2024, OUT_MAP_2024, APOIO_2024),
    '2025': (build_inputs_2025, OUT_MAP_2025, APOIO_2025),
}
```

- [ ] **Step 3: Usar o mapa do ano no `main()`**

Em `main()`, logo depois de carregar os cenários:

```python
    build_inputs, OUT_MAP, APOIO = MAPAS[ANO]
```

e trocar o texto do `_leia` para citar o ano:

```python
        '_leia': (
            'GERADO por validacao/oraculo.py a partir de validacao/%s/planilha.xlsx. '
            'NÃO edite à mão: rode o oráculo de novo. Consertar este arquivo para um '
            'teste passar apaga a única evidência independente que o motor tem.' % ANO
        ),
```

- [ ] **Step 4: Escrever os cenários de 2024**

Criar `validacao/2024/cenarios.json` com 12 cenários. Todo campo omitido cai no padrão do
`build_inputs_2024` (tudo `NÃO`, datas fixas, `SIM` nos dois requisitos da data do fato):

```json
[
  {
    "_nome": "baseline — planilha limpa, tudo NÃO",
    "penaCumpridaSEEU": { "anos": 5, "meses": 6, "dias": 0 },
    "dataNascimento": "1983-01-01",
    "dataUltimaPrisao": "2022-12-25",
    "reincidente": "NÃO",
    "regime": "FECHADO"
  },
  {
    "_nome": "Inciso I positivo (sem violência 6a, cumprido 2a, não reinc)",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 2, "meses": 0, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Inciso III positivo (com violência 3a, cumprido 1a6m, não reinc)",
    "penaViolencia": { "anos": 3, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 1, "meses": 6, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Inciso IV positivo (16a ininterruptos, cumprido 16a, não reinc)",
    "penaSemViolencia": { "anos": 30, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 16, "meses": 0, "dias": 0 },
    "dataNascimento": "1970-01-01",
    "dataUltimaPrisao": "2008-01-01",
    "reincidente": "NÃO"
  },
  {
    "_nome": "§2º pela IDADE — 60 anos exatos em 25/12/2024 (fronteira; 2024 usa 60, não 70)",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 0, "meses": 8, "dias": 0 },
    "dataNascimento": "1964-12-25",
    "reincidente": "NÃO"
  },
  {
    "_nome": "controle do anterior — um dia mais novo que 60 anos, §2º não incide",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 0, "meses": 8, "dias": 0 },
    "dataNascimento": "1964-12-26",
    "reincidente": "NÃO"
  },
  {
    "_nome": "§2º só por justiça restaurativa (marcador I39, isolado)",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 0, "meses": 8, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "justicaRestaurativa": "SIM",
    "reincidente": "NÃO"
  },
  {
    "_nome": "§2º só por gestanteOuFilho14 (marcador I32, que 2025 desmembrou)",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 0, "meses": 8, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "sexo": "FEMININO",
    "gestanteOuFilho14": "SIM",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Inciso XII na fração 1/5 de 2024 (não reinc; em 2025 seria 1/6)",
    "penaSemViolencia": { "anos": 10, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 2, "meses": 0, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "estudo": "MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Inciso VIII — remanescente 5a com impeditivo presente, base não impeditiva (M17)",
    "penaImpeditiva": { "anos": 4, "meses": 0, "dias": 0 },
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 5, "meses": 0, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "regime": "ABERTO",
    "livramentoCondicional": "SIM",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Crime impeditivo presente e 2/3 não cumpridos pela data do fato (bloqueia tudo)",
    "penaImpeditiva": { "anos": 10, "meses": 0, "dias": 0 },
    "penaSemViolencia": { "anos": 5, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 3, "meses": 0, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "cumpriu23ImpeditivoDataFato": "NÃO",
    "reincidente": "NÃO"
  },
  {
    "_nome": "Comutação Art. 11 mulher não reincidente com filho <16 (mulherFilho16)",
    "penaSemViolencia": { "anos": 6, "meses": 0, "dias": 0 },
    "penaCumpridaSEEU": { "anos": 2, "meses": 0, "dias": 0 },
    "dataNascimento": "1990-01-01",
    "sexo": "FEMININO",
    "mulherFilho16": "SIM",
    "reincidente": "NÃO"
  }
]
```

- [ ] **Step 5: Rodar o oráculo**

```bash
cd /Users/sigapavon/Documents/Desenvolvimento/gpsdapena-tools
.venv/bin/python validacao/oraculo.py 2024
```

Expected: `gravado validacao/2024/esperado.json (12 cenários)`, depois de ~20 s.

Conferir que o congelado não veio vazio nem cheio de erro:

```bash
.venv/bin/python -c "
import json
d = json.load(open('validacao/2024/esperado.json'))
print('cenários:', len(d['cenarios']))
print('sha256:', d['planilhaSha256'][:16], '...')
vals = [v for c in d['cenarios'] for v in c['planilha'].values()]
print('valores:', len(vals))
erros = [v for v in vals if isinstance(v, str) and v.startswith('#')]
print('erros de fórmula:', erros[:5] if erros else 'nenhum')
print('exemplo art9_I.geral por cenário:', [c['planilha']['art9_I.geral'] for c in d['cenarios']])
"
```

Expected: 12 cenários, 51 valores por cenário, nenhum erro de fórmula, e `art9_I.geral` variando entre "Preenche os requisitos" e "Não preenche os requisitos" — se vier tudo igual, o `build_inputs_2024` não está chegando nas células.

- [ ] **Step 6: Confirmar que o oráculo de 2025 não regrediu**

```bash
.venv/bin/python validacao/oraculo.py 2025
git diff --stat validacao/2025/esperado.json
```

Expected: `git diff` **vazio** — o congelado de 2025 é reproduzido byte a byte. Qualquer diferença aqui significa que a refatoração do oráculo mexeu no mapa de 2025; corrija antes de seguir.

- [ ] **Step 7: Documentar no README**

Em `validacao/README.md`, na árvore de arquivos, acrescentar o bloco de 2024 e, ao fim da seção "Por que existe", acrescentar:

```markdown
### 2024 tem uma camada de prova só, e é a mais forte

Não existe `engine.js` para o Decreto 12.338/2024 — o motor foi transcrito direto da planilha, sem
POC no meio. Logo não há `paridade-*.spec.ts` de 2024: só `motor-2024.spec.ts`, contra a planilha.
Não é perda grave. Como esta seção já explica, a paridade sozinha nunca bastou: ela não pega erro
que o próprio `engine.js` tivesse. Quem pega erro de transcrição é a planilha, e essa camada 2024
tem.

A pasta guarda **duas** planilhas. `planilha.xlsx` é a comercial, a publicada, e é a fonte de
verdade — é ela que o oráculo avalia. `planilha-rascunho.xlsx` é uma cópia de trabalho anterior,
preservada só porque a coluna `C` da aba `Cálculo` dela descreve cada requisito em português, o
que a comercial apagou. **As fórmulas do rascunho divergem em três pontos** (idade do §2º, base do
inciso VIII e um ramo morto) — nunca transcreva fórmula dele. Ver
`docs/superpowers/specs/2026-09-14-calculadora-cic-2024-design.md` §0.
```

E, em "Como rodar", trocar a linha do comando por:

```bash
python validacao/oraculo.py 2025      # ~25 s; ~16 s são para montar o modelo
python validacao/oraculo.py 2024      # idem, para o Decreto 12.338/2024
```

- [ ] **Step 8: Commit**

```bash
git add validacao/oraculo.py validacao/2024/cenarios.json validacao/2024/esperado.json validacao/README.md
git commit -m "feat(cic-2024): oráculo da planilha de 2024 e congelado de 12 cenários"
```

---

### Task 7: Motor de 2024 — resumo e marcadores

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2024/motor.ts`
- Test: `tests/indulto-comutacao/motor-2024.spec.ts`

**Interfaces:**
- Consumes: `QUESTIONARIO_2024` (Task 5), `validacao/2024/esperado.json` (Task 6), `dias`/`diasCorridos` de `../../tempo`, tipos de `../../tipos`.
- Produces: `calcular2024(entrada: Entrada): Resultado` e `CHAVES_CONSUMIDAS: readonly string[]`. Nesta task `calcular2024` devolve `resumo` correto e `incisos: []`.

**Células do resumo** (aba `Cálculo`, base 30/360 — a coluna `M` é o total em dias):

| Campo de `Resumo` | Célula | Fórmula |
|---|---|---|
| — base impeditiva | `M6` | `E8 + D8*30 + C8*360` |
| — base violência | `M7` | idem `C9:E9` |
| — base sem violência | `M8` | idem `C10:E10` |
| `totalImposto` | `M9` | `M6 + M7 + M8` |
| — cumprido SEEU | `M11` | `C15:E15` |
| — cumprido não SEEU | `M12` | `C16:E16` |
| `totalCumprido` | `M13` | `M11 + M12` |
| `penaCumpridaImpeditivos` | `M15` | `IF(M13 < D6, M13, D6)` |
| `remanescente` | `M16` | `M9 - M13` |
| — remanescente não impeditivo | `M17` | `(M9 - M6) - (M13 - D6)` |
| `fracoes.doisTercosImpeditivos` | `D6` | `M6 * 2/3` |
| `fracoes.umQuinto` | `G7 + G8` | `M7*1/5 + M8*1/5` |
| `fracoes.umQuarto` | `E7 + E8` | `M7*1/4 + M8*1/4` |
| `fracoes.umTerco` | `F7 + F8` | `M7*1/3 + M8*1/3` |
| `fracoes.metade` | `H7 + H8` | `M7*1/2 + M8*1/2` |

Outras colunas de fração usadas pelos dispositivos: `I` = 1/6 (`M*1/6`). **2024 não tem coluna 1/8.**

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/indulto-comutacao/motor-2024.spec.ts`:

```ts
// A REGRESSÃO CONTRA A PLANILHA: o motor de 2024 tem de devolver, cenário a
// cenário, o que `validacao/2024/planilha.xlsx` (a versão COMERCIAL) calcula.
//
// Diferente de 2025, aqui esta é a ÚNICA camada de prova: não existe engine.js
// do Decreto 12.338/2024, então não há teste de paridade. Em compensação é a
// camada forte — a que pega erro de transcrição.
//
// A planilha não é lida aqui. `validacao/oraculo.py 2024` a avalia com a lib
// Python `formulas` e congela a saída em `validacao/2024/esperado.json`. Este
// teste só lê o congelado: roda sem Python e sem planilha.
//
// 🔴 Se este teste reprovar, NÃO edite o esperado.json. Ou o motor está errado, ou
// um cenário mudou sem o oráculo rodar de novo (há um teste abaixo só para isso),
// ou achou-se bug novo da planilha — e aí quem decide é o dono do produto.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { calcular2024 } from '@/lib/indulto-comutacao/motores/2024/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { dias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada, Tempo } from '@/lib/indulto-comutacao/tipos'
import { RAIZ } from './_oraculo'

type Celula = string | number | boolean

type CenarioCongelado = {
  _nome: string
  entrada: Entrada & { _nome: string }
  planilha: Record<string, Celula>
}

const CAMINHO_CONGELADO = RAIZ + 'validacao/2024/esperado.json'
const CAMINHO_PLANILHA = RAIZ + 'validacao/2024/planilha.xlsx'
const CAMINHO_CENARIOS = RAIZ + 'validacao/2024/cenarios.json'

const esperado = JSON.parse(readFileSync(CAMINHO_CONGELADO, 'utf8')) as {
  planilhaSha256: string
  celulas: Record<string, string>
  cenarios: CenarioCongelado[]
}

const cenariosFonte = JSON.parse(readFileSync(CAMINHO_CENARIOS, 'utf8')) as Array<
  Entrada & { _nome: string }
>

describe('o congelado é confiável', () => {
  it('é da planilha que está na árvore', () => {
    const sha = createHash('sha256').update(readFileSync(CAMINHO_PLANILHA)).digest('hex')
    expect(
      sha,
      'A planilha mudou desde o último `python validacao/oraculo.py 2024`. Rode o oráculo de novo.',
    ).toBe(esperado.planilhaSha256)
  })

  it('está em dia com cenarios.json', () => {
    expect(
      esperado.cenarios.map((c) => c._nome),
      'cenarios.json mudou sem o oráculo rodar de novo.',
    ).toEqual(cenariosFonte.map((c) => c._nome))
  })

  it('não tem célula de apoio — 2024 não tem o bug G149 de 2025', () => {
    expect(Object.keys(esperado).includes('celulasApoio')).toBe(false)
  })
})

describe('resumo × planilha', () => {
  // A planilha devolve o resumo em DIAS nas colunas M/D-H da aba Cálculo, mas a
  // aba Resultado só mostra texto. Por isso o resumo é conferido pelas próprias
  // entradas do cenário: base 30/360, as mesmas contas de Cálculo!M6..M17.
  const emDias = (t: unknown) => dias(t as Tempo | null | undefined)

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const imp = emDias(cenario.entrada.penaImpeditiva)
    const vio = emDias(cenario.entrada.penaViolencia)
    const sem = emDias(cenario.entrada.penaSemViolencia)
    const cumprido =
      emDias(cenario.entrada.penaCumpridaSEEU) + emDias(cenario.entrada.penaCumpridaNaoSEEU)
    const doisTercos = (imp * 2) / 3

    expect(r.resumo.totalImposto, 'M9').toBe(imp + vio + sem)
    expect(r.resumo.totalCumprido, 'M13').toBe(cumprido)
    expect(r.resumo.penaCumpridaImpeditivos, 'M15').toBe(
      cumprido < doisTercos ? cumprido : doisTercos,
    )
    expect(r.resumo.remanescente, 'M16').toBe(imp + vio + sem - cumprido)
    expect(r.resumo.fracoes.doisTercosImpeditivos, 'D6').toBeCloseTo(doisTercos, 6)
    expect(r.resumo.fracoes.umQuinto, 'G7+G8').toBeCloseTo((vio + sem) / 5, 6)
    expect(r.resumo.fracoes.umQuarto, 'E7+E8').toBeCloseTo((vio + sem) / 4, 6)
    expect(r.resumo.fracoes.umTerco, 'F7+F8').toBeCloseTo((vio + sem) / 3, 6)
    expect(r.resumo.fracoes.metade, 'H7+H8').toBeCloseTo((vio + sem) / 2, 6)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts`
Expected: FAIL — `Cannot find module '.../motores/2024/motor'`.

- [ ] **Step 3: Escrever o esqueleto do motor com o resumo**

Criar `src/lib/indulto-comutacao/motores/2024/motor.ts`:

```ts
/*
 * Motor de cálculo — Indulto e Comutação · Decreto nº 12.338/2024
 *
 * TRANSCRIÇÃO DIRETA da aba "Cálculo" de validacao/2024/planilha.xlsx (a versão
 * COMERCIAL). Diferente de 2025, não houve POC em JS no meio: a planilha é a
 * única fonte, e `tests/indulto-comutacao/motor-2024.spec.ts` é a única prova.
 *
 * 🔴 NÃO REFATORE. Os nomes de variável são os das CÉLULAS da planilha (`M6`,
 * `D6`, `I45`, `F43`…) e a ordem dos blocos é a ordem das linhas dela. Isto é
 * feio de propósito: a correspondência linha-a-linha é a única prova de corretude
 * que este cálculo tem.
 *
 * 🔴 NÃO COPIE DE motores/2025/motor.ts. As duas planilhas usam os MESMOS
 * endereços para coisas DIFERENTES: aqui `I45` é falta grave no ano e `I51` é o
 * valor do bem; em 2025 `I45` é justiça restaurativa e `I51` é a falta grave. A
 * coluna `I` da linha 5 é 1/6 aqui e 1/8 lá. Copiar produz número errado sem
 * erro de compilação e sem teste vermelho.
 *
 * Convenção de tempo de PENA: 30 dias/mês, 360 dias/ano.
 * Exceção: o inciso IV usa dias-calendário reais (`F43 = E43 - D43`).
 *
 * Ambiguidades da planilha, PRESERVADAS — nenhuma "consertada". Todas saem em
 * AVISOS_2024.validarJuridicamente, que é o que a tela mostra:
 *   1. Inciso VIII: o §2º DOBRA o teto da pena remanescente em vez de reduzi-lo
 *      à metade, e a base é a remanescente NÃO impeditiva (M17) — em 2025 é a
 *      total (N16);
 *   2. Art. 13 (`c13`): exige cumprimento MAIOR que a fração (`<` estrito,
 *      Cálculo!H132), onde todo outro dispositivo aceita o exato (`<=`);
 *   3. base da comutação do Art. 13 e §4º: o max entre cumprida e remanescente;
 *   4. Art. 11: "NÃO SE APLICA" na reincidência satisfaz tanto o requisito de
 *      reincidente obrigatório quanto o de não reincidente.
 */

import type { Entrada, Resultado, ResultadoInciso, Veredito } from '../../tipos'
import type { Tempo } from '../../tempo'
import { dias, diasCorridos } from '../../tempo'

/**
 * Toda chave de `Entrada` que este motor consome.
 *
 * Existe para o teste de reconciliação: uma chave que o questionário coleta e o
 * motor ignora é pergunta inútil na tela; uma que o motor lê e o questionário não
 * coleta é cálculo que silenciosamente usa `undefined`.
 */
export const CHAVES_CONSUMIDAS = [
  'avoNetos',
  'colaboracaoPremiada',
  'concluiuCurso',
  'condenacaoAberto',
  'condicoesGravesSaude',
  'crimeContraCrianca',
  'crimePatrimonio',
  'cumpriu23ImpeditivoDataFato',
  'cumpriuFracaoViolenciaDataFato',
  'dataNascimento',
  'dataUltimaPrisao',
  'deficiencia',
  'diasRemicao',
  'estudo',
  'faccao',
  'faltaGraveAno',
  'faltaGraveExecucao',
  'gestanteOuFilho14',
  'hipossuficiente',
  'homemUnicoResponsavel',
  'imprescindivelCrianca',
  'justicaRestaurativa',
  'livramentoCondicional',
  'monitoramentoSV56',
  'mulherFilho12',
  'mulherFilho16',
  'penaCumpridaNaoSEEU',
  'penaCumpridaSEEU',
  'penaImpeditiva',
  'penaSemViolencia',
  'penaViolencia',
  'penasSubstituidas',
  'periodoLiberdade2Anos',
  'presidioFederal',
  'programaEgressos',
  'rdd',
  'regime',
  'reincidente',
  'reparouDano',
  'respondendoOutroCrimeViolento',
  'saidasOuTrabalhoExterno',
  'sexo',
  'tempoSemiaberto',
  'tempoSemiabertoAberto',
  'valorBemSalarioMinimo',
  'valorMulta',
] as const

/** `1` para SIM, `2` para NÃO, `3` para NÃO SE APLICA — a codificação da coluna I da planilha. */
function sn(v: unknown): 1 | 2 | 3 {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'SIM') return 1
  if (s === 'NÃO SE APLICA') return 3
  return 2
}

export function calcular2024(entrada: Entrada): Resultado {
  const t = (chave: string) => dias(entrada[chave] as Tempo | null | undefined)

  // ---- Cálculo!M6:M9 — penas impostas, em dias (base 30/360)
  const M6 = t('penaImpeditiva')
  const M7 = t('penaViolencia')
  const M8 = t('penaSemViolencia')
  const M9 = M6 + M7 + M8

  // ---- Cálculo!M11:M13 — pena cumprida
  const M11 = t('penaCumpridaSEEU')
  const M12 = t('penaCumpridaNaoSEEU')
  const M13 = M11 + M12

  // ---- Cálculo!D5:I5 — as frações de cada base
  const D6 = (M6 * 2) / 3
  const E7 = M7 / 4, E8 = M8 / 4
  const F7 = M7 / 3, F8 = M8 / 3
  const G7 = M7 / 5, G8 = M8 / 5
  const H7 = M7 / 2, H8 = M8 / 2
  const I7 = M7 / 6, I8 = M8 / 6

  // ---- Cálculo!M15:M17
  const M15 = M13 < D6 ? M13 : D6
  const M16 = M9 - M13
  const M17 = M9 - M6 - (M13 - D6)

  const incisos: ResultadoInciso[] = []

  return {
    incisos,
    resumo: {
      totalImposto: M9,
      totalCumprido: M13,
      penaCumpridaImpeditivos: M15,
      remanescente: M16,
      fracoes: {
        doisTercosImpeditivos: D6,
        umQuinto: G7 + G8,
        umQuarto: E7 + E8,
        umTerco: F7 + F8,
        metade: H7 + H8,
      },
    },
    avisos: [],
  }
}
```

> As constantes `I7`, `I8`, `M17` e o helper `sn` ficam declarados aqui e passam a ser usados nas Tasks 8 e 9. Se o `eslint` reclamar de variável não usada nesta task, deixe-as e siga — a Task 8 as consome.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts`
Expected: PASS — 3 testes do congelado + 12 do resumo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/motor.ts tests/indulto-comutacao/motor-2024.spec.ts
git commit -m "feat(cic-2024): resumo do motor, conferido contra a planilha"
```

---

### Task 8: Motor de 2024 — os 18 dispositivos de indulto

**Files:**
- Modify: `src/lib/indulto-comutacao/motores/2024/motor.ts`
- Modify: `tests/indulto-comutacao/motor-2024.spec.ts`

**Interfaces:**
- Consumes: o que a Task 7 produziu.
- Produces: `calcular2024().incisos` com 18 entradas de indulto, nesta ordem: `art9_I`, `art9_II`, `art9_III`, `art9_IV`, `art9_V`, `art9_VI`, `art9_VII`, `art9_VIII`, `art9_IX`, `art9_X`, `art9_XI`, `art9_XII`, `art9_XIII`, `art9_XIV`, `art9_XV`, `art9_XVI`, `art10`, `art12`. Cada uma com `geral: Veredito` e `especial: Veredito`.

**Onde está cada bloco** na aba `Cálculo` — linha do dispositivo, e a linha seguinte é a conversão `OK→1 / não→2`:

| Dispositivo | Linha | Regra geral | Regra especial (§2º) |
|---|---|---|---|
| `art9_I` | 69 | `SUM(E70:K70) = 7` (`O69`) | `E,F,G,H,J,K,P,Q,R = 9` (`T69`) |
| `art9_II` | 72 | `SUM(E73:K73) = 7` | `T72`, 9 termos |
| `art9_III` | 75 | `SUM(E76:K76) = 7` | `T75`, 9 termos |
| `art9_IV` | 78 | `SUM(E79:J79) = 6` | `E,F,G,I,P,Q,R,S = 8` (`T78`) |
| `art9_V` | 81 | `O81` | `T81` |
| `art9_VI` | 84 | `O84` | `T84` |
| `art9_VII` | 87 | `O87` | `T87` |
| `art9_VIII` | 90 | `O90` | `T90` |
| `art9_IX` | 93 | `O93` | `T93` |
| `art9_X` | 96 | `O96` | `T96` |
| `art9_XI` | 99 | `SUM(E100:M100) = 9` | `E,F,G,H,I,K,L,P,Q,R,S = 11` (`T99`) |
| `art9_XII` | 102 | `O102` | sem previsão |
| `art9_XIII` | 105 | `O105` | sem previsão |
| `art9_XIV` | 108 | `O108` | sem previsão |
| `art9_XV` | 111 | `O111` | sem previsão |
| `art9_XVI` | 114 | `O114` | sem previsão |
| `art10` | 117 | `SUM(E118:M118) = 9` | sem previsão |
| `art12` | 120 | `IF(D53=0,"A analisar", SUM(E121:G121)=3)` | sem previsão |

**A trava comum (coluna `E` de todo dispositivo):**

```
IF(I22=1,"NÃO", IF(I23=1,"NÃO", IF(I24=1,"NÃO", IF(I45=1,"NÃO", IF(I21=1,"NÃO","OK")))))
```

onde `I21` = colaboração premiada, `I22` = facção, `I23` = RDD, `I24` = presídio federal,
`I45` = falta grave no ano. **No Art. 13 e no §4º a trava é a mesma, sem o `I21`.**

**A regra especial (coluna `P` de todo dispositivo que a tem, e `I135` no §4º):**

```
IF(OR(D47<=DATE(1964,12,25), I32=1, I35=1, I36=1, I38=1, I39=1),"OK","NÃO")
```

— `D47` é a data de nascimento; `DATE(2024-60,12,25)` = 25/12/1964.

**A coluna `Q`** (só onde há `P`): `IF(I40=2,"OK","NÃO")` — crime **não** praticado contra filho/criança.

Para obter a fórmula exata de cada célula, sem transcrever de memória:

```bash
.venv/bin/python -c "
import openpyxl, sys
ws = openpyxl.load_workbook('validacao/2024/planilha.xlsx')['Cálculo']
for r in [69,72,75,78,81,84,87,90,93,96,99,102,105,108,111,114,117,120]:
    print(f'--- linha {r}: {str(ws[f\"C{r}\"].value)[:70]}')
    for col in 'EFGHIJKLMOPQRST':
        v = ws[f'{col}{r}'].value
        if v is not None: print(f'  {col}{r} = {v}')
" 2>/dev/null
```

E a descrição em português de cada requisito, do rascunho (linha imediatamente **anterior** ao bloco):

```bash
.venv/bin/python -c "
import openpyxl
ws = openpyxl.load_workbook('validacao/2024/planilha-rascunho.xlsx')['Cálculo']
for r in [68,71,74,77,80,83,86,89,92,95,98,101,104,107,110,113,116,119]:
    print(f'--- linha {r} (descreve o bloco {r+1})')
    for col in 'EFGHIJKLMPQRS':
        v = ws[f'{col}{r}'].value
        if v: print(f'  {col}: {v}')
" 2>/dev/null
```

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `tests/indulto-comutacao/motor-2024.spec.ts`:

```ts
const PREENCHE = VEREDITOS.preenche
const NAO_PREENCHE = VEREDITOS.nao_preenche
const SEM_PREVISAO = VEREDITOS.sem_previsao
const A_ANALISAR = VEREDITOS.a_analisar

/** Os sufixos que este teste sabe comparar. Um sufixo fora desta lista seria
 *  ignorado EM SILÊNCIO pelo laço — por isso há um teste que reprova se aparecer. */
const SUFIXOS_COMPARADOS = new Set(['geral', 'especial', 'comutacaoTxt'])

describe('o congelado não traz sufixo que este teste ignoraria', () => {
  it('só usa geral, especial e comutacaoTxt', () => {
    const sufixos = new Set(
      Object.keys(esperado.cenarios[0].planilha).map((k) => k.split('.')[1]),
    )
    expect([...sufixos].filter((s) => !SUFIXOS_COMPARADOS.has(s))).toEqual([])
  })
})

describe('vereditos de indulto × planilha', () => {
  const INDULTO = [
    'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
    'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
    'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
  ] as const

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const porId = new Map(r.incisos.map((i) => [i.id, i]))

    for (const id of INDULTO) {
      const obtido = porId.get(id)
      expect(obtido, `o motor não devolveu ${id}`).toBeDefined()

      const geralPlanilha = String(cenario.planilha[`${id}.geral`])
      expect(VEREDITOS[obtido!.geral], `${id}.geral`).toBe(geralPlanilha)

      const especialPlanilha = cenario.planilha[`${id}.especial`]
      if (especialPlanilha === undefined) {
        // A aba Resultado escreve "Sem previsão no Decreto" direto na célula para
        // os dispositivos sem §2º; o OUT_MAP nem mapeia a coluna nesses casos.
        expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(SEM_PREVISAO)
      } else {
        expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(String(especialPlanilha))
      }
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts -t 'vereditos de indulto'`
Expected: FAIL — "o motor não devolveu art9_I" em todos os 12 cenários.

- [ ] **Step 3: Transcrever os marcadores e os 18 dispositivos**

Em `motor.ts`, depois do bloco do resumo e antes do `return`, acrescentar os marcadores da aba
`Cálculo` (linhas 18-66) e em seguida os 18 blocos, na ordem das linhas. Os marcadores:

```ts
  // ---- Cálculo!I18:I66 — os marcadores, codificados 1=SIM 2=NÃO 3=NÃO SE APLICA
  const I18 = sn(entrada.cumpriu23ImpeditivoDataFato) // E107
  const I20 = sn(entrada.reincidente)                 // E35 — 1 reincidente, 2 não
  const I21 = sn(entrada.colaboracaoPremiada)         // E63
  const I22 = sn(entrada.faccao)                      // E65
  const I23 = sn(entrada.rdd)                         // E67
  const I24 = sn(entrada.presidioFederal)             // E69
  const I25 = Number(entrada.diasRemicao ?? 0)        // E61
  const I26 = sn(entrada.condicoesGravesSaude)        // E73
  const I28 = dias(entrada.tempoSemiaberto as Tempo | null | undefined)        // C40:E40
  const I30 = dias(entrada.tempoSemiabertoAberto as Tempo | null | undefined)  // C43:E43
  const I31 = String(entrada.sexo ?? '').toUpperCase() === 'FEMININO' ? 1 : 2  // E31
  const I32 = sn(entrada.gestanteOuFilho14)           // E75
  const I33 = sn(entrada.mulherFilho12)               // E77
  const I34 = sn(entrada.mulherFilho16)               // E79
  const I35 = sn(entrada.homemUnicoResponsavel)       // E81
  const I36 = sn(entrada.imprescindivelCrianca)       // E83
  const I37 = sn(entrada.avoNetos)                    // E85
  const I38 = sn(entrada.deficiencia)                 // E71
  const I39 = sn(entrada.justicaRestaurativa)         // E51
  const I40 = sn(entrada.crimeContraCrianca)          // E93
  const I41 = sn(entrada.periodoLiberdade2Anos)       // E55
  const I45 = sn(entrada.faltaGraveAno)               // E57
  const I46 = sn(entrada.faltaGraveExecucao)          // E59
  const I49 = sn(entrada.crimePatrimonio)             // E101
  const I50 = sn(entrada.reparouDano)                 // E103
  const I51 = sn(entrada.valorBemSalarioMinimo)       // E105
  const I54 = sn(entrada.hipossuficiente)             // E113
  const I56 = sn(entrada.saidasOuTrabalhoExterno)     // E87
  const I57 = regimeCod(entrada.regime)               // E37 — 1 fechado, 2 semiaberto, 3 aberto
  const I58 = sn(entrada.livramentoCondicional)       // E45
  const I59 = sn(entrada.penasSubstituidas)           // E97
  const I60 = sn(entrada.condenacaoAberto)            // E99
  const I61 = sn(entrada.respondendoOutroCrimeViolento) // E95
  const I62 = faixaEgressa(entrada.programaEgressos)  // E49 — 1..4
  const I63 = faixaMonitoracao(entrada.monitoramentoSV56) // E47 — 1..4
  const I64 = faixaEstudo(entrada.estudo)             // E89 — 1..4
  const I65 = sn(entrada.concluiuCurso)               // E91
  const I66 = sn(entrada.cumpriuFracaoViolenciaDataFato) // E109

  // ---- Cálculo!D53 — valor da pena de multa (E111)
  const D53 = Number(entrada.valorMulta ?? 0)

  // ---- Cálculo!D43/D47/F43 — datas. F43 é em dias-calendário REAIS, não 30/360.
  const D47 = String(entrada.dataNascimento ?? '')
  const F43 = diasCorridos(String(entrada.dataUltimaPrisao ?? ''), '2024-12-25')
  /** 25/12/1964 — `DATE(2024-60,12,25)`, o corte de idade do §2º. */
  const nascidoAteCorteP = D47 !== '' && D47 <= '1964-12-25'

  // ---- A trava comum (coluna E de todo dispositivo)
  const travaOk = !(I22 === 1 || I23 === 1 || I24 === 1 || I45 === 1 || I21 === 1)
  // ---- A trava do Art. 13 e do §4º: a mesma, SEM o I21 (colaboração premiada)
  const travaComut = !(I22 === 1 || I23 === 1 || I24 === 1 || I45 === 1)
  // ---- O requisito da data do fato do crime impeditivo (coluna G/F/H, varia)
  const dataFatoImpeditivoOk = I18 === 1 || I18 === 3
  // ---- O requisito da fração do crime com violência (coluna K)
  //      🔴 SÓ "SIM" passa. A comercial removeu o ramo do I66=3, que era morto:
  //      I66 nunca vale 3, porque a fórmula da planilha não tem esse ramo.
  const dataFatoViolenciaOk = I66 === 1
  // ---- Os 2/3 do crime impeditivo (coluna H/G/I, varia)
  const doisTercosOk = M6 === 0 || M13 >= (M6 * 2) / 3
  // ---- A regra especial do §2º (coluna P) — 60 anos, 5 marcadores
  const perfilP =
    nascidoAteCorteP || I32 === 1 || I35 === 1 || I36 === 1 || I38 === 1 || I39 === 1
  // ---- Coluna Q: o crime não foi contra filho, filha, criança ou adolescente
  const naoContraCrianca = I40 === 2

  const V = (ok: boolean): Veredito => (ok ? 'preenche' : 'nao_preenche')
```

e os helpers de faixa, junto do `sn`:

```ts
function regimeCod(v: unknown): 1 | 2 | 3 {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'SEMIABERTO') return 2
  if (s === 'ABERTO') return 3
  return 1
}

/** As faixas das colunas P, R e X de Valid_dados: a posição na lista, começando em 1. */
function faixa(opcoes: readonly string[], v: unknown): 1 | 2 | 3 | 4 {
  const s = String(v ?? '').trim().toUpperCase()
  const i = opcoes.findIndex((o) => o === s)
  return (i < 0 ? 1 : i + 1) as 1 | 2 | 3 | 4
}

const EGRESSA = ['NÃO', 'HÁ MENOS DE 01 ANO', 'ENTRE 01 E 02 ANOS', 'HÁ MAIS DE 02 ANOS'] as const
const MONITORACAO = [
  'NÃO',
  'HÁ MENOS DE 01 ANO E 06 MESES',
  'ENTRE 01 ANO E 06 MESES E 03 ANOS',
  'HÁ MAIS DE 03 ANOS',
] as const
const ESTUDO_FAIXAS = [
  'NÃO',
  'MENOS DE 12 MESES',
  'MAIS DE 12 MESES NOS ÚLTIMOS 3 ANOS',
  'MAIS DE 18 MESES NOS ÚLTIMOS 5 ANOS',
] as const

const faixaEgressa = (v: unknown) => faixa(EGRESSA, v)
const faixaMonitoracao = (v: unknown) => faixa(MONITORACAO, v)
const faixaEstudo = (v: unknown) => faixa(ESTUDO_FAIXAS, v)
```

Depois, os 18 blocos. O primeiro, como padrão a seguir para os outros dezessete — cada condição
nomeada pela célula de origem:

```ts
  // ===== Cálculo!69 — Art. 9º, I: pena ≤ 8 anos, sem violência, 1/5 (não reinc.) ou 1/3 (reinc.)
  {
    const E = travaOk
    const F = M9 <= 8 * 360
    const G = dataFatoImpeditivoOk
    const H = doisTercosOk
    const I = I20 === 2 ? D6 + G8 + G7 <= M13 : D6 + F8 + F7 <= M13
    const J = M8 !== 0
    const K = dataFatoViolenciaOk
    // O69: SUM(E70:K70) = 7 — as SETE colunas E..K, todas OK.
    const geral = E && F && G && H && I && J && K
    // T69: E,F,G,H,J,K + P,Q,R = 9. 🔴 O `I` (a fração cheia) NÃO entra; quem
    // entra no lugar é o R, a mesma fração pela metade.
    const R = I20 === 2 ? D6 + G8 / 2 + G7 / 2 <= M13 : D6 + F8 / 2 + F7 / 2 <= M13
    const especial = E && F && G && H && J && K && perfilP && naoContraCrianca && R
    incisos.push({ id: 'art9_I', geral: V(geral), especial: V(especial) })
  }
```

**As fórmulas dos outros dezessete não estão escritas neste plano de propósito**, pelo mesmo
motivo dos rótulos: transcrevê-las para cá criaria uma cópia que diverge da planilha. A fonte é a
aba `Cálculo`, e o comando do Step 3 acima imprime cada célula literalmente. Siga o padrão do
`art9_I`: uma constante por coluna, nomeada pela letra da coluna, e o veredito como a conjunção
que a fórmula `O`/`T` daquela linha exige — a tabela de blocos acima diz quantos termos são e
quais entram em cada um.

Os que **não têm §2º** (`art9_XII` a `art12`) recebem `especial: 'sem_previsao'`. O `art12` é o
único com três estados:

```ts
  // ===== Cálculo!120 — Art. 12: indulto da pena de multa
  {
    const E = travaOk
    const F = D53 > 20000 ? I54 === 1 : true
    const G = !(M8 === 0 && M7 === 0)
    // O120: multa zerada não é "não preenche" — é "A analisar".
    const geral: Veredito = D53 === 0 ? 'a_analisar' : E && F && G ? 'preenche' : 'nao_preenche'
    incisos.push({ id: 'art12', geral, especial: 'sem_previsao' })
  }
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts`
Expected: PASS.

Se algum cenário divergir, **não ajuste o esperado.json**. Compare a célula que o teste nomeou
(`art9_VIII.especial`, por exemplo) com a fórmula real:

```bash
.venv/bin/python -c "
import openpyxl
ws = openpyxl.load_workbook('validacao/2024/planilha.xlsx')['Cálculo']
print(ws['R90'].value)
" 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/motor.ts tests/indulto-comutacao/motor-2024.spec.ts
git commit -m "feat(cic-2024): os 18 dispositivos de indulto, conferidos contra a planilha"
```

---

### Task 9: Motor de 2024 — os 5 dispositivos de comutação

**Files:**
- Modify: `src/lib/indulto-comutacao/motores/2024/motor.ts`
- Modify: `tests/indulto-comutacao/motor-2024.spec.ts`

**Interfaces:**
- Consumes: o que as Tasks 7 e 8 produziram.
- Produces: `calcular2024().incisos` com mais 5 entradas, nesta ordem, **depois** das 18 de indulto: `art11_I`, `art11_II`, `art11_III`, `art13`, `art13_4`. Cada uma com `geral`, `especial: 'sem_previsao'`, `quantum: number | null` e **`penaApos: null`**.

**Blocos de requisito** (aba `Cálculo`): `art11_I` linha 123, `art11_II` 126, `art11_III` 129,
`art13` 132, `art13_4` 135. **Quantum**: `G139`…`G143`, condicionados a `F139`…`F143`.

| Dispositivo | Requisito | Quantum |
|---|---|---|
| `art11_I` | `O123` | `G139 = M8 * 1/4` |
| `art11_II` | `O126` | `G140 = M8 * 2/3` |
| `art11_III` | `O129` | `G141 = M8 * 1/2` |
| `art13` | `O132` | `G142` — 1/5 da base |
| `art13_4` | `O135` | `G143` — 2/3 da base |

A **base** do `art13`/`art13_4` (`G142`/`G143`), literal da planilha:

```
IF(M6=0, IF(M13>M16, M13, M16), IF(M14>M17, M14, M17))
```

— sem crime impeditivo usa `max(M13, M16)`; com crime impeditivo usa `max(M14, M17)`, onde
`M14 = IF(M13-D6 >= M7+M8, M7+M8, M13-D6)` é a pena cumprida descontando os 2/3 do impeditivo.

**Sem requisito, o quantum é `null`** — a planilha põe o texto `"SEM COMUTAÇÃO"` em `G` e a aba
`Resultado` mostra `"Sem Comutação"` via `IFERROR`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/indulto-comutacao/motor-2024.spec.ts`:

```ts
/**
 * ⚖️ TOLERÂNCIA DE 1 DIA nas durações — deliberada, a mesma de motor-2025.spec.ts.
 *
 * A planilha não devolve número no quantum: devolve TEXTO ("X anos Y meses Z
 * dias"), montado com ROUNDDOWN nos anos e meses e ROUND nos dias
 * (Cálculo!H139:H143). Esse arredondamento desloca até 1 dia. O motor devolve o
 * número cru, então a comparação é EM DIAS e aceita |Δ| ≤ 1.
 *
 * Não aumente este valor para um teste passar: 2 dias já não é arredondamento,
 * é regra diferente.
 */
const TOLERANCIA_DIAS = 1

/** O texto que a aba Resultado mostra (via IFERROR da coluna H) quando não há comutação. */
const SEM_COMUTACAO = 'Sem Comutação'

/** "X anos Y meses Z dias" → dias (base 30/360). `null` se o texto não for duração. */
function durDias(txt: Celula): number | null {
  const m = String(txt).trim().match(/^-?\s*(\d+)\s+anos?\s+(\d+)\s+meses?\s+(\d+)\s+dias?$/)
  if (!m) return null
  return Number(m[1]) * 360 + Number(m[2]) * 30 + Number(m[3])
}

describe('comutação × planilha', () => {
  const COMUTACOES = ['art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4'] as const

  it.each(esperado.cenarios.map((c) => [c._nome, c] as const))('%s', (_nome, cenario) => {
    const r = calcular2024(cenario.entrada)
    const porId = new Map(r.incisos.map((i) => [i.id, i]))

    for (const id of COMUTACOES) {
      const obtido = porId.get(id)
      expect(obtido, `o motor não devolveu ${id}`).toBeDefined()
      expect(VEREDITOS[obtido!.geral], `${id}.geral`).toBe(String(cenario.planilha[`${id}.geral`]))
      expect(VEREDITOS[obtido!.especial], `${id}.especial`).toBe(SEM_PREVISAO)

      // 🔴 2024 não tem "pena após a comutação": a planilha não a calcula.
      expect(obtido!.penaApos, `${id}.penaApos`).toBeNull()

      const txt = cenario.planilha[`${id}.comutacaoTxt`]
      if (String(txt).trim() === SEM_COMUTACAO) {
        expect(obtido!.quantum, `${id}.quantum sem comutação`).toBeNull()
        continue
      }
      const esperadoDias = durDias(txt)
      expect(esperadoDias, `${id}.comutacaoTxt não é duração: ${txt}`).not.toBeNull()
      expect(obtido!.quantum, `${id}.quantum`).not.toBeNull()
      expect(Math.abs(obtido!.quantum! - esperadoDias!), `${id}.quantum em dias`).toBeLessThanOrEqual(
        TOLERANCIA_DIAS,
      )
    }
  })

  it('devolve os 23 dispositivos, indulto antes de comutação', () => {
    const ids = calcular2024({}).incisos.map((i) => i.id)
    expect(ids).toHaveLength(23)
    expect(ids.slice(18)).toEqual([...COMUTACOES])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts -t 'comutação'`
Expected: FAIL — "o motor não devolveu art11_I".

- [ ] **Step 3: Transcrever os cinco blocos**

Em `motor.ts`, depois do `art12`, acrescentar. O `art13` mostra a ambiguidade do `<` estrito:

```ts
  // ---- Cálculo!M14 — pena cumprida descontando os 2/3 do impeditivo
  const M14 = M13 - D6 >= M7 + M8 ? M7 + M8 : M13 - D6

  /** Cálculo!G142/G143 — a base da comutação do Art. 13 e do §4º.
   *  ⚖️ AMBIGUIDADE PRESERVADA: é o MAIOR entre pena cumprida e remanescente,
   *  quando a comutação legalmente incide sobre a remanescente. Fiel à planilha. */
  const baseComut = M6 === 0 ? Math.max(M13, M16) : Math.max(M14, M17)

  // ===== Cálculo!132 — Art. 13: comutação de 1/5 da remanescente
  {
    const E = travaComut
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    // ⚖️ AMBIGUIDADE PRESERVADA: `<` ESTRITO. Todo outro dispositivo, inclusive o
    // §4º logo abaixo, usa `<=`. Quem cumpriu EXATAMENTE a fração tem a comutação
    // do Art. 13 negada. Provável erro da planilha, mantido por fidelidade.
    const H = I20 === 2 ? D6 + G7 + G8 < M13 : D6 + E7 + E8 < M13
    const I = !(M8 === 0 && M7 === 0)
    const preenche = E && F && G && H && I
    incisos.push({
      id: 'art13',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? baseComut / 5 : null,
      // 🔴 `null` sempre: a planilha de 2024 não calcula a pena após a comutação.
      penaApos: null,
    })
  }

  // ===== Cálculo!135 — Art. 13, §4º: 2/3 para o perfil do Art. 9º, §2º
  {
    const E = travaComut
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = I20 === 2 ? D6 + G7 + G8 <= M13 : D6 + E7 + E8 <= M13
    const I = perfilP
    const J = !(M8 === 0 && M7 === 0)
    const preenche = E && F && G && H && I && J
    incisos.push({
      id: 'art13_4',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? (baseComut * 2) / 3 : null,
      penaApos: null,
    })
  }
```

Os três do Art. 11 seguem o mesmo padrão, com o quantum sobre `M8` (só crimes sem violência) e a
ambiguidade da reincidência anotada:

```ts
  // ===== Cálculo!123 — Art. 11, I: mulher reincidente, pena ≤ 8 anos, sem violência → 1/4
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    const I = M9 <= 8 * 360
    // ⚖️ AMBIGUIDADE PRESERVADA: a fórmula testa `I20 <> 2`, não `I20 = 1`. Logo
    // "NÃO SE APLICA" (3) satisfaz TANTO este requisito de reincidente obrigatório
    // quanto o de não reincidente do inciso II.
    const J = I20 !== 2
    const K = I31 !== 2 // mulher
    const L = D6 + F8 + F7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_I',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? M8 / 4 : null,
      penaApos: null,
    })
  }
```

```ts
  // ===== Cálculo!126 — Art. 11, II: mulher NÃO reincidente, com filho, sem violência → 2/3
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    // 🔴 I126 é `IF(I34=2,"NÃO","OK")`: o marcador ÚNICO de 2024 para "mulher com filho
    // menor de 16 anos, ou com deficiência/doença crônica grave que necessite de cuidados".
    // Em 2025 este requisito virou um OR de três combinações — não copie de lá.
    const I = I34 !== 2
    // ⚖️ Mesma ambiguidade do inciso I: testa a diferença, não a igualdade.
    const J = I20 !== 1
    const K = I31 !== 2 // mulher
    const L = D6 + G8 + G7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_II',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? (M8 * 2) / 3 : null,
      penaApos: null,
    })
  }

  // ===== Cálculo!129 — Art. 11, III: mulher REINCIDENTE, com filho, sem violência → 1/2
  {
    const E = travaOk
    const F = dataFatoImpeditivoOk
    const G = doisTercosOk
    const H = M8 !== 0
    const I = I34 !== 2
    const J = I20 !== 2
    const K = I31 !== 2 // mulher
    const L = D6 + G8 + G7 <= M13
    const preenche = E && F && G && H && I && J && K && L
    incisos.push({
      id: 'art11_III',
      geral: V(preenche),
      especial: 'sem_previsao',
      quantum: preenche ? M8 / 2 : null,
      penaApos: null,
    })
  }
```

**A ordem dos `push` importa**: `art11_I`, `art11_II`, `art11_III`, `art13`, `art13_4`, todos
depois dos 18 de indulto. O teste "devolve os 23 dispositivos, indulto antes de comutação" a
trava.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/motor-2024.spec.ts`
Expected: PASS — todos os describes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/motor.ts tests/indulto-comutacao/motor-2024.spec.ts
git commit -m "feat(cic-2024): os 5 dispositivos de comutação, sem pena após"
```

---

### Task 10: Metadados dos dispositivos e avisos

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2024/incisos.ts`
- Test: `tests/indulto-comutacao/incisos-2024.spec.ts`

**Interfaces:**
- Consumes: `MetaInciso` de `../../tipos`.
- Produces: `INCISOS_INDULTO_2024: MetaInciso[]` (18), `INCISOS_COMUTACAO_2024: MetaInciso[]` (5), `AVISOS_2024: { fixos: string[]; validarJuridicamente: string[] }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/indulto-comutacao/incisos-2024.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  INCISOS_INDULTO_2024,
  INCISOS_COMUTACAO_2024,
  AVISOS_2024,
} from '@/lib/indulto-comutacao/motores/2024/incisos'

describe('incisos de indulto', () => {
  it('traz os 16 do Art. 9º mais o Art. 10 e o Art. 12, na ordem da planilha', () => {
    expect(INCISOS_INDULTO_2024.map((i) => i.id)).toEqual([
      'art9_I', 'art9_II', 'art9_III', 'art9_IV', 'art9_V', 'art9_VI',
      'art9_VII', 'art9_VIII', 'art9_IX', 'art9_X', 'art9_XI', 'art9_XII',
      'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
  })

  it('marca sem regra especial exatamente onde a planilha não tem coluna T', () => {
    const semEspecial = new Set([
      'art9_XII', 'art9_XIII', 'art9_XIV', 'art9_XV', 'art9_XVI', 'art10', 'art12',
    ])
    for (const meta of INCISOS_INDULTO_2024) {
      expect(meta.temRegraEspecial, meta.id).toBe(!semEspecial.has(meta.id))
    }
  })

  it('descreve o inciso XII com a fração de 2024, não a de 2025', () => {
    const xii = INCISOS_INDULTO_2024.find((i) => i.id === 'art9_XII')!
    expect(xii.descricao).toContain('1/5')
    expect(xii.descricao).toContain('1/4')
    expect(xii.descricao).not.toContain('1/6')
  })
})

describe('incisos de comutação', () => {
  it('traz os três do Art. 11, o Art. 13 e o §4º', () => {
    expect(INCISOS_COMUTACAO_2024.map((i) => i.id)).toEqual([
      'art11_I', 'art11_II', 'art11_III', 'art13', 'art13_4',
    ])
  })

  it('nenhum tem regra especial', () => {
    for (const meta of INCISOS_COMUTACAO_2024) {
      expect(meta.temRegraEspecial, meta.id).toBe(false)
    }
  })
})

describe('AVISOS_2024', () => {
  it('traz as quatro notas fixas da planilha', () => {
    expect(AVISOS_2024.fixos).toHaveLength(4)
  })

  it('avisa sobre a base não impeditiva do inciso VIII', () => {
    const texto = AVISOS_2024.validarJuridicamente.join(' ')
    expect(texto).toMatch(/VIII/)
    expect(texto).toMatch(/não impeditiv/i)
  })

  it('avisa sobre a comparação estrita do Art. 13', () => {
    const texto = AVISOS_2024.validarJuridicamente.join(' ')
    expect(texto).toMatch(/Art\. 13/)
  })

  it('NÃO menciona pena após a comutação — 2024 não calcula esse valor', () => {
    const texto = AVISOS_2024.validarJuridicamente.join(' ').toLowerCase()
    expect(texto).not.toContain('pena após')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/incisos-2024.spec.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever os metadados**

Criar `src/lib/indulto-comutacao/motores/2024/incisos.ts`. Usar
`motores/2025/incisos.ts` como modelo de **forma**; as descrições saem da coluna `C` da aba
`Cálculo` e da aba `Resultado` de 2024. Os `AVISOS_2024`:

```ts
export const AVISOS_2024 = {
  // As NOTAS da aba Resultado (B60:B63).
  fixos: [
    'Esta ferramenta não dispensa conhecimento técnico sobre o assunto.',
    'Em nenhuma hipótese o indulto ou a comutação atingem crimes impeditivos.',
    'Indulto do Art. 9º (I, II, XIV, XV) e do Art. 10 não alcança crimes cometidos com violência ou grave ameaça.',
    'A comutação do Art. 11 é calculada somente para crimes sem violência ou grave ameaça.',
  ],
  // As ambiguidades herdadas da planilha, todas PRESERVADAS no motor.
  validarJuridicamente: [
    'No Art. 9º, VIII, a pena remanescente comparada com o teto é a NÃO IMPEDITIVA (Cálculo!M17), tanto na regra geral quanto na do §2º. Na planilha de 2025 o mesmo dispositivo usa a pena remanescente TOTAL. Cada planilha é coerente consigo, mas o dispositivo mede coisa diferente em cada ano: conferir contra o texto dos dois decretos.',
    'No Art. 9º, VIII, a regra especial do §2º DOBRA o teto da pena remanescente (de 6 anos para 12, ou de 4 para 8) em vez de reduzi-lo à metade, ao contrário de todos os outros incisos. A planilha faz assim porque ali o §2º incide sobre um teto, e não sobre uma fração exigida de cumprimento — reduzir pela metade tornaria o §2º mais restritivo para o perfil vulnerável. É interpretação, não transcrição: conferir contra o texto do Decreto.',
    'No Art. 13, a planilha exige pena cumprida MAIOR que um quinto (ou um quarto, se reincidente), numa comparação estrita, enquanto o texto do dispositivo fala em "tenham cumprido um quinto da pena". Todos os demais dispositivos, inclusive o §4º do mesmo artigo, aceitam o cumprimento exato. Com isso, quem cumpriu exatamente a fração tem a comutação do Art. 13 negada. Provável erro da fórmula original, mantido por fidelidade à planilha.',
    'A base da comutação do Art. 13 e do §4º usa o maior valor entre pena cumprida e pena remanescente — a comutação legalmente incide sobre a remanescente.',
    'Nos incisos do Art. 11, responder "NÃO SE APLICA" à reincidência satisfaz TANTO o requisito de "reincidente obrigatório" (I e III) quanto o de "não reincidente obrigatório" (II), porque a fórmula original testa a diferença e não a igualdade. Se a reincidência for controvertida nos autos, responder "SIM" ou "NÃO" em vez de "NÃO SE APLICA".',
    'A pergunta sobre hipossuficiência traz, na planilha, a remissão ao "Art. 9, §2º". A resposta alimenta o Art. 9º, XV (reparação do dano) e o Art. 12 (pena de multa acima de R$ 20.000) — não o §2º. O rótulo foi transcrito como está na planilha: conferir a remissão correta.',
  ],
}
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm exec vitest run tests/indulto-comutacao/incisos-2024.spec.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/incisos.ts tests/indulto-comutacao/incisos-2024.spec.ts
git commit -m "feat(cic-2024): metadados dos dispositivos e pontos a validar juridicamente"
```

---

### Task 11: Plugar o motor no registro

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2024/index.ts`
- Modify: `src/lib/indulto-comutacao/registro.ts:11-13`
- Create: `tests/indulto-comutacao/reconciliacao-2024.spec.ts`
- Modify: `tests/produtos/catalogo.spec.ts`

**Interfaces:**
- Consumes: `QUESTIONARIO_2024`, `INCISOS_*_2024`, `AVISOS_2024`, `calcular2024`, `CHAVES_CONSUMIDAS`.
- Produces: `motor2024: MotorDecreto`, exportado também pelo `REGISTRO`.

- [ ] **Step 1: Escrever o teste de reconciliação**

Criar `tests/indulto-comutacao/reconciliacao-2024.spec.ts`:

```ts
// Reconciliação entre o que a tela PERGUNTA e o que o motor LÊ.
//
// Uma chave que o questionário coleta e o motor ignora é pergunta inútil na tela;
// uma que o motor lê e o questionário não coleta é cálculo que silenciosamente usa
// `undefined`.

import { describe, it, expect } from 'vitest'
import { CHAVES_CONSUMIDAS } from '@/lib/indulto-comutacao/motores/2024/motor'
import { QUESTIONARIO_2024 } from '@/lib/indulto-comutacao/motores/2024/questionario'

// Campos que existem só para o advogado reconhecer o caso — nunca entram no cálculo.
const SO_DOCUMENTAL = new Set(['sentenciado', 'execucao', 'unidade', 'observacoes'])

const coletadas = new Set(QUESTIONARIO_2024.flatMap((s) => s.campos.map((c) => c.chave)))

describe('reconciliação entre questionário e motor — 2024', () => {
  it('não coleta pergunta que o motor ignora', () => {
    const orfas = [...coletadas].filter(
      (c) => !SO_DOCUMENTAL.has(c) && !CHAVES_CONSUMIDAS.includes(c as never),
    )
    expect(orfas, `perguntas sem uso no motor: ${orfas.join(', ')}`).toEqual([])
  })

  it('não lê chave que o questionário não coleta', () => {
    const faltando = CHAVES_CONSUMIDAS.filter((c) => !coletadas.has(c))
    expect(faltando, `chaves lidas e não coletadas: ${faltando.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/reconciliacao-2024.spec.ts`
Expected: PASS ou FAIL conforme a transcrição. Se falhar, corrija `CHAVES_CONSUMIDAS` ou o
questionário — as duas listas têm de coincidir em 46 chaves (50 campos menos as 4 documentais).

- [ ] **Step 3: Criar o `index.ts` e plugar no registro**

`src/lib/indulto-comutacao/motores/2024/index.ts`:

```ts
import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2024 } from './questionario'
import { INCISOS_INDULTO_2024, INCISOS_COMUTACAO_2024, AVISOS_2024 } from './incisos'
import { calcular2024 } from './motor'

/**
 * Decreto nº 12.338/2024 — indulto natalino.
 *
 * `versao` sobe a cada mudança de fórmula: é ela que fica gravada junto do
 * cálculo salvo e permite avisar o membro quando um resultado antigo muda.
 *
 * Sem `peticoes`: o Decreto 12.338/2024 ainda não tem modelo aprovado, e o
 * contrato torna o campo opcional justamente para isso. O botão "Petição" não
 * aparece até a Task 13.
 */
export const motor2024: MotorDecreto = {
  id: 'indulto-comutacao-2024',
  ano: 2024,
  rotulo: 'Decreto 12.338/2024 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2024-12-25',
  questionario: QUESTIONARIO_2024,
  incisos: { indulto: INCISOS_INDULTO_2024, comutacao: INCISOS_COMUTACAO_2024 },
  avisos: AVISOS_2024,
  calcular: calcular2024,
}
```

Em `src/lib/indulto-comutacao/registro.ts`:

```ts
import { motor2025 } from './motores/2025'
import { motor2024 } from './motores/2024'

export const REGISTRO: readonly MotorDecreto[] = [motor2025, motor2024]
```

- [ ] **Step 4: Marcar o teste de catálogo que vai ficar vermelho**

O teste "todo motor do registro tem produto no catálogo" (Task 1) **passa a falhar de propósito**:
`indulto-comutacao-2024` está no `REGISTRO` e ainda não está em `PRODUTOS`. Isso é deliberado — o
motor entra no registro antes de virar produto para ser validado contra a planilha sem que nenhum
membro consiga abrir a tela.

Em `tests/produtos/catalogo.spec.ts`, substituir aquele `it` inteiro por esta versão marcada como
esperada-falha, que a Task 14 desfaz:

```ts
  // 🔴 `it.fails` é TEMPORÁRIO, só entre a Task 11 e a Task 14. O motor de 2024 entra
  // no REGISTRO antes de virar produto, de propósito: assim ele é validado contra a
  // planilha sem que a rota /ferramentas/cic-2024 responda a ninguém. A Task 14
  // acrescenta o produto e devolve este teste para `it`.
  it.fails('todo motor do registro tem produto no catálogo (volta a `it` na Task 14)', () => {
    for (const m of REGISTRO) {
      expect(produtoDoMotor(m.id), `motor ${m.id} sem produto`).toBe(m.id)
    }
  })
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS. O `registro.spec.ts` existente passa a exercitar o contrato do `motor2024`
automaticamente (ele é um `describe.each` sobre o `REGISTRO`) — 8 testes de contrato a mais,
incluindo "calcula com entrada vazia sem lançar" e "cobre com metadado todo inciso".

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/index.ts src/lib/indulto-comutacao/registro.ts tests/indulto-comutacao/reconciliacao-2024.spec.ts tests/produtos/catalogo.spec.ts
git commit -m "feat(cic-2024): motor2024 plugado no registro de decretos"
```

---

## FATIA 3 — Petições

### Task 12: Adaptar o texto das petições — **GATE DE APROVAÇÃO**

**Files:** nenhum. O produto desta task é texto aprovado, não código.

**Interfaces:**
- Consumes: `motores/2025/peticoes.ts` como base; `AVISOS_2024` e os dispositivos da Task 10.
- Produces: o texto aprovado dos dois modelos, que a Task 13 transcreve.

- [ ] **Step 1: Montar o texto adaptado**

Ler `src/lib/indulto-comutacao/motores/2025/peticoes.ts` inteiro. Produzir os dois modelos para o
Decreto 12.338/2024, trocando:
- `NUMERO_DECRETO` de `'12.970/2025'` para `'12.338/2024'`;
- a data-base de 25/12/2025 para 25/12/2024;
- a idade do §2º — 60 anos nos dois decretos, então **não muda**;
- a fração do inciso XII, de 1/6–1/5 para **1/5–1/4**;
- o trecho da comutação, que em 2025 cita o Art. 13/§4º com as frações do decreto de lá;
- remover qualquer menção a "pena após a comutação" — 2024 não calcula esse valor.

- [ ] **Step 2: Apresentar ao dono do produto e PARAR**

Mostrar os dois textos em prosa, na conversa, e **esperar aprovação explícita**. Não escrever
`peticoes.ts` antes disso: a redação de peça judicial é decisão jurídica do dono do produto, não
do implementador.

Se a resposta pedir mudanças, refazer e apresentar de novo.

---

### Task 13: Implementar as petições de 2024

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2024/peticoes.ts`
- Modify: `src/lib/indulto-comutacao/motores/2024/index.ts`
- Test: `tests/indulto-comutacao/peticao-2024.spec.ts`

**Interfaces:**
- Consumes: o texto aprovado na Task 12; `DadosPeticao`, `MotorDecreto` de `../../tipos`; `enquadramentosDe`, `primeiroAplicavel` de `../../enquadramentos`; `formatarAnexoTexto` de `../../anexo-texto`.
- Produces: `gerarPeticaoIndulto2024(motor, dados): string` e `gerarPeticaoComutacao2024(motor, dados): string`; `motor2024.peticoes`.

> **Bloqueada pela Task 12.** Não comece sem a aprovação registrada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/indulto-comutacao/peticao-2024.spec.ts`, espelhando
`tests/indulto-comutacao/peticao-2025.spec.ts` (que monta um `motorFalso` e confere o texto
gerado). Os testes mínimos:

```ts
import { describe, it, expect } from 'vitest'
import {
  gerarPeticaoIndulto2024,
  gerarPeticaoComutacao2024,
} from '@/lib/indulto-comutacao/motores/2024/peticoes'
import { motor2024 } from '@/lib/indulto-comutacao/motores/2024'
import type { DadosPeticao } from '@/lib/indulto-comutacao/tipos'

function dados(entrada: Record<string, unknown>, titulo = 'Execução 123'): DadosPeticao {
  const e = entrada as DadosPeticao['entrada']
  return { entrada: e, resultado: motor2024.calcular(e), titulo }
}

describe('petição de indulto — 2024', () => {
  it('devolve vazio quando nenhum dispositivo de indulto se aplica', () => {
    expect(gerarPeticaoIndulto2024(motor2024, dados({}))).toBe('')
  })

  it('cita o Decreto 12.338/2024 e a data-base de 2024', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('12.338/2024')
    expect(texto).toContain('25/12/2024')
    expect(texto).not.toContain('12.970/2025')
  })

  it('usa o nome e a execução do cálculo, com marcador quando faltam', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('[NOME DO SENTENCIADO]')
    expect(texto).toContain('[NÚMERO DA EXECUÇÃO]')
  })

  it('anexa as premissas do cálculo', () => {
    const texto = gerarPeticaoIndulto2024(
      motor2024,
      dados({
        sentenciado: 'Fulano de Tal',
        penaSemViolencia: { anos: 6, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 0, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto).toContain('Fulano de Tal')
    expect(texto).toContain('---')
  })
})

describe('petição de comutação — 2024', () => {
  it('devolve vazio quando nenhuma comutação se aplica', () => {
    expect(gerarPeticaoComutacao2024(motor2024, dados({}))).toBe('')
  })

  it('não menciona pena após a comutação — 2024 não calcula esse valor', () => {
    const texto = gerarPeticaoComutacao2024(
      motor2024,
      dados({
        penaSemViolencia: { anos: 10, meses: 0, dias: 0 },
        penaCumpridaSEEU: { anos: 2, meses: 6, dias: 0 },
        reincidente: 'NÃO',
        cumpriu23ImpeditivoDataFato: 'SIM',
        cumpriuFracaoViolenciaDataFato: 'SIM',
      }),
    )
    expect(texto.toLowerCase()).not.toContain('pena após')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run tests/indulto-comutacao/peticao-2024.spec.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `peticoes.ts`**

Transcrever o texto **aprovado na Task 12**. Cabeçalho obrigatório:

```ts
// Modelos de petição do Decreto 12.338/2024 — TEXTO JURÍDICO confirmado pelo dono do produto.
// Mudar a REDAÇÃO aqui é decisão jurídica dele, não refatoração de código.
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO — mesmo aviso de `questionario.ts`/`incisos.ts`/`motor.ts`.
// Campo sem fonte de dado no questionário (vara, comarca, nome do advogado, OAB, cidade)
// permanece como texto para o advogado preencher à mão — não é bug, é limite real do que o
// cálculo sabe.
//
// 🔴 2024 NÃO TEM "pena após a comutação": a planilha não calcula esse valor, e `penaApos` é
// sempre `null`. Não escreva no texto um número que o motor não tem.
```

- [ ] **Step 4: Plugar no motor**

Em `src/lib/indulto-comutacao/motores/2024/index.ts`, acrescentar o import e o campo, e apagar
o parágrafo do comentário que dizia que o motor sai sem petições:

```ts
import { gerarPeticaoIndulto2024, gerarPeticaoComutacao2024 } from './peticoes'
```

```ts
  calcular: calcular2024,
  peticoes: {
    indulto: (dados) => gerarPeticaoIndulto2024(motor2024, dados),
    comutacao: (dados) => gerarPeticaoComutacao2024(motor2024, dados),
  },
}
```

- [ ] **Step 5: Rodar os testes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/indulto-comutacao/motores/2024/peticoes.ts src/lib/indulto-comutacao/motores/2024/index.ts tests/indulto-comutacao/peticao-2024.spec.ts
git commit -m "feat(cic-2024): modelos de petição de indulto e comutação do Decreto 12.338/2024"
```

---

## FATIA 4 — Produto

### Task 14: Vender a calculadora de 2024

**Files:**
- Modify: `src/lib/produtos/catalogo.ts`
- Modify: `tests/produtos/catalogo.spec.ts`

**Interfaces:**
- Consumes: `motor2024` (Task 11).
- Produces: `PRODUTOS` com a entrada de 2024; a rota `/ferramentas/cic-2024` passa a responder.

- [ ] **Step 1: Devolver o teste do catálogo ao estado normal**

Em `tests/produtos/catalogo.spec.ts`, trocar o `it.fails(...)` de volta para `it(...)` e apagar o
comentário que explicava a janela entre as Tasks 11 e 14:

```ts
  it('todo motor do registro tem produto no catálogo', () => {
    for (const m of REGISTRO) {
      expect(produtoDoMotor(m.id), `motor ${m.id} sem produto`).toBe(m.id)
    }
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run tests/produtos/catalogo.spec.ts`
Expected: FAIL — `motor indulto-comutacao-2024 sem produto`.

- [ ] **Step 3: Acrescentar o produto**

Em `src/lib/produtos/catalogo.ts`, acrescentar a segunda entrada, **depois** da de 2025:

```ts
  {
    id: 'indulto-comutacao-2024',
    slug: 'cic-2024',
    rotulo: 'Calculadora de Indulto e Comutação — Decreto 12.338/2024',
    menuTitulo: 'GPS CIC - Calculadora 2024',
    menuDescricao: 'Decreto 12.338/2024',
  },
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Verificar no navegador**

Run: `pnpm dev`

Logado como dono do servidor (que passa por cima do controle de venda), conferir:
1. `/ferramentas` mostra **dois** cartões, 2025 e 2024.
2. O menu lateral mostra os dois sob "Indulto e Comutação".
3. `/ferramentas/cic-2024/novo` abre o questionário de 2024 — conferir que o inciso XI fala em "no mínimo, doze meses" e que a pergunta das penas substituídas começa com "Tem".
4. Preencher pena sem violência 6a e cumprida 2a, não reincidente: o Art. 9º, I fica verde.
5. Salvar. A URL vira `/ferramentas/cic-2024/<id>`.
6. Os cartões de comutação **não** mostram linha de "pena após a comutação".
7. O botão "Petição" aparece (Task 13 concluída) e o texto cita 12.338/2024.
8. Voltar para `/ferramentas/cic-2025`: a lista mostra **só** cálculos de 2025, sem o que acabou de ser criado em 2024.
9. Abrir `/ferramentas/cic-2024/<id-de-um-cálculo-de-2025>` e confirmar 404.
10. Excluir o cálculo de 2024 e confirmar que volta para `/ferramentas/cic-2024`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/produtos/catalogo.ts tests/produtos/catalogo.spec.ts
git commit -m "feat(cic-2024): calculadora de 2024 como produto vendável"
```

- [ ] **Step 7: Avisar o dono do produto**

A calculadora só aparece para quem tem o produto liberado. Nenhuma oferta da Hotmart libera
`indulto-comutacao-2024` ainda — isso é dado, configurado na tabela `ofertas` (coluna `produtos`,
que é um array). Avisar que, para vender, é preciso associar o produto a uma oferta; até lá só o
dono do servidor vê a calculadora.
