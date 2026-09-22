# Ajustes na ferramenta Indulto e Comutação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis ajustes pedidos pelo usuário na ferramenta "Indulto e comutação": card da listagem 100% clicável, busca client-side na listagem, confirmação de que não há paginação a remover, botão Imprimir realinhado (mesma linha do Salvar), anexo impresso com TODAS as perguntas (não só as preenchidas), e um botão "Petição" que gera o texto de indulto e/ou comutação já preenchido com os dados do cálculo, num overlay com botão de copiar.

**Architecture:** Tudo dentro do módulo já existente `src/app/(app)/ferramentas/indulto-comutacao/` (telas) e `src/lib/indulto-comutacao/` (motor e utilitários de domínio). Três peças novas e reutilizáveis em `src/lib/indulto-comutacao/` (`enquadramentos.ts`, `anexo-texto.ts`, e o campo opcional `peticoes` em `MotorDecreto`) fazem a ponte entre o motor de cálculo e a geração de petição, sem que nenhum arquivo genérico saiba o que é "Art. 9º" — isso continua isolado em `motores/2025/`. O overlay de petição reaproveita o componente `Drawer` já existente no kit de UI. Nenhuma dependência nova.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + CSS Modules (sem Tailwind/shadcn) + Supabase (Postgres/PostgREST) + Vitest (`environment: 'node'`, sem DOM).

**Spec:** Esta conversa (pedidos do usuário, confirmados um a um) — não há documento de spec separado. Os dois modelos de petição (indulto e comutação) foram confirmados pelo usuário nesta mesma conversa; o texto final de cada um está reproduzido nos Tasks 8.

## Global Constraints

- Sem novas dependências de build: nada de lib de PDF/DOCX. O overlay de petição usa `src/components/ui/Drawer.tsx`, que já existe.
- CSS só com token do kit (`--s-*`, `--tinta`, `--superficie`, `--linha`, `--r-painel`, `--fundo`, etc.) — nunca hex solto nem `var(--borda, …)` (não existe no kit).
- Arquivos dentro de `src/lib/indulto-comutacao/motores/2025/` são ESPECÍFICOS do Decreto 12.970/2025 (mesma regra que já vale para `questionario.ts`/`incisos.ts`/`motor.ts`); nada específico de 2025 pode vazar para `tipos.ts`, `respostas-anexo.ts`, `enquadramentos.ts` ou `anexo-texto.ts`, que servem a todo decreto.
- `MotorDecreto` (e agora `MotorDecreto.peticoes`) só existe inteiro no CLIENTE — nunca passe o objeto `motor` como prop de Server Component para Client Component; só o `decretoId` (string) atravessa essa fronteira (ver comentário em `Calculadora.tsx`). Isso já era verdade por causa de `calcular`; `peticoes` só soma mais funções ao mesmo objeto que já vive só no cliente.
- Testes automatizados só existem para lógica pura em `src/lib/**` (`vitest.config.ts` roda em `environment: 'node'`, sem jsdom/testing-library) — siga o padrão do projeto: componentes React (botões, listas, overlay) são verificados manualmente com `pnpm dev`, nunca com teste de render. Rodar a suíte: `pnpm test`.
- Convenção de nomes e comentários em português, no mesmo tom econômico do resto do módulo (comentário só quando explica um "porquê" não óbvio).

---

## Task 1: Trazer sentenciado e número de execução para a listagem

Hoje `listarCalculos()` busca só um resumo (`id, decreto_id, motor_versao, titulo, criado_em, atualizado_em`) e omite todo o jsonb `entrada` de propósito, porque ele pode chegar a ~1 MB. A busca por sentenciado/execução (Task 2) precisa desses dois campos em cada item da lista, sem voltar a trazer o jsonb inteiro — dá para pedir só essas duas chaves via `->>` do PostgREST, direto no `select`.

**Files:**
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/calculos.ts:19-31` (tipo `CalculoResumo` e `COLUNAS_RESUMO`)

**Interfaces:**
- Produces: `CalculoResumo` passa a ter `sentenciado: string | null` e `execucao: string | null`, usados pela Task 2 (`filtro-calculos.ts`/`ListaCalculos.tsx`).

- [ ] **Step 1: Atualizar o tipo e a query**

```ts
/** A vista de lista: sem o `entrada`/`resultado` INTEIROS — cada um pode chegar a ~1 MB de
 * jsonb. `sentenciado` e `execucao` são as duas únicas chaves extraídas de `entrada`, via `->>`
 * do PostgREST: isso lê só esses dois campos de texto, sem trazer o jsonb completo. */
export type CalculoResumo = {
  id: string
  decreto_id: string
  motor_versao: string
  titulo: string
  criado_em: string
  atualizado_em: string
  sentenciado: string | null
  execucao: string | null
}

const COLUNAS_RESUMO =
  'id, decreto_id, motor_versao, titulo, criado_em, atualizado_em, sentenciado:entrada->>sentenciado, execucao:entrada->>execucao'
```

Nada mais muda em `calculos.ts`: `listarCalculos()` já faz `.select(COLUNAS_RESUMO)` e devolve `(data ?? []) as CalculoResumo[]` — o novo shape passa a valer automaticamente.

- [ ] **Step 2: Verificar manualmente**

Não há teste automatizado possível aqui (é uma chamada de rede ao Supabase; `calculos.ts` importa `'server-only'`). Rode `pnpm dev`, abra `/ferramentas/indulto-comutacao` com pelo menos um cálculo salvo cujo campo "Sentenciado" e "Execução nº" estejam preenchidos, e confirme (via `console.log` temporário em `page.tsx` ou pela Task 2 já pronta) que `calculos[0].sentenciado`/`.execucao` vêm preenchidos — não `undefined`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/calculos.ts"
git commit -m "feat(indulto-comutacao): trazer sentenciado e execução no resumo da listagem"
```

---

## Task 2: Lista com card 100% clicável, busca local e sem paginação

Três pedidos do usuário resolvidos juntos porque todos tocam a mesma listagem: (a) hoje só o título dentro do card é um `<Link>` — o resto do card (metadados) não navega; (b) falta uma busca que filtre por sentenciado, execução ou título, sem ida ao servidor; (c) confirmado por investigação: **não existe paginação implementada** em `listarCalculos()` nem em `page.tsx` — não há nada a remover, a lista já mostra tudo.

**Files:**
- Create: `src/app/(app)/ferramentas/indulto-comutacao/filtro-calculos.ts`
- Create: `tests/indulto-comutacao/filtro-calculos.spec.ts`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/ListaCalculos.tsx`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/page.tsx:57-70`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css:237-269`

**Interfaces:**
- Consumes: `CalculoResumo` (Task 1, com `sentenciado`/`execucao`).
- Produces: `filtrarCalculos(calculos: CalculoResumo[], termo: string): CalculoResumo[]`, componente `<ListaCalculos calculos={CalculoResumo[]} />`.

- [ ] **Step 1: Escrever o teste do filtro**

```ts
// tests/indulto-comutacao/filtro-calculos.spec.ts
import { describe, it, expect } from 'vitest'
import { filtrarCalculos } from '../../src/app/(app)/ferramentas/indulto-comutacao/filtro-calculos'
import type { CalculoResumo } from '../../src/app/(app)/ferramentas/indulto-comutacao/calculos'

function calculo(parcial: Partial<CalculoResumo>): CalculoResumo {
  return {
    id: '1',
    decreto_id: 'indulto-comutacao-2025',
    motor_versao: '1.0.0',
    titulo: 'Sem título',
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    sentenciado: null,
    execucao: null,
    ...parcial,
  }
}

describe('filtrarCalculos', () => {
  it('devolve tudo quando o termo está vazio ou só espaço', () => {
    const lista = [calculo({ id: '1' }), calculo({ id: '2' })]
    expect(filtrarCalculos(lista, '')).toEqual(lista)
    expect(filtrarCalculos(lista, '   ')).toEqual(lista)
  })

  it('filtra pelo título do cálculo', () => {
    const lista = [calculo({ id: '1', titulo: 'Caso João' }), calculo({ id: '2', titulo: 'Outro título' })]
    expect(filtrarCalculos(lista, 'joão')).toEqual([lista[0]])
  })

  it('filtra pelo nome do sentenciado', () => {
    const lista = [
      calculo({ id: '1', sentenciado: 'Maria da Silva' }),
      calculo({ id: '2', sentenciado: 'José Souza' }),
    ]
    expect(filtrarCalculos(lista, 'silva')).toEqual([lista[0]])
  })

  it('filtra pelo número de execução', () => {
    const lista = [calculo({ id: '1', execucao: '0001234-56.2020' }), calculo({ id: '2', execucao: '9999999' })]
    expect(filtrarCalculos(lista, '1234')).toEqual([lista[0]])
  })

  it('ignora acento e caixa', () => {
    const lista = [calculo({ id: '1', sentenciado: 'José Antônio' })]
    expect(filtrarCalculos(lista, 'JOSE ANTONIO')).toEqual(lista)
  })

  it('trata sentenciado/execução ausentes sem quebrar', () => {
    const lista = [calculo({ id: '1', sentenciado: null, execucao: null, titulo: 'X' })]
    expect(filtrarCalculos(lista, 'y')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- filtro-calculos`
Expected: FAIL — `filtro-calculos.ts` ainda não existe.

- [ ] **Step 3: Implementar o filtro**

```ts
// src/app/(app)/ferramentas/indulto-comutacao/filtro-calculos.ts
import type { CalculoResumo } from './calculos'

function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filtra os cálculos pelo termo digitado, comparando com o título do cálculo, o nome do
 * sentenciado e o número de execução — os três atributos que já chegam prontos no resumo da
 * listagem (ver `calculos.ts`). Sem acento e sem caixa: comparação "contém", não igualdade. Roda
 * inteiro no navegador — não há busca no servidor.
 */
export function filtrarCalculos(calculos: CalculoResumo[], termo: string): CalculoResumo[] {
  const alvo = normalizar(termo)
  if (alvo === '') return calculos
  return calculos.filter((c) => {
    const campos = [c.titulo, c.sentenciado ?? '', c.execucao ?? '']
    return campos.some((campo) => normalizar(campo).includes(alvo))
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- filtro-calculos`
Expected: PASS (6 testes)

- [ ] **Step 5: Criar o componente de lista com busca e card inteiro clicável**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/ListaCalculos.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Campo, Entrada as EntradaControle } from '@/components/ui/Campo'
import { formatarDataHora } from '@/lib/data-hora'
import { filtrarCalculos } from './filtro-calculos'
import type { CalculoResumo } from './calculos'
import estilos from './calculadora.module.css'

/**
 * A lista inteira do membro, sem paginação — nunca há tantos cálculos por membro que isso vire
 * problema (ver investigação: `listarCalculos()` já não pagina).
 */
export default function ListaCalculos({ calculos }: { calculos: CalculoResumo[] }) {
  const [termo, setTermo] = useState('')
  const filtrados = useMemo(() => filtrarCalculos(calculos, termo), [calculos, termo])

  return (
    <div className={estilos.listaWrap}>
      <Campo rotulo="Buscar" className={estilos.busca}>
        <EntradaControle
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome do sentenciado, nº de execução ou título do cálculo"
        />
      </Campo>

      {filtrados.length === 0 ? (
        <p className={estilos.buscaVazia}>Nenhum cálculo encontrado para &quot;{termo}&quot;.</p>
      ) : (
        <ul className={estilos.lista}>
          {filtrados.map((c) => (
            <li key={c.id}>
              {/* O card INTEIRO é o link — antes só o título navegava, e a área de metadados
                  (decreto/motor/data), que ocupa a largura toda, parecia clicável e não era. */}
              <Link href={`/ferramentas/indulto-comutacao/${c.id}`} className={estilos.item}>
                <b className={estilos.itemTitulo}>{c.titulo}</b>
                <div className={estilos.itemMeta}>
                  {c.decreto_id} · motor {c.motor_versao} ·{' '}
                  {formatarDataHora(c.atualizado_em)}
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

- [ ] **Step 6: Atualizar `page.tsx` para usar o novo componente**

Em `src/app/(app)/ferramentas/indulto-comutacao/page.tsx`, trocar o import e o bloco da lista (linhas 57-70):

```tsx
import ListaCalculos from './ListaCalculos'
```

```tsx
      ) : (
        <ListaCalculos calculos={calculos} />
      )}
```

(substitui o `<ul className={estilos.lista}>...</ul>` que estava direto em `page.tsx`; os imports `Link` (de `next/link`) e `formatarDataHora` (de `@/lib/data-hora`) deixam de ser usados em `page.tsx` — a formatação da data/hora de cada item passa a viver em `ListaCalculos.tsx` — e devem ser removidos de `page.tsx`.)

- [ ] **Step 7: Atualizar o CSS — card clicável por inteiro + estilos da busca**

Em `calculadora.module.css`, substituir as regras `.itemLink`/`.itemTitulo`/`.itemMeta`/`.item` (linhas 237-269) por:

```css
/* O card inteiro é o link (ver ListaCalculos.tsx) — antes .item vivia no <li> e só o título,
   dentro dele, era um <a>; a diferença entre "parece clicável" e "é clicável" era exatamente
   essa borda entre os dois elementos. */
.item {
  display: block;
  padding: var(--s-4) var(--s-5);
  background: var(--superficie);
  border: 1px solid var(--linha);
  border-radius: var(--r-painel);
  box-shadow: var(--elev-1);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--t-rapido) var(--suave);
}
.item:hover {
  border-color: var(--linha-forte);
}
.item:focus-visible {
  outline: 2px solid var(--acento);
  outline-offset: 2px;
  border-radius: var(--r-pequeno);
}

.itemTitulo {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--tinta);
}

.itemMeta {
  font-size: var(--fs-micro);
  color: var(--tinta-3);
}

.listaWrap {
  display: grid;
  gap: var(--s-4);
}

.busca {
  max-width: 480px;
}

.buscaVazia {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  color: var(--tinta-3);
  font-size: var(--fs-body);
}
```

(a classe `.itemLink` deixa de existir — grep confirma que só `page.tsx`, agora reescrito, a usava.)

- [ ] **Step 8: Verificar manualmente**

`pnpm dev`, abrir `/ferramentas/indulto-comutacao` com pelo menos 2 cálculos salvos:
- clicar em qualquer ponto do card (inclusive na linha de metadados, não só no título) navega para o cálculo;
- digitar parte do nome do sentenciado, do número de execução ou do título filtra a lista instantaneamente, sem reload de página;
- limpar a busca mostra todos de novo;
- termo sem correspondência mostra "Nenhum cálculo encontrado para…";
- confirmar visualmente que a lista inteira aparece de uma vez (sem paginação) mesmo com vários itens.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/filtro-calculos.ts" \
        "tests/indulto-comutacao/filtro-calculos.spec.ts" \
        "src/app/(app)/ferramentas/indulto-comutacao/ListaCalculos.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/page.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css"
git commit -m "feat(indulto-comutacao): card da listagem 100% clicável e busca local por sentenciado/execução/título"
```

---

## Task 3: Botão Imprimir na mesma linha do Salvar, sem colar nos cards

Hoje `BotaoImprimir` é renderizado em bloco próprio, sozinho, sem `margin-bottom` — por isso encosta direto nos cards de resumo. O pedido do usuário é colocá-lo ao lado do "Salvar alterações". A correção: o botão Imprimir entra na MESMA linha flexível (`.linhaTitulo`) onde já vivem o campo de título e o botão Salvar, via um novo prop `acoesExtras` em `BarraSalvar`; no caso de acesso encerrado (sem `BarraSalvar` na tela), o Imprimir continua em linha própria, mas agora com espaçamento.

**Files:**
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/BotaoImprimir.tsx`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/BarraSalvar.tsx`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx:90-117`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css:205-208`

**Interfaces:**
- Produces: `BarraSalvar` ganha o prop opcional `acoesExtras?: ReactNode`.

- [ ] **Step 1: `BotaoImprimir` deixa de ter wrapper próprio**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/BotaoImprimir.tsx
'use client'

import { Printer } from 'lucide-react'
import Botao from '@/components/ui/Botao'

/**
 * Manda o resultado para o papel — o destino dele é anexo de petição.
 *
 * 🔴 Continua fora da `BarraSalvar` como componente PRÓPRIO de propósito: com o acesso
 * encerrado a barra não é renderizada (o membro consulta, não edita), e imprimir um cálculo já
 * pago continua valendo — por isso não olha `somenteLeitura`. O que mudou é só o layout: quem
 * decide onde este botão entra na linha é o pai (`Calculadora.tsx`/`BarraSalvar.tsx`), não mais
 * uma div própria aqui dentro.
 */
export default function BotaoImprimir() {
  return (
    <Botao type="button" variante="secundario" onClick={() => window.print()}>
      <Printer size={16} strokeWidth={2} aria-hidden="true" />
      Imprimir
    </Botao>
  )
}
```

- [ ] **Step 2: `BarraSalvar` ganha o slot `acoesExtras` na mesma linha do Salvar**

Em `BarraSalvar.tsx`, adicionar `ReactNode` ao import de `'react'` e o novo prop:

```tsx
import { useState, useTransition, type ReactNode } from 'react'
```

```tsx
export default function BarraSalvar({
  motor,
  entrada,
  calculoId,
  titulo,
  aoMudarTitulo,
  acoesExtras,
}: {
  motor: MotorDecreto
  entrada: Entrada
  calculoId?: string
  titulo: string
  aoMudarTitulo: (valor: string) => void
  /** Botões que entram na mesma linha do "Salvar alterações" — hoje o Imprimir e, quando
   *  aplicável, a Petição. Ficam aqui, e não soltos em `Calculadora`, porque é esta linha
   *  (`.linhaTitulo`) que já resolve o alinhamento com o campo de título. */
  acoesExtras?: ReactNode
}) {
```

E, dentro do JSX, logo depois do botão Salvar:

```tsx
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
          {acoesExtras}
        </div>
```

- [ ] **Step 3: `Calculadora.tsx` passa Imprimir como `acoesExtras`, e mantém uma linha própria (com espaçamento) no acesso encerrado**

Substituir o trecho de `Calculadora.tsx:96-114`:

```tsx
        {somenteLeitura ? (
          <>
            <div className={estilos.avisoVersao} role="status">
              <b>Acesso encerrado.</b> Você pode consultar e excluir os seus cálculos, mas criar e
              editar exige renovar o acesso.
            </div>
            <div className={estilos.barraImprimir}>
              <BotaoImprimir />
            </div>
          </>
        ) : (
          <BarraSalvar
            motor={motor}
            entrada={entrada}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
            acoesExtras={<BotaoImprimir />}
          />
        )}
        {/* Só no papel: identifica o caso e lista as premissas. Ver CabecalhoAnexo.tsx. */}
        <CabecalhoAnexo motor={motor} entrada={entrada} titulo={titulo} />
        <Resultado motor={motor} resultado={resultado} />
```

(remove a linha solta `<BotaoImprimir />` que existia entre o ternário e o `CabecalhoAnexo`.)

- [ ] **Step 4: CSS — `.barraImprimir` ganha o espaçamento que faltava**

Em `calculadora.module.css:205-208`, trocar:

```css
.barraImprimir {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-3);
  margin-bottom: var(--s-5);
}
```

(o `gap` separa Imprimir de um futuro segundo botão nessa linha — Task 9 — e o `margin-bottom`, que faltava, é exatamente o que resolvia o botão colado nos cards no caso de acesso encerrado. No caso normal, o espaçamento já vem de `.barra` por causa de `BarraSalvar`.)

- [ ] **Step 5: Verificar manualmente**

`pnpm dev`, abrir um cálculo salvo com acesso ativo: "Salvar alterações" e "Imprimir" aparecem na mesma linha, à direita do campo de título, sem colar nos cards de resumo abaixo. Para conferir o caso de acesso encerrado, force temporariamente `somenteLeitura` para `true` em `[id]/page.tsx` (reverta depois) e confirme que o Imprimir aparece isolado, mas com respiro visível antes dos cards.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/BotaoImprimir.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/BarraSalvar.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/calculadora.module.css"
git commit -m "fix(indulto-comutacao): Imprimir na mesma linha do Salvar, sem colar nos cards de resultado"
```

---

## Task 4: Anexo impresso com TODAS as perguntas, mesmo sem resposta

Hoje `respostasPreenchidas` só lista o que o membro mudou do valor padrão — decisão tomada mais cedo nesta mesma sessão (14/09/2026), documentada no próprio arquivo. O usuário agora pede o inverso: o anexo deve trazer o questionário inteiro, com o valor de cada campo no momento do cálculo, respondido ou não. A função é renomeada (não hà mais dois modos concorrentes) e `respostaDe` passa a nunca devolver `null`.

**Files:**
- Modify: `src/lib/indulto-comutacao/respostas-anexo.ts`
- Modify: `tests/indulto-comutacao/respostas-anexo.spec.ts`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/CabecalhoAnexo.tsx`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/resultado.module.css:183-186` (remover `.anexoVazio`, que fica sem uso)

**Interfaces:**
- Produces: `todasAsRespostas(motor: MotorDecreto, entrada: Entrada): RespostaDoAnexo[]` — substitui `respostasPreenchidas` (removida; nenhum outro consumidor além de `CabecalhoAnexo.tsx` e deste spec).

- [ ] **Step 1: Reescrever o teste para o novo comportamento**

```ts
// tests/indulto-comutacao/respostas-anexo.spec.ts
import { describe, it, expect } from 'vitest'
import { todasAsRespostas } from '@/lib/indulto-comutacao/respostas-anexo'
import { motor2025 } from '@/lib/indulto-comutacao/motores/2025'
import { entradaInicial } from '../../src/app/(app)/ferramentas/indulto-comutacao/Calculadora'
import type { Entrada, MotorDecreto, Secao } from '@/lib/indulto-comutacao/tipos'

const motorFalso = (secoes: Secao[]): MotorDecreto => ({
  ...motor2025,
  questionario: secoes,
})

describe('todasAsRespostas', () => {
  it('devolve uma linha por campo do questionário, mesmo sem nenhuma resposta alterada', () => {
    const linhas = todasAsRespostas(motor2025, entradaInicial(motor2025))
    const totalCampos = motor2025.questionario.reduce((n, s) => n + s.campos.length, 0)
    expect(linhas.length).toBe(totalCampos)
  })

  it('tempo: mostra o valor informado, ou "0 anos 0 meses 0 dias" quando ausente', () => {
    const m = motorFalso([
      { id: 's', titulo: 'Seção', campos: [{ tipo: 'tempo', chave: 't', rotulo: 'Pena' }] },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Seção', rotulo: 'Pena', valor: '0 anos 0 meses 0 dias' }])
    expect(todasAsRespostas(m, { t: { anos: 7, meses: 5, dias: 1 } })).toEqual([
      { secao: 'Seção', rotulo: 'Pena', valor: '7 anos 5 meses 1 dias' },
    ])
  })

  it('seleção: mostra o valor escolhido, ou o padrão do campo quando ausente', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Perfil',
        campos: [{ tipo: 'selecao', chave: 'r', rotulo: 'Reincidente', opcoes: ['SIM', 'NÃO'] }],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Perfil', rotulo: 'Reincidente', valor: 'NÃO' }])
    expect(todasAsRespostas(m, { r: 'SIM' })).toEqual([{ secao: 'Perfil', rotulo: 'Reincidente', valor: 'SIM' }])
  })

  it('seleção: usa o padrão declarado do campo, não o "NÃO" presumido', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Fato',
        campos: [{ tipo: 'selecao', chave: 'f', rotulo: 'Cumpriu 2/3?', opcoes: ['SIM', 'NÃO'], padrao: 'SIM' }],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([{ secao: 'Fato', rotulo: 'Cumpriu 2/3?', valor: 'SIM' }])
    expect(todasAsRespostas(m, { f: 'NÃO' })).toEqual([{ secao: 'Fato', rotulo: 'Cumpriu 2/3?', valor: 'NÃO' }])
  })

  it('texto, número e data: mostra o valor, ou "Não informado"/"0" quando ausente', () => {
    const m = motorFalso([
      {
        id: 's',
        titulo: 'Identificação',
        campos: [
          { tipo: 'texto', chave: 'exec', rotulo: 'Execução nº' },
          { tipo: 'numero', chave: 'rem', rotulo: 'Remição' },
          { tipo: 'data', chave: 'nasc', rotulo: 'Nascimento' },
        ],
      },
    ])
    expect(todasAsRespostas(m, {})).toEqual([
      { secao: 'Identificação', rotulo: 'Execução nº', valor: 'Não informado' },
      { secao: 'Identificação', rotulo: 'Remição', valor: '0' },
      { secao: 'Identificação', rotulo: 'Nascimento', valor: 'Não informado' },
    ])
    expect(todasAsRespostas(m, { exec: '0001234-56', rem: 120, nasc: '1980-03-02' })).toEqual([
      { secao: 'Identificação', rotulo: 'Execução nº', valor: '0001234-56' },
      { secao: 'Identificação', rotulo: 'Remição', valor: '120' },
      { secao: 'Identificação', rotulo: 'Nascimento', valor: '02/03/1980' },
    ])
  })

  it('mantém a ordem do questionário e diz a seção de cada resposta', () => {
    const linhas = todasAsRespostas(motor2025, entradaInicial(motor2025))
    expect(linhas[0]).toEqual({ secao: 'Identificação', rotulo: 'Sentenciado', valor: 'Não informado' })
    for (const l of linhas) expect(l.secao).not.toBe('')
  })

  it('ignora chave que o questionário não declara', () => {
    const entrada = { ...entradaInicial(motor2025), chaveInventada: 'X' } as Entrada
    const totalCampos = motor2025.questionario.reduce((n, s) => n + s.campos.length, 0)
    expect(todasAsRespostas(motor2025, entrada).length).toBe(totalCampos)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- respostas-anexo`
Expected: FAIL — `todasAsRespostas` ainda não existe (só `respostasPreenchidas`).

- [ ] **Step 3: Reescrever `respostas-anexo.ts`**

```ts
// src/lib/indulto-comutacao/respostas-anexo.ts
import { padraoDoCampo } from './padrao'
import type { Campo, Entrada, MotorDecreto, Tempo } from './tipos'

export interface RespostaDoAnexo {
  secao: string
  rotulo: string
  valor: string
}

/** Como o resumo de tempos e a planilha: três casas, sempre no plural. */
function formatarTempo(t: Tempo): string {
  return `${t.anos} anos ${t.meses} meses ${t.dias} dias`
}

/** `YYYY-MM-DD` vira `DD/MM/YYYY` sem passar por `Date` — que deslocaria o dia pelo fuso. */
function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim()
}

function ehTempo(v: unknown): v is Tempo {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.anos === 'number' && typeof t.meses === 'number' && typeof t.dias === 'number'
}

/** O valor deste campo para o anexo — SEMPRE uma string, nunca `null`: campo sem resposta
 *  aparece com o valor que tinha ao nascer (tempo zerado, seleção no padrão, texto/data/número
 *  vazios viram "Não informado"/"0"). */
function respostaDe(campo: Campo, bruto: unknown): string {
  if (campo.tipo === 'tempo') {
    return formatarTempo(ehTempo(bruto) ? bruto : { anos: 0, meses: 0, dias: 0 })
  }
  if (campo.tipo === 'selecao') {
    // 🔴 Padrão de `padraoDoCampo`, NUNCA 'NÃO' fixo: há campo cujo padrão declarado é 'SIM'
    // (os dois requisitos da data do fato) — é ele que precisa aparecer quando não respondido.
    return typeof bruto === 'string' && bruto !== '' ? bruto : padraoDoCampo(campo)
  }
  if (campo.tipo === 'numero') {
    const n = typeof bruto === 'number' ? bruto : Number(bruto)
    return Number.isFinite(n) ? String(n) : '0'
  }
  const texto = typeof bruto === 'string' ? bruto.trim() : ''
  if (texto === '') return 'Não informado'
  return campo.tipo === 'data' ? formatarData(texto) : texto
}

/**
 * TODAS as respostas do questionário, na ordem dele — inclusive as que ficaram no valor com que
 * o campo nasce.
 *
 * 🔴 Decisão revista em 14/09/2026, no mesmo dia da decisão anterior: a versão anterior
 * (`respostasPreenchidas`) só listava o que havia sido alterado do padrão, para não afogar os
 * poucos preenchimentos relevantes em ~50 "NÃO". O usuário pediu o inverso — o anexo agora é o
 * retrato completo do questionário no momento do cálculo, respondido ou não. Não há mais duas
 * funções concorrentes: esta substitui `respostasPreenchidas` para todo consumidor.
 *
 * Chave que o questionário não declara é ignorada — mesma regra de `preparar()`, que filtra por
 * chave ao gravar. O anexo não pode ressuscitar o que a gravação descartou.
 */
export function todasAsRespostas(motor: MotorDecreto, entrada: Entrada): RespostaDoAnexo[] {
  const linhas: RespostaDoAnexo[] = []
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) {
      linhas.push({ secao: secao.titulo, rotulo: campo.rotulo, valor: respostaDe(campo, entrada[campo.chave]) })
    }
  }
  return linhas
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- respostas-anexo`
Expected: PASS (7 testes)

- [ ] **Step 5: Atualizar `CabecalhoAnexo.tsx`**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/CabecalhoAnexo.tsx
'use client'

import { useEffect, useState } from 'react'
import { todasAsRespostas } from '@/lib/indulto-comutacao/respostas-anexo'
import { formatarDataHora } from '@/lib/data-hora'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import estilos from './resultado.module.css'

export default function CabecalhoAnexo({
  motor,
  entrada,
  titulo,
}: {
  motor: MotorDecreto
  entrada: Entrada
  titulo: string
}) {
  const [impressoEm, setImpressoEm] = useState<string | null>(null)
  useEffect(() => setImpressoEm(formatarDataHora(new Date())), [])

  const respostas = todasAsRespostas(motor, entrada)

  return (
    <section className={estilos.anexo} aria-hidden="true">
      <h1 className={estilos.anexoTitulo}>Cálculo de indulto e comutação</h1>
      <p className={estilos.anexoMeta}>
        {titulo.trim() || 'Cálculo sem identificação'}
        {impressoEm ? ` · impresso em ${impressoEm}` : ''}
      </p>

      <h2 className={estilos.anexoSecao}>Respostas informadas</h2>
      <dl className={estilos.anexoLista}>
        {respostas.map((r) => (
          <div key={`${r.secao}-${r.rotulo}`} className={estilos.anexoLinha}>
            <dt className={estilos.anexoRotulo}>{r.rotulo}</dt>
            <dd className={estilos.anexoValor}>{r.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
```

(a lista nunca é vazia agora — o ramo "Nenhuma resposta foi alterada…" sai; `.anexoVazio` fica sem uso.)

- [ ] **Step 6: Remover a regra CSS que ficou sem uso**

Em `resultado.module.css`, remover o bloco `.anexoVazio { ... }` (linhas 183-186).

- [ ] **Step 7: Verificar manualmente**

`pnpm dev`, abrir um cálculo, `Ctrl/Cmd+P` (ou clicar Imprimir): a seção "Respostas informadas" do anexo agora lista as ~60 perguntas do questionário, cada uma com o valor atual (respondido ou o padrão).

- [ ] **Step 8: Commit**

```bash
git add "src/lib/indulto-comutacao/respostas-anexo.ts" \
        "tests/indulto-comutacao/respostas-anexo.spec.ts" \
        "src/app/(app)/ferramentas/indulto-comutacao/CabecalhoAnexo.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/resultado.module.css"
git commit -m "feat(indulto-comutacao): anexo impresso lista todas as perguntas, mesmo sem resposta"
```

---

## Task 5: Utilitário compartilhado — quais enquadramentos se aplicam

`Resultado.tsx` já junta metadado (`MotorDecreto.incisos`) com veredito (`Resultado.incisos`) para desenhar os cartões, mas essa junção está presa dentro do componente. O botão "Petição" (Task 9) e os geradores de petição (Task 8) precisam da mesma junção, sem desenhar nada — para saber SE há algum dispositivo aplicável, e QUAL é o primeiro. Este utilitário vive em `src/lib/indulto-comutacao/` (não em `motores/2025/`) porque não conhece nenhum artigo específico — só percorre o contrato genérico `MotorDecreto.incisos`.

**Files:**
- Create: `src/lib/indulto-comutacao/enquadramentos.ts`
- Create: `tests/indulto-comutacao/enquadramentos.spec.ts`

**Interfaces:**
- Produces: `EnquadramentoResolvido` (= `MetaInciso & ResultadoInciso`), `enquadramentosDe(motor, resultado, grupo)`, `temAplicavel(motor, resultado, grupo)`, `primeiroAplicavel(motor, resultado, grupo)` — usados pelas Tasks 6, 8 e 9.

- [ ] **Step 1: Escrever o teste**

```ts
// tests/indulto-comutacao/enquadramentos.spec.ts
import { describe, it, expect } from 'vitest'
import { enquadramentosDe, temAplicavel, primeiroAplicavel } from '@/lib/indulto-comutacao/enquadramentos'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso',
  ano: 2025,
  rotulo: 'Decreto de teste',
  versao: '0.0.0',
  dataBase: '2025-01-01',
  questionario: [],
  incisos: {
    indulto: [
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false },
      { id: 'i2', rotulo: 'Inciso 2', descricao: 'Descrição 2', temRegraEspecial: false },
    ],
    comutacao: [{ id: 'c1', rotulo: 'Comutação 1', descricao: 'Descrição C1', temRegraEspecial: false }],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

function resultadoFalso(incisos: Resultado['incisos']): Resultado {
  return { incisos, resumo: {} as Resultado['resumo'], avisos: [] }
}

describe('enquadramentosDe', () => {
  it('junta metadado e veredito na ordem do decreto', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'nao_preenche', especial: 'sem_previsao' },
    ])
    expect(enquadramentosDe(motorFalso, resultado, 'indulto')).toEqual([
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false, geral: 'preenche', especial: 'sem_previsao' },
      { id: 'i2', rotulo: 'Inciso 2', descricao: 'Descrição 2', temRegraEspecial: false, geral: 'nao_preenche', especial: 'sem_previsao' },
    ])
  })

  it('omite dispositivo sem veredito calculado', () => {
    const resultado = resultadoFalso([{ id: 'i1', geral: 'preenche', especial: 'sem_previsao' }])
    expect(enquadramentosDe(motorFalso, resultado, 'indulto')).toEqual([
      { id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false, geral: 'preenche', especial: 'sem_previsao' },
    ])
  })
})

describe('temAplicavel', () => {
  it('verdadeiro quando algum dispositivo do grupo preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'preenche', especial: 'sem_previsao' },
    ])
    expect(temAplicavel(motorFalso, resultado, 'indulto')).toBe(true)
  })

  it('falso quando nenhum dispositivo do grupo preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'a_analisar', especial: 'sem_previsao' },
    ])
    expect(temAplicavel(motorFalso, resultado, 'indulto')).toBe(false)
  })

  it('falso quando o grupo não tem nenhum veredito calculado', () => {
    expect(temAplicavel(motorFalso, resultadoFalso([]), 'comutacao')).toBe(false)
  })
})

describe('primeiroAplicavel', () => {
  it('devolve o primeiro dispositivo, na ordem do decreto, que preenche', () => {
    const resultado = resultadoFalso([
      { id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' },
      { id: 'i2', geral: 'preenche', especial: 'sem_previsao' },
    ])
    expect(primeiroAplicavel(motorFalso, resultado, 'indulto')?.id).toBe('i2')
  })

  it('null quando nenhum preenche', () => {
    const resultado = resultadoFalso([{ id: 'i1', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(primeiroAplicavel(motorFalso, resultado, 'indulto')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- enquadramentos`
Expected: FAIL — o módulo ainda não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/indulto-comutacao/enquadramentos.ts
//
// Junta o metadado de cada dispositivo (`MotorDecreto.incisos`) com o veredito calculado
// (`Resultado.incisos`) — a mesma junção que `Resultado.tsx` já fazia inline para desenhar
// cartão, mas aqui reutilizável por quem só precisa SABER se há dispositivo aplicável, sem
// desenhar nada (ver `BotaoPeticao.tsx` e os geradores em `motores/*/peticoes.ts`).
//
// 🔴 Serve a TODOS os decretos: nada de `art9_I` ou de um decreto específico aqui.

import type { MetaInciso, MotorDecreto, Resultado, ResultadoInciso } from './tipos'

export type GrupoInciso = 'indulto' | 'comutacao'

export type EnquadramentoResolvido = MetaInciso & ResultadoInciso

/** Metadado + veredito de cada dispositivo do grupo, na ordem do decreto. Dispositivo sem
 *  veredito calculado (não deveria acontecer — ver teste de reconciliação do motor) é omitido. */
export function enquadramentosDe(
  motor: MotorDecreto,
  resultado: Resultado,
  grupo: GrupoInciso,
): EnquadramentoResolvido[] {
  const porId = new Map(resultado.incisos.map((i) => [i.id, i]))
  const resolvidos: EnquadramentoResolvido[] = []
  for (const meta of motor.incisos[grupo]) {
    const r = porId.get(meta.id)
    if (r) resolvidos.push({ ...meta, ...r })
  }
  return resolvidos
}

/** Há pelo menos um dispositivo do grupo cuja regra geral o sentenciado preenche? */
export function temAplicavel(motor: MotorDecreto, resultado: Resultado, grupo: GrupoInciso): boolean {
  return enquadramentosDe(motor, resultado, grupo).some((e) => e.geral === 'preenche')
}

/** O primeiro dispositivo do grupo, na ordem do decreto, cuja regra geral o sentenciado
 *  preenche — é nele que a petição se apoia quando o membro escolhe "Indulto" ou "Comutação"
 *  sem indicar um artigo específico. `null` quando nenhum se aplica. */
export function primeiroAplicavel(
  motor: MotorDecreto,
  resultado: Resultado,
  grupo: GrupoInciso,
): EnquadramentoResolvido | null {
  return enquadramentosDe(motor, resultado, grupo).find((e) => e.geral === 'preenche') ?? null
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- enquadramentos`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add "src/lib/indulto-comutacao/enquadramentos.ts" "tests/indulto-comutacao/enquadramentos.spec.ts"
git commit -m "feat(indulto-comutacao): utilitário compartilhado de enquadramentos aplicáveis"
```

---

## Task 6: Anexo em texto puro (para colar ao final da petição)

O anexo impresso (Task 4 + `Resultado.tsx`) é HTML. A petição gerada (Task 8/9) é texto simples num overlay — precisa do mesmo conteúdo (respostas + artigos/enquadramentos), mas como string. Esta função reaproveita `todasAsRespostas` (Task 4) e `enquadramentosDe` (Task 5); não desenha nada, só formata.

**Files:**
- Create: `src/lib/indulto-comutacao/anexo-texto.ts`
- Create: `tests/indulto-comutacao/anexo-texto.spec.ts`

**Interfaces:**
- Consumes: `todasAsRespostas` (Task 4), `enquadramentosDe` (Task 5), `fmtDias` (`tempo.ts`), `VEREDITOS` (`tipos.ts`).
- Produces: `formatarAnexoTexto(motor, entrada, resultado, titulo): string` — usado pelos geradores de petição (Task 8).

- [ ] **Step 1: Escrever o teste**

```ts
// tests/indulto-comutacao/anexo-texto.spec.ts
import { describe, it, expect } from 'vitest'
import { formatarAnexoTexto } from '@/lib/indulto-comutacao/anexo-texto'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso',
  ano: 2025,
  rotulo: 'Decreto de teste',
  versao: '9.9.9',
  dataBase: '2025-01-01',
  questionario: [
    { id: 's', titulo: 'Seção', campos: [{ tipo: 'texto', chave: 'x', rotulo: 'Campo X' }] },
  ],
  incisos: {
    indulto: [{ id: 'i1', rotulo: 'Inciso 1', descricao: 'Descrição 1', temRegraEspecial: false }],
    comutacao: [{ id: 'c1', rotulo: 'Comutação 1', descricao: 'Descrição C1', temRegraEspecial: false }],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

describe('formatarAnexoTexto', () => {
  it('lista respostas e enquadramentos em texto puro', () => {
    const resultado: Resultado = {
      incisos: [
        { id: 'i1', geral: 'preenche', especial: 'sem_previsao' },
        { id: 'c1', geral: 'preenche', especial: 'sem_previsao', quantum: 100, penaApos: 200 },
      ],
      resumo: {} as Resultado['resumo'],
      avisos: [],
    }
    const texto = formatarAnexoTexto(motorFalso, { x: 'valor' }, resultado, 'Meu caso')

    expect(texto).toContain('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
    expect(texto).toContain('Meu caso')
    expect(texto).toContain('- Campo X: valor')
    expect(texto).toContain(
      '- Inciso 1 (Descrição 1) — Regra geral: Preenche os requisitos; Regra especial: Sem previsão no Decreto',
    )
    expect(texto).toContain('quantum: 0 anos 3 meses 10 dias')
  })

  it('usa o título padrão quando não há identificação', () => {
    const resultado: Resultado = { incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }
    const texto = formatarAnexoTexto(motorFalso, {}, resultado, '   ')
    expect(texto).toContain('Cálculo sem identificação')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- anexo-texto`
Expected: FAIL — o módulo ainda não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/indulto-comutacao/anexo-texto.ts
//
// A mesma informação do anexo impresso (CabecalhoAnexo.tsx + Resultado.tsx), em texto puro —
// para colar ao final de uma petição gerada (ver `motores/*/peticoes.ts`). Não desenha nada, só
// formata string. Serve a TODOS os decretos.

import type { Entrada, MotorDecreto, Resultado } from './tipos'
import { VEREDITOS } from './tipos'
import { todasAsRespostas } from './respostas-anexo'
import { enquadramentosDe } from './enquadramentos'
import { fmtDias } from './tempo'

export function formatarAnexoTexto(
  motor: MotorDecreto,
  entrada: Entrada,
  resultado: Resultado,
  titulo: string,
): string {
  const linhas: string[] = []

  linhas.push('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
  linhas.push(titulo.trim() || 'Cálculo sem identificação')
  linhas.push(`Calculado com ${motor.rotulo} — motor versão ${motor.versao}.`)
  linhas.push('')

  linhas.push('RESPOSTAS INFORMADAS')
  for (const r of todasAsRespostas(motor, entrada)) {
    linhas.push(`- ${r.rotulo}: ${r.valor}`)
  }
  linhas.push('')

  linhas.push('INDULTO')
  for (const e of enquadramentosDe(motor, resultado, 'indulto')) {
    linhas.push(
      `- ${e.rotulo} (${e.descricao}) — Regra geral: ${VEREDITOS[e.geral]}; Regra especial: ${VEREDITOS[e.especial]}`,
    )
  }
  linhas.push('')

  linhas.push('COMUTAÇÃO')
  for (const e of enquadramentosDe(motor, resultado, 'comutacao')) {
    const quantum =
      e.geral === 'preenche'
        ? ` (quantum: ${fmtDias(e.quantum ?? null)}; pena após: ${fmtDias(e.penaApos ?? null)})`
        : ''
    linhas.push(`- ${e.rotulo} (${e.descricao}) — Situação: ${VEREDITOS[e.geral]}${quantum}`)
  }

  return linhas.join('\n')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- anexo-texto`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add "src/lib/indulto-comutacao/anexo-texto.ts" "tests/indulto-comutacao/anexo-texto.spec.ts"
git commit -m "feat(indulto-comutacao): formatador de anexo em texto puro para a petição"
```

---

## Task 7: `MotorDecreto` ganha o contrato opcional de petição

Antes de escrever os modelos de 2025 (Task 8), o contrato genérico (`tipos.ts`) precisa saber que um motor PODE expor geradores de petição. Isso segue exatamente o mesmo padrão de `calcular`: o campo é uma função, e só existe porque `MotorDecreto` já vive inteiro no cliente (nunca atravessa a fronteira servidor→cliente como prop — só o `decretoId`, string, atravessa).

**Files:**
- Modify: `src/lib/indulto-comutacao/tipos.ts:111-122`

**Interfaces:**
- Produces: `DadosPeticao`, `MotorDecreto.peticoes?: { indulto, comutacao }` — usados pela Task 8 (implementação 2025) e Task 9 (`BotaoPeticao`).

- [ ] **Step 1: Adicionar o tipo e o campo**

Em `tipos.ts`, logo antes de `export type MotorDecreto = {`:

```ts
/** O que um gerador de petição de decreto recebe: a entrada, o resultado calculado e o título
 *  do cálculo. O `motor` não entra aqui — cada gerador já é método DO motor a que pertence — e
 *  o anexo de premissas é montado por dentro do próprio gerador, via `formatarAnexoTexto`. */
export type DadosPeticao = {
  entrada: Entrada
  resultado: Resultado
  titulo: string
}
```

E dentro de `MotorDecreto`, depois de `calcular(entrada: Entrada): Resultado`:

```ts
  calcular(entrada: Entrada): Resultado

  /** Ausente num decreto que ainda não tem modelo de petição — o botão "Petição"
   *  (`BotaoPeticao.tsx`) só aparece quando isto existe E há pelo menos um dispositivo
   *  aplicável (ver `enquadramentos.ts`). Cada função devolve o texto pronto, anexo incluído. */
  peticoes?: {
    indulto: (dados: DadosPeticao) => string
    comutacao: (dados: DadosPeticao) => string
  }
```

- [ ] **Step 2: Verificar que o projeto ainda compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem novos erros — `peticoes` é opcional, então `motor2025` (que ainda não o declara, até a Task 8) continua válido.

- [ ] **Step 3: Commit**

```bash
git add "src/lib/indulto-comutacao/tipos.ts"
git commit -m "feat(indulto-comutacao): contrato opcional MotorDecreto.peticoes"
```

---

## Task 8: Modelos de petição do Decreto 12.970/2025

Texto jurídico confirmado pelo usuário nesta conversa: o modelo de indulto foi enviado pronto; o de comutação foi revisado nesta sessão para refletir a regra real do decreto (2/3 para crime impeditivo; 1/5 se primário ou 1/4 se reincidente para crime permissivo — a mesma lógica do Art. 13/§4º já implementada em `motor.ts`). Mudar a REDAÇÃO aqui é decisão jurídica do usuário; a interpolação de dados é o que este task testa.

**Files:**
- Create: `src/lib/indulto-comutacao/motores/2025/peticoes.ts`
- Create: `tests/indulto-comutacao/peticao-2025.spec.ts`
- Modify: `src/lib/indulto-comutacao/motores/2025/index.ts`

**Interfaces:**
- Consumes: `primeiroAplicavel` (Task 5), `formatarAnexoTexto` (Task 6), `DadosPeticao`/`MotorDecreto.peticoes` (Task 7), `dias`/`fmtDias` (`tempo.ts`).
- Produces: `gerarPeticaoIndulto2025(motor, dados): string`, `gerarPeticaoComutacao2025(motor, dados): string` — usados por `motor2025.peticoes` e, por ele, pela Task 9.

- [ ] **Step 1: Escrever o teste**

```ts
// tests/indulto-comutacao/peticao-2025.spec.ts
import { describe, it, expect } from 'vitest'
import { gerarPeticaoIndulto2025, gerarPeticaoComutacao2025 } from '@/lib/indulto-comutacao/motores/2025/peticoes'
import type { MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

const motorFalso: MotorDecreto = {
  id: 'falso-2025',
  ano: 2025,
  rotulo: 'Decreto 12.970/2025 — indulto natalino',
  versao: '1.0.0',
  dataBase: '2025-12-25',
  questionario: [
    {
      id: 'identificacao',
      titulo: 'Identificação',
      campos: [
        { tipo: 'texto', chave: 'sentenciado', rotulo: 'Sentenciado' },
        { tipo: 'texto', chave: 'execucao', rotulo: 'Execução nº' },
      ],
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
    comutacao: [
      {
        id: 'art13',
        rotulo: 'Art. 13',
        descricao: 'Comutação de 1/5 da remanescente (1/5 cumprido / 1/4 se reinc.).',
        temRegraEspecial: false,
      },
    ],
  },
  avisos: { fixos: [], validarJuridicamente: [] },
  calcular: () => ({ incisos: [], resumo: {} as Resultado['resumo'], avisos: [] }),
}

function resultado(overrides: Partial<Resultado['resumo']> = {}, incisos: Resultado['incisos'] = []): Resultado {
  return {
    incisos,
    resumo: {
      totalImposto: 2880,
      totalCumprido: 1440,
      penaCumpridaImpeditivos: 0,
      remanescente: 1440,
      fracoes: { doisTercosImpeditivos: 0, umQuinto: 288, umQuarto: 360, umTerco: 480, metade: 720 },
      ...overrides,
    },
    avisos: [],
  }
}

describe('gerarPeticaoIndulto2025', () => {
  it('devolve string vazia quando nenhum dispositivo de indulto preenche', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })).toBe('')
  })

  it('preenche nome, execução, decreto, artigo e datas quando há dispositivo aplicável', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, {
      entrada: { sentenciado: 'Fulano de Tal', execucao: '0001234-56' },
      resultado: r,
      titulo: 'Caso Fulano',
    })
    expect(texto).toContain('Fulano de Tal, já qualificado')
    expect(texto).toContain('Execução Penal nº 0001234-56')
    expect(texto).toContain('Decreto nº 12.970/2025')
    expect(texto).toContain('Art. 9º, I')
    expect(texto).toContain('RECONHECIMENTO DO DIREITO AO INDULTO')
    expect(texto).toContain('25/12/2025')
    expect(texto).toContain('4 anos 0 meses 0 dias')
    expect(texto).toContain('ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO')
  })

  it('usa placeholder quando sentenciado/execução não foram informados', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: '' })
    expect(texto).toContain('[NOME DO SENTENCIADO], já qualificado')
    expect(texto).toContain('Execução Penal nº [NÚMERO DA EXECUÇÃO]')
  })

  it('descreve ausência de crime impeditivo quando a pena impeditiva é zero', () => {
    const r = resultado({}, [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoIndulto2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })
    expect(texto).toContain('3. DA AUSÊNCIA DE CRIME IMPEDITIVO')
  })

  it('detalha o crime impeditivo e a fração de 2/3 quando há pena impeditiva', () => {
    const r = resultado(
      { fracoes: { doisTercosImpeditivos: 240, umQuinto: 288, umQuarto: 360, umTerco: 480, metade: 720 }, penaCumpridaImpeditivos: 240 },
      [{ id: 'art9_I', geral: 'preenche', especial: 'sem_previsao' }],
    )
    const texto = gerarPeticaoIndulto2025(motorFalso, {
      entrada: { penaImpeditiva: { anos: 1, meses: 0, dias: 0 } },
      resultado: r,
      titulo: 'X',
    })
    expect(texto).toContain('3. DA EXISTÊNCIA DE CRIME IMPEDITIVO')
    expect(texto).toContain('2/3 da pena: 0 anos 8 meses 0 dias')
  })
})

describe('gerarPeticaoComutacao2025', () => {
  it('devolve string vazia quando nenhum dispositivo de comutação preenche', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'nao_preenche', especial: 'sem_previsao' }])
    expect(gerarPeticaoComutacao2025(motorFalso, { entrada: {}, resultado: r, titulo: 'X' })).toBe('')
  })

  it('descreve a fração de 1/5 (primário) ou 1/4 (reincidente) conforme `entrada.reincidente`', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'preenche', especial: 'sem_previsao' }])

    const primario = gerarPeticaoComutacao2025(motorFalso, { entrada: { reincidente: 'NÃO' }, resultado: r, titulo: 'X' })
    expect(primario).toContain('o sentenciado é primário')
    expect(primario).toContain('fração temporal aplicável corresponde a 1/5')

    const reincidente = gerarPeticaoComutacao2025(motorFalso, { entrada: { reincidente: 'SIM' }, resultado: r, titulo: 'X' })
    expect(reincidente).toContain('o sentenciado é reincidente')
    expect(reincidente).toContain('fração temporal aplicável corresponde a 1/4')
  })

  it('usa a fração de 2/3 quando há crime impeditivo', () => {
    const r = resultado({}, [{ id: 'art13', geral: 'preenche', especial: 'sem_previsao' }])
    const texto = gerarPeticaoComutacao2025(motorFalso, {
      entrada: { penaImpeditiva: { anos: 1, meses: 0, dias: 0 } },
      resultado: r,
      titulo: 'X',
    })
    expect(texto).toContain('crime impeditivo')
    expect(texto).toContain('fração temporal aplicável corresponde a 2/3')
    expect(texto).toContain('RECONHECIMENTO DO DIREITO À COMUTAÇÃO')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- peticao-2025`
Expected: FAIL — o módulo ainda não existe.

- [ ] **Step 3: Implementar `peticoes.ts`**

```ts
// src/lib/indulto-comutacao/motores/2025/peticoes.ts
//
// Modelos de petição do Decreto 12.970/2025 — TEXTO JURÍDICO confirmado pelo usuário em
// 14/09/2026 (indulto: modelo enviado pronto; comutação: Seção 3 revisada nesta sessão para a
// regra real do decreto — 2/3 para crime impeditivo; 1/5 se primário ou 1/4 se reincidente para
// crime permissivo, a mesma lógica de `c13`/`c13_4` em `motor.ts`). Mudar a REDAÇÃO aqui é
// decisão jurídica do usuário, não refatoração de código.
//
// 🔴 ESTE ARQUIVO É DESTE DECRETO — mesmo aviso de `questionario.ts`/`incisos.ts`/`motor.ts`.
// Campo sem fonte de dado no questionário (vara, comarca, nome do advogado, OAB, cidade)
// permanece como texto para o advogado preencher à mão — não é bug, é limite real do que o
// cálculo sabe.

import type { DadosPeticao, MotorDecreto } from '../../tipos'
import type { Tempo } from '../../tempo'
import { dias, fmtDias } from '../../tempo'
import { primeiroAplicavel } from '../../enquadramentos'
import { formatarAnexoTexto } from '../../anexo-texto'

const NUMERO_DECRETO = '12.970/2025'

function hoje(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function dataBaseFormatada(motor: MotorDecreto): string {
  const [ano, mes, dia] = motor.dataBase.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Percentual com uma casa decimal; `0` quando o denominador é zero (evita `Infinity`/`NaN`). */
function pct(numerador: number, denominador: number): string {
  if (denominador <= 0) return '0'
  return (Math.round((numerador / denominador) * 1000) / 10).toString()
}

function anexarAnexo(corpo: string, motor: MotorDecreto, dados: DadosPeticao): string {
  return `${corpo}\n\n---\n\n${formatarAnexoTexto(motor, dados.entrada, dados.resultado, dados.titulo)}`
}

export function gerarPeticaoIndulto2025(motor: MotorDecreto, dados: DadosPeticao): string {
  const { entrada, resultado } = dados
  const enquadramento = primeiroAplicavel(motor, resultado, 'indulto')
  if (!enquadramento) return ''

  const sentenciado = String(entrada.sentenciado ?? '').trim() || '[NOME DO SENTENCIADO]'
  const execucao = String(entrada.execucao ?? '').trim() || '[NÚMERO DA EXECUÇÃO]'
  const penaImpeditivaDias = dias(entrada.penaImpeditiva as Tempo | null | undefined)
  const penaCumpridaImpeditivos = resultado.resumo.penaCumpridaImpeditivos
  const doisTercos = resultado.resumo.fracoes.doisTercosImpeditivos

  const secao3 =
    penaImpeditivaDias > 0
      ? `3. DA EXISTÊNCIA DE CRIME IMPEDITIVO E DO CUMPRIMENTO DO REQUISITO DE 2/3

O sentenciado possui condenação por crime impeditivo à concessão do indulto, nos termos do Decreto nº ${NUMERO_DECRETO}.

Todavia, a existência de crime impeditivo não afasta, por si só, a possibilidade de concessão do indulto em relação às demais penas, devendo ser observada a regra específica estabelecida no Decreto.

No caso concreto, a pena referente ao crime impeditivo corresponde a ${fmtDias(penaImpeditivaDias)}, tendo o sentenciado cumprido, até a data de referência do Decreto, ${fmtDias(penaCumpridaImpeditivos)}, correspondente a ${pct(penaCumpridaImpeditivos, penaImpeditivaDias)}% da respectiva pena.

Considerando que o Decreto exige o cumprimento de 2/3 (dois terços) da pena relativa ao crime impeditivo, verifica-se que o requisito encontra-se preenchido, conforme demonstrado:

- Pena do crime impeditivo: ${fmtDias(penaImpeditivaDias)};
- 2/3 da pena: ${fmtDias(doisTercos)};
- Tempo efetivamente cumprido: ${fmtDias(penaCumpridaImpeditivos)};
- Requisito de 2/3: preenchido.

Desse modo, embora exista condenação por crime impeditivo, o requisito específico previsto no Decreto foi satisfeito, não havendo óbice à análise e ao reconhecimento do indulto em relação às demais penas que preencham os requisitos do ato presidencial.`
      : `3. DA AUSÊNCIA DE CRIME IMPEDITIVO

O sentenciado não possui condenação por crime impeditivo à concessão do indulto, não havendo, portanto, óbice algum sob esse aspecto.`

  const semFaltaGrave = entrada.faltaGraveAno === 'NÃO' && entrada.faltaGraveExecucao === 'NÃO'
  const secao4 = `4. DA AUSÊNCIA DE FALTA GRAVE IMPEDITIVA

Quanto ao requisito relacionado à conduta carcerária, verifica-se que ${
    semFaltaGrave
      ? 'não consta falta grave no período previsto pelo Decreto'
      : 'a falta grave registrada não se encontra dentro do período impeditivo estabelecido pelo Decreto'
  }.

Assim, também sob esse aspecto, não há impedimento ao reconhecimento do direito ao indulto.`

  const corpo = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ___ VARA DE EXECUÇÕES PENAIS DA COMARCA DE __________

Execução Penal nº ${execucao}

${sentenciado}, já qualificado nos autos da execução penal em epígrafe, por intermédio de seu advogado, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no Decreto nº ${NUMERO_DECRETO}, requerer o

RECONHECIMENTO DO DIREITO AO INDULTO

pelos fundamentos a seguir expostos.

1. DO DECRETO APLICÁVEL

O sentenciado encontra-se em execução de pena abrangida pelo Decreto nº ${NUMERO_DECRETO}, que estabelece as hipóteses e os requisitos para a concessão do indulto.

No caso concreto, mostra-se aplicável o disposto no ${enquadramento.rotulo} do referido Decreto (${enquadramento.descricao}), que prevê a concessão do indulto ao condenado que preencher os requisitos nele estabelecidos.

2. DO PREENCHIMENTO DO REQUISITO OBJETIVO

Na data de referência estabelecida pelo Decreto, ${dataBaseFormatada(motor)}, o sentenciado havia cumprido ${fmtDias(resultado.resumo.totalCumprido)} de pena.

A pena considerada para fins de análise corresponde a ${fmtDias(resultado.resumo.totalImposto)}, sendo que o Decreto exige o cumprimento de ${enquadramento.descricao}

Conforme cálculo de liquidação da pena, considerando-se o tempo de prisão efetivamente cumprido, a detração e os dias de remição regularmente reconhecidos, o requisito temporal encontra-se preenchido.

Assim, o requisito objetivo previsto no Decreto está devidamente satisfeito.

${secao3}

${secao4}

5. DO PREENCHIMENTO DOS DEMAIS REQUISITOS

Analisados os demais requisitos estabelecidos pelo Decreto nº ${NUMERO_DECRETO}, verifica-se que o sentenciado também atende às condições previstas para a concessão do indulto.

Em síntese:

- Data de referência: ${dataBaseFormatada(motor)};
- Pena total: ${fmtDias(resultado.resumo.totalImposto)};
- Pena cumprida até a data de referência: ${fmtDias(resultado.resumo.totalCumprido)};
- Requisito temporal exigido: ${enquadramento.descricao}

Portanto, estando presentes os requisitos estabelecidos no Decreto, o sentenciado faz jus ao reconhecimento do direito ao indulto.

6. DOS PEDIDOS

Diante do exposto, requer:

a) o reconhecimento de que o sentenciado preenche os requisitos previstos no Decreto nº ${NUMERO_DECRETO}, ${enquadramento.rotulo};

b) o reconhecimento do direito ao indulto, com a consequente declaração de extinção da pena alcançada pelo ato presidencial, nos termos da legislação aplicável;

c) seja determinada a atualização do cálculo de liquidação da pena no SEEU, com o correto lançamento do indulto e dos respectivos efeitos;

Termos em que,
Pede deferimento.

[Cidade], ${hoje()}.

[NOME DO ADVOGADO]
OAB/[UF] nº [_____]`

  return anexarAnexo(corpo, motor, dados)
}

export function gerarPeticaoComutacao2025(motor: MotorDecreto, dados: DadosPeticao): string {
  const { entrada, resultado } = dados
  const enquadramento = primeiroAplicavel(motor, resultado, 'comutacao')
  if (!enquadramento) return ''

  const sentenciado = String(entrada.sentenciado ?? '').trim() || '[NOME DO SENTENCIADO]'
  const execucao = String(entrada.execucao ?? '').trim() || '[NÚMERO DA EXECUÇÃO]'
  const reincidente = entrada.reincidente === 'SIM'
  const penaImpeditivaDias = dias(entrada.penaImpeditiva as Tempo | null | undefined)
  const ehImpeditivo = penaImpeditivaDias > 0

  const penaConsiderada = ehImpeditivo ? resultado.resumo.penaCumpridaImpeditivos : resultado.resumo.totalCumprido
  const fracaoExigidaDias = ehImpeditivo
    ? resultado.resumo.fracoes.doisTercosImpeditivos
    : reincidente
      ? resultado.resumo.fracoes.umQuarto
      : resultado.resumo.fracoes.umQuinto
  const fracaoExigidaRotulo = ehImpeditivo ? '2/3' : reincidente ? '1/4' : '1/5'
  const basePena = ehImpeditivo ? penaImpeditivaDias : resultado.resumo.totalImposto - penaImpeditivaDias

  const secao3 = `3. DO PREENCHIMENTO DO REQUISITO TEMPORAL, CONFORME A NATUREZA DO CRIME E A REINCIDÊNCIA

O Decreto nº ${NUMERO_DECRETO} estabelece frações distintas para a comutação de pena, a depender da natureza do crime e da condição de reincidência do sentenciado:

- crimes impeditivos (hediondos ou equiparados): exige-se o cumprimento de 2/3 (dois terços) da pena;
- crimes não impeditivos (permissivos): exige-se o cumprimento de 1/5 (um quinto) da pena, se o sentenciado for primário, ou de 1/4 (um quarto) da pena, se reincidente.

No caso concreto, o sentenciado é ${reincidente ? 'reincidente' : 'primário'}, e sua condenação enquadra-se como ${ehImpeditivo ? 'crime impeditivo' : 'crime permissivo'}, de modo que a fração temporal aplicável corresponde a ${fracaoExigidaRotulo} da pena.

A pena considerada para essa fração corresponde a ${fmtDias(basePena)}, tendo o sentenciado cumprido, até a data de referência do Decreto, ${fmtDias(penaConsiderada)}, correspondente a ${pct(penaConsiderada, basePena)}% da respectiva pena.

Considerando a fração exigida, verifica-se que o requisito temporal encontra-se preenchido, conforme demonstrado:

- Pena considerada: ${fmtDias(basePena)};
- Fração exigida (${fracaoExigidaRotulo}): ${fmtDias(fracaoExigidaDias)};
- Tempo efetivamente cumprido: ${fmtDias(penaConsiderada)};
- Requisito temporal: preenchido.

Assim, estando cumprida a fração exigida para essa categoria de pena, deve ser reconhecido o direito à comutação, desde que igualmente preenchidos os demais requisitos objetivos e subjetivos previstos no Decreto.`

  const semFaltaGrave = entrada.faltaGraveAno === 'NÃO' && entrada.faltaGraveExecucao === 'NÃO'
  const secao4 = `4. DA AUSÊNCIA DE FALTA GRAVE IMPEDITIVA

Quanto ao requisito relacionado à conduta carcerária, verifica-se que ${
    semFaltaGrave
      ? 'não consta falta grave no período previsto pelo Decreto'
      : 'a falta grave registrada não se encontra dentro do período impeditivo estabelecido pelo Decreto'
  }.

Assim, também sob esse aspecto, não há impedimento ao reconhecimento do direito à comutação.`

  const corpo = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ___ VARA DE EXECUÇÕES PENAIS DA COMARCA DE __________

Execução Penal nº ${execucao}

${sentenciado}, já qualificado nos autos da execução penal em epígrafe, por intermédio de seu advogado, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no Decreto nº ${NUMERO_DECRETO}, requerer o

RECONHECIMENTO DO DIREITO À COMUTAÇÃO

pelos fundamentos a seguir expostos.

1. DO DECRETO APLICÁVEL

O sentenciado encontra-se em execução de pena abrangida pelo Decreto nº ${NUMERO_DECRETO}, que estabelece as hipóteses e os requisitos para a concessão da comutação.

No caso concreto, mostra-se aplicável o disposto no ${enquadramento.rotulo} do referido Decreto (${enquadramento.descricao}), que prevê a concessão da comutação ao condenado que preencher os requisitos nele estabelecidos.

2. DO PREENCHIMENTO DO REQUISITO OBJETIVO

Na data de referência estabelecida pelo Decreto, ${dataBaseFormatada(motor)}, o sentenciado havia cumprido ${fmtDias(resultado.resumo.totalCumprido)} de pena.

A pena considerada para fins de análise corresponde a ${fmtDias(resultado.resumo.totalImposto)}, sendo que o Decreto exige o cumprimento de ${enquadramento.descricao}

Conforme cálculo de liquidação da pena, considerando-se o tempo de prisão efetivamente cumprido, a detração e os dias de remição regularmente reconhecidos, o requisito temporal encontra-se preenchido.

Assim, o requisito objetivo previsto no Decreto está devidamente satisfeito.

${secao3}

${secao4}

5. DO PREENCHIMENTO DOS DEMAIS REQUISITOS

Analisados os demais requisitos estabelecidos pelo Decreto nº ${NUMERO_DECRETO}, verifica-se que o sentenciado também atende às condições previstas para a concessão da comutação.

Em síntese:

- Data de referência: ${dataBaseFormatada(motor)};
- Pena total: ${fmtDias(resultado.resumo.totalImposto)};
- Pena cumprida até a data de referência: ${fmtDias(resultado.resumo.totalCumprido)};
- Requisito temporal exigido: ${enquadramento.descricao}

Portanto, estando presentes os requisitos estabelecidos no Decreto, o sentenciado faz jus ao reconhecimento do direito à comutação.

6. DOS PEDIDOS

Diante do exposto, requer:

a) o reconhecimento de que o sentenciado preenche os requisitos previstos no Decreto nº ${NUMERO_DECRETO}, ${enquadramento.rotulo}, para a comutação;

b) o reconhecimento do direito à comutação, com a consequente redução da pena alcançada pelo ato presidencial, nos termos da legislação aplicável;

c) seja determinada a atualização do cálculo de liquidação da pena no SEEU, com o correto lançamento da comutação e dos respectivos efeitos;

Termos em que,
Pede deferimento.

[Cidade], ${hoje()}.

[NOME DO ADVOGADO]
OAB/[UF] nº [_____]`

  return anexarAnexo(corpo, motor, dados)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- peticao-2025`
Expected: PASS (8 testes)

- [ ] **Step 5: Ligar os geradores ao `motor2025`**

```ts
// src/lib/indulto-comutacao/motores/2025/index.ts
import type { MotorDecreto } from '../../tipos'
import { QUESTIONARIO_2025 } from './questionario'
import { INCISOS_INDULTO_2025, INCISOS_COMUTACAO_2025, AVISOS_2025 } from './incisos'
import { calcular2025 } from './motor'
import { gerarPeticaoIndulto2025, gerarPeticaoComutacao2025 } from './peticoes'

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
  versao: '1.0.0',
  dataBase: '2025-12-25',
  questionario: QUESTIONARIO_2025,
  incisos: { indulto: INCISOS_INDULTO_2025, comutacao: INCISOS_COMUTACAO_2025 },
  avisos: AVISOS_2025,
  calcular: calcular2025,
  peticoes: {
    indulto: (dados) => gerarPeticaoIndulto2025(motor2025, dados),
    comutacao: (dados) => gerarPeticaoComutacao2025(motor2025, dados),
  },
}
```

(o self-reference a `motor2025` dentro do próprio objeto funciona porque as arrow functions só leem o binding quando são CHAMADAS, bem depois de `motor2025` estar completamente atribuído — mesmo padrão seguro de closures em JS.)

- [ ] **Step 6: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS — nenhuma regressão nos specs de `motor-2025`/`paridade-*`/`reconciliacao-2025` (nada neles muda; `peticoes` é aditivo).

- [ ] **Step 7: Commit**

```bash
git add "src/lib/indulto-comutacao/motores/2025/peticoes.ts" \
        "tests/indulto-comutacao/peticao-2025.spec.ts" \
        "src/lib/indulto-comutacao/motores/2025/index.ts"
git commit -m "feat(indulto-comutacao): modelos de petição de indulto e comutação do Decreto 12.970/2025"
```

---

## Task 9: Botão "Petição" e overlay com o texto pronto

Último passo: o botão que só aparece quando há indulto ou comutação aplicável (Task 5), oferece escolha quando os dois se aplicam, e mostra o texto gerado (Task 8) num overlay com botão de copiar. Reaproveita o `Drawer` já existente no kit de UI — sem CSS de modal do zero.

**Files:**
- Create: `src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.tsx`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.module.css`
- Create: `src/app/(app)/ferramentas/indulto-comutacao/BotaoPeticao.tsx`
- Modify: `src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx`

**Interfaces:**
- Consumes: `Drawer` (`@/components/ui/Drawer`), `temAplicavel` (Task 5), `MotorDecreto.peticoes`/`DadosPeticao` (Tasks 7-8), `BarraSalvar.acoesExtras` (Task 3).
- Produces: `<BotaoPeticao motor entrada resultado titulo />` — usado em `Calculadora.tsx`.

Sem teste automatizado (componentes React interativos; o projeto não tem jsdom/testing-library — ver Global Constraints). Verificação manual detalhada no Step 5.

- [ ] **Step 1: CSS do overlay**

```css
/* src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.module.css */

.escolha {
  display: grid;
  gap: var(--s-3);
}

.corpo {
  display: grid;
  gap: var(--s-4);
}

.texto {
  margin: 0;
  padding: var(--s-4);
  background: var(--fundo);
  border: 1px solid var(--linha);
  border-radius: var(--r-controle);
  font-family: inherit;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--tinta);
  white-space: pre-wrap;
  max-height: 60vh;
  overflow-y: auto;
}

.acoes {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
}
```

- [ ] **Step 2: `PeticaoOverlay.tsx`**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.tsx
'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Botao from '@/components/ui/Botao'
import estilos from './PeticaoOverlay.module.css'

type Tipo = 'indulto' | 'comutacao'

export default function PeticaoOverlay({
  aberto,
  aoFechar,
  temIndulto,
  temComutacao,
  gerarTexto,
}: {
  aberto: boolean
  aoFechar: () => void
  temIndulto: boolean
  temComutacao: boolean
  gerarTexto: (tipo: Tipo) => string
}) {
  const [tipo, setTipo] = useState<Tipo | null>(null)
  const [copiado, setCopiado] = useState(false)

  // Só uma opção aplicável: pula a tela de escolha e vai direto para o texto.
  const soUmaOpcao = temIndulto !== temComutacao
  const tipoEfetivo = tipo ?? (soUmaOpcao ? (temIndulto ? 'indulto' : 'comutacao') : null)
  const textoGerado = tipoEfetivo ? gerarTexto(tipoEfetivo) : ''

  function fechar() {
    setTipo(null)
    setCopiado(false)
    aoFechar()
  }

  async function copiar() {
    await navigator.clipboard.writeText(textoGerado)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  return (
    <Drawer aberto={aberto} titulo="Petição" onFechar={fechar}>
      {!tipoEfetivo ? (
        <div className={estilos.escolha}>
          <p>Qual petição deseja gerar?</p>
          {temIndulto && (
            <Botao variante="secundario" onClick={() => setTipo('indulto')}>
              Petição de indulto
            </Botao>
          )}
          {temComutacao && (
            <Botao variante="secundario" onClick={() => setTipo('comutacao')}>
              Petição de comutação
            </Botao>
          )}
        </div>
      ) : (
        <div className={estilos.corpo}>
          <pre className={estilos.texto}>{textoGerado}</pre>
          <div className={estilos.acoes}>
            <Botao variante="primario" onClick={copiar}>
              <Copy size={16} strokeWidth={2} aria-hidden="true" />
              {copiado ? 'Copiado!' : 'Copiar'}
            </Botao>
            {!soUmaOpcao && (
              <Botao variante="fantasma" onClick={() => setTipo(null)}>
                Voltar
              </Botao>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
```

- [ ] **Step 3: `BotaoPeticao.tsx`**

```tsx
// src/app/(app)/ferramentas/indulto-comutacao/BotaoPeticao.tsx
'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import Botao from '@/components/ui/Botao'
import PeticaoOverlay from './PeticaoOverlay'
import { temAplicavel } from '@/lib/indulto-comutacao/enquadramentos'
import type { Entrada, MotorDecreto, Resultado } from '@/lib/indulto-comutacao/tipos'

/**
 * Só aparece quando o motor tem modelo de petição (`motor.peticoes`) E há pelo menos um
 * dispositivo aplicável — nem todo decreto vai ter petição pronta, e mesmo o que tem não deve
 * oferecer o botão para um caso que não preenche requisito nenhum.
 */
export default function BotaoPeticao({
  motor,
  entrada,
  resultado,
  titulo,
}: {
  motor: MotorDecreto
  entrada: Entrada
  resultado: Resultado
  titulo: string
}) {
  const [aberto, setAberto] = useState(false)

  if (!motor.peticoes) return null
  const temIndulto = temAplicavel(motor, resultado, 'indulto')
  const temComutacao = temAplicavel(motor, resultado, 'comutacao')
  if (!temIndulto && !temComutacao) return null

  const peticoes = motor.peticoes

  return (
    <>
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)}>
        <FileText size={16} strokeWidth={2} aria-hidden="true" />
        Petição
      </Botao>
      <PeticaoOverlay
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        temIndulto={temIndulto}
        temComutacao={temComutacao}
        gerarTexto={(tipo) => peticoes[tipo]({ entrada, resultado, titulo })}
      />
    </>
  )
}
```

- [ ] **Step 4: Ligar `BotaoPeticao` em `Calculadora.tsx`**

```tsx
import BotaoPeticao from './BotaoPeticao'
```

E no JSX (mesmo trecho da Task 3), acrescentar o botão nas duas linhas de ação:

```tsx
        {somenteLeitura ? (
          <>
            <div className={estilos.avisoVersao} role="status">
              <b>Acesso encerrado.</b> Você pode consultar e excluir os seus cálculos, mas criar e
              editar exige renovar o acesso.
            </div>
            <div className={estilos.barraImprimir}>
              <BotaoImprimir />
              <BotaoPeticao motor={motor} entrada={entrada} resultado={resultado} titulo={titulo} />
            </div>
          </>
        ) : (
          <BarraSalvar
            motor={motor}
            entrada={entrada}
            calculoId={calculoId}
            titulo={titulo}
            aoMudarTitulo={setTitulo}
            acoesExtras={
              <>
                <BotaoImprimir />
                <BotaoPeticao motor={motor} entrada={entrada} resultado={resultado} titulo={titulo} />
              </>
            }
          />
        )}
```

(`BotaoPeticao` decide sozinho se aparece — não precisa de condicional aqui em cima.)

- [ ] **Step 5: Verificar manualmente**

`pnpm dev`, abrir um cálculo novo e preencher o questionário até pelo menos um dos cartões "Indulto" ou "Comutação" mostrar "Preenche os requisitos" (ex.: preencher "Valor da pena de multa" com um número > 0 e nenhuma restrição de facção/RDD/colaboração/presídio federal/falta grave já basta para o Art. 12 preencher):

- o botão "Petição" só aparece quando isso acontece — antes disso, some;
- se só indulto OU só comutação forem aplicáveis, clicar em "Petição" abre o texto direto;
- se os dois forem aplicáveis, clicar em "Petição" mostra a escolha entre "Petição de indulto" e "Petição de comutação" antes do texto;
- o texto mostra o nome do sentenciado, o número de execução, "Decreto nº 12.970/2025", o artigo aplicável e os números do cálculo (datas, tempos);
- ao final do texto aparece o anexo (`ANEXO — CÁLCULO DE INDULTO E COMUTAÇÃO`) com as respostas e os enquadramentos;
- clicar "Copiar" copia o texto (colar em outro lugar para confirmar) e mostra "Copiado!" por alguns segundos;
- "Voltar" (quando aparece) retorna à tela de escolha; fechar o Drawer e reabrir volta ao estado inicial.

- [ ] **Step 6: Rodar a suíte inteira uma última vez**

Run: `pnpm test`
Expected: PASS — todos os specs, incluindo os das Tasks 2, 4, 5, 6 e 8.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/PeticaoOverlay.module.css" \
        "src/app/(app)/ferramentas/indulto-comutacao/BotaoPeticao.tsx" \
        "src/app/(app)/ferramentas/indulto-comutacao/Calculadora.tsx"
git commit -m "feat(indulto-comutacao): botão Petição com overlay e texto pronto para copiar"
```
