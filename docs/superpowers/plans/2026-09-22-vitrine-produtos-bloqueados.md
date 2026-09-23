# Vitrine de produtos bloqueados — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo produto interno passa a aparecer sempre — na vitrine `/ferramentas` e no menu lateral —, com cadeado e convite de compra para quem não tem acesso, e a página do produto abre em leitura em vez de redirecionar.

**Architecture:** A regra vive em funções puras em `src/lib/vendas/aviso-acesso.ts` (`cartaoDaVitrine` e o novo caso `nuncaTeve`), testadas sem renderizar tela; as telas só desenham o que elas decidem. Nenhuma migration e nenhum gate de segurança muda: `/novo`, `/[id]` e `exigirEscrita` já recusam quem não está ativo, e é isso que torna seguro mexer só na camada de desenho.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Vitest, CSS Modules, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-22-vitrine-produtos-bloqueados-design.md`

**Branch:** `vitrine-produtos-bloqueados` (já criada; a spec está commitada nela em `0de838e`).

## Global Constraints

- **`pnpm`, nunca `npm`.** Misturar os dois gera um lockfile que o build não entende (AGENTS.md, regra 2).
- **`pnpm build` e `pnpm run test` verdes antes de qualquer commit de código.**
- **Nenhuma migration neste trabalho.** Tudo é leitura do que já existe. Se algum passo parecer precisar de tabela nova, o plano está errado — pare e avise.
- **CSS só com token.** Nada de cor em hexadecimal e nada de `opacity` para texto secundário: use `--tinta-2`/`--tinta-3`, `--superficie-hover`, `--acento`, `--erro`/`--erro-wash` (nota no topo de `globals.css`).
- **Código e comentários em português**, como o resto do repositório.
- **Rótulos exatos dos botões**, copiados da spec e não reinventados: `Assinar agora` e `Renovar acesso`.
- **A regra de qual rótulo aparece:** `Assinar agora` para quem nunca teve acesso **e** para quem teve só degustação; `Renovar acesso` para quem teve acesso comprado e o perdeu.

---

### Task 1: A regra pura — `cartaoDaVitrine` e o caso `nuncaTeve`

**Files:**
- Modify: `src/lib/vendas/aviso-acesso.ts`
- Test: `tests/vendas/aviso-acesso.spec.ts`

**Interfaces:**
- Consumes: `EstadoAcesso` e `DetalheAcesso` de `@/lib/vendas/acesso` (já existem).
- Produces:
  - `type AvisoAcesso` ganha o membro `{ tipo: 'nuncaTeve' }`.
  - `export interface CartaoDaVitrine { bloqueado: boolean; meta: string | null; botao: { rotulo: string; href: string } | null }`
  - `export function cartaoDaVitrine(args: { estado: EstadoAcesso; detalhe: DetalheAcesso; checkout: string | null }): CartaoDaVitrine`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/vendas/aviso-acesso.spec.ts` (o arquivo já tem os helpers `detalhe()` e `aviso()` no topo — reaproveite-os):

Acrescente `cartaoDaVitrine` ao `import` que já existe na primeira linha do arquivo — não abra um segundo `import` do mesmo módulo:

```ts
import { DIAS_DE_AVISO_DE_VENCIMENTO, avisoDeAcesso, cartaoDaVitrine, textoDoAviso } from '@/lib/vendas/aviso-acesso'
```

E acrescente o bloco de testes:

```ts
describe('cartaoDaVitrine', () => {
  const cartao = (estado: EstadoAcesso, d: Partial<DetalheAcesso> = {}, checkout: string | null = 'https://pay.hotmart.com/x') =>
    cartaoDaVitrine({ estado, detalhe: detalhe(d), checkout })

  it('acesso comprado e vigente: sem cadeado, sem botão, sem linha de estado', () => {
    expect(cartao('ativo', { diasRestantes: 90 })).toEqual({ bloqueado: false, meta: null, botao: null })
  })

  it('degustação vigente: sem cadeado (ela TEM acesso), mas a linha de estado conta os dias', () => {
    expect(cartao('ativo', { trial: true, diasRestantes: 5 })).toEqual({
      bloqueado: false,
      meta: 'Degustação — 5 dia(s) restante(s)',
      botao: null,
    })
  })

  it('degustação vitalícia: conta sem número, porque não há dia a contar', () => {
    expect(cartao('ativo', { trial: true, diasRestantes: null }).meta).toBe('Acesso de degustação')
  })

  it('nunca teve acesso: cadeado e convite de ASSINAR — ela nunca pagou', () => {
    expect(cartao('nunca')).toEqual({
      bloqueado: true,
      meta: 'Você ainda não tem acesso',
      botao: { rotulo: 'Assinar agora', href: 'https://pay.hotmart.com/x' },
    })
  })

  it('acesso comprado que venceu: cadeado e convite de RENOVAR — ela já foi cliente', () => {
    expect(cartao('encerrado', { degustou: false })).toEqual({
      bloqueado: true,
      meta: 'Acesso encerrado — seus cálculos continuam para consulta',
      botao: { rotulo: 'Renovar acesso', href: 'https://pay.hotmart.com/x' },
    })
  })

  it('degustação que venceu: cadeado e convite de ASSINAR — "renovar" descreveria errado quem nunca pagou', () => {
    expect(cartao('encerrado', { degustou: true })).toEqual({
      bloqueado: true,
      meta: 'Sua degustação terminou',
      botao: { rotulo: 'Assinar agora', href: 'https://pay.hotmart.com/x' },
    })
  })

  it('sem endereço de venda configurado: cadeado sem botão, e nunca um botão para lugar nenhum', () => {
    expect(cartao('nunca', {}, null).botao).toBeNull()
    expect(cartao('nunca', {}, '   ').botao).toBeNull()
    expect(cartao('encerrado', {}, null).bloqueado).toBe(true)
  })
})
```

E **substitua** o teste existente, que afirma o contrário do que esta feature faz:

```ts
  it('sem acesso nenhum: não há o que avisar (a tela nem é alcançada)', () => {
    expect(aviso('nunca')).toEqual({ tipo: 'nada' })
  })
```

por:

```ts
  // 🔴 Este teste afirmava `{ tipo: 'nada' }`, com a justificativa "a tela nem é alcançada". Essa
  // premissa CAIU na spec de 2026-09-22: a página do produto passou a abrir em leitura para quem
  // nunca teve acesso, e o aviso é o que explica por que não há botão de criar. Não "conserte"
  // isto de volta sem ler a spec.
  it('sem acesso nenhum: a tela abre em leitura, e o aviso convida a assinar', () => {
    expect(aviso('nunca')).toEqual({ tipo: 'nuncaTeve' })
    expect(textoDoAviso({ tipo: 'nuncaTeve' })?.acao).toBe('Assinar agora')
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run tests/vendas/aviso-acesso.spec.ts`
Expected: FAIL — `cartaoDaVitrine is not a function` nos testes novos, e o teste revisto falhando com `{ tipo: 'nada' }` recebido no lugar de `{ tipo: 'nuncaTeve' }`.

- [ ] **Step 3: Implementar**

Em `src/lib/vendas/aviso-acesso.ts`, acrescente `nuncaTeve` à união:

```ts
export type AvisoAcesso =
  | { tipo: 'nada' }
  | { tipo: 'vencendo'; diasRestantes: number }
  | { tipo: 'trial'; diasRestantes: number | null }
  | { tipo: 'expirado' }
  | { tipo: 'trialExpirado' }
  /** Nunca teve acesso. A tela abre em leitura e este aviso é o que explica o porquê. */
  | { tipo: 'nuncaTeve' }
```

Em `avisoDeAcesso`, troque a linha do estado `nunca`:

```ts
  // 🔴 Antes isto devolvia `{ tipo: 'nada' }`, porque a página redirecionava quem nunca teve
  // acesso. A spec de 2026-09-22 inverteu a regra: a tela abre em leitura, e sem este aviso ela
  // apareceria vazia, sem botão de criar e sem nenhuma explicação.
  if (estado === 'nunca') return { tipo: 'nuncaTeve' }
```

Em `textoDoAviso`, acrescente o caso ao `switch` (o `switch` é exaustivo sobre a união, então o TypeScript já cobra este caso):

```ts
    case 'nuncaTeve':
      return {
        titulo: 'Você ainda não tem acesso a esta ferramenta.',
        corpo:
          'Esta tela abre para você conhecer a ferramenta, mas criar e editar cálculos exige acesso ativo. ' +
          'Assine para começar a usar — o acesso é liberado assim que a compra é confirmada.',
        acao: 'Assinar agora',
      }
```

E acrescente a função nova ao fim do arquivo:

```ts
/** O que o card da vitrine (e o item do menu) mostra sobre um produto. */
export interface CartaoDaVitrine {
  /** Cadeado no card: o membro não pode usar a ferramenta agora. */
  bloqueado: boolean
  /** A linha de estado do card. Nula quando não há nada a dizer — acesso comprado e vigente. */
  meta: string | null
  /**
   * O convite de compra. Nulo quando não há nada a convidar (acesso ativo) e nulo também quando o
   * produto não tem `CHECKOUT_URL_<SLUG>` no ambiente.
   *
   * 🔴 É um objeto com rótulo E endereço juntos, em vez de dois campos soltos, exatamente para
   * tornar impossível desenhar um botão sem destino: sem endereço, não há botão nenhum para a tela
   * renderizar por engano.
   */
  botao: { rotulo: string; href: string } | null
}

/**
 * A regra da vitrine, em função pura (§ spec de 2026-09-22).
 *
 * 🔴 "Assinar" para quem NUNCA pagou, "Renovar" para quem já foi cliente. `detalhe.degustou` é o
 * que separa os dois dentro do estado `encerrado`: quem só experimentou não tem o que renovar, e
 * mandar essa pessoa "renovar" descreve errado a relação dela com o produto.
 */
export function cartaoDaVitrine(args: {
  estado: EstadoAcesso
  detalhe: DetalheAcesso
  checkout: string | null
}): CartaoDaVitrine {
  const { estado, detalhe } = args
  // Espaço em branco é o mesmo que ausência: `checkoutDoProduto` já devolve `null` nesse caso, e
  // esta conferência protege quem chamar a função com o valor cru do ambiente.
  const href = typeof args.checkout === 'string' && args.checkout.trim() ? args.checkout.trim() : null

  if (estado === 'ativo') {
    const meta = !detalhe.trial
      ? null
      : detalhe.diasRestantes === null
        ? 'Acesso de degustação'
        : `Degustação — ${detalhe.diasRestantes} dia(s) restante(s)`
    // Quem tem acesso não recebe convite: o botão competiria com o trabalho da pessoa, e o convite
    // da degustação já mora dentro da página do produto.
    return { bloqueado: false, meta, botao: null }
  }

  const rotulo = estado === 'nunca' || detalhe.degustou ? 'Assinar agora' : 'Renovar acesso'
  const meta =
    estado === 'nunca'
      ? 'Você ainda não tem acesso'
      : detalhe.degustou
        ? 'Sua degustação terminou'
        : 'Acesso encerrado — seus cálculos continuam para consulta'
  return { bloqueado: true, meta, botao: href ? { rotulo, href } : null }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run tests/vendas/aviso-acesso.spec.ts`
Expected: PASS, todos.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `pnpm run test`
Expected: PASS. Se `tests/vendas/acesso.spec.ts` ou `tests/detracao/recolhimento-noturno/contrato.spec.ts` falharem, leia o teste antes de mexer: eles testam funções puras que **não** mudaram neste passo, então uma falha ali é sinal de erro na implementação, não de teste desatualizado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vendas/aviso-acesso.ts tests/vendas/aviso-acesso.spec.ts
git commit -m "feat(vitrine): regra do card de produto bloqueado

cartaoDaVitrine decide cadeado, linha de estado e convite num lugar só, e
avisoDeAcesso ganha o caso nuncaTeve — impossível antes, porque a página
redirecionava quem nunca teve acesso.

Assinar para quem nunca pagou (inclusive degustacao vencida), renovar
para quem foi cliente e perdeu o acesso.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `AvisoAcesso` vira componente compartilhado

Hoje ele mora dentro da pasta do CIC e usa o CSS de lá. A página da Detração precisa do mesmo aviso (Task 6), e duplicá-lo faria a regra de qual botão aparece existir em dois lugares.

**Files:**
- Create: `src/components/vendas/AvisoAcesso.tsx`
- Create: `src/components/vendas/AvisoAcesso.module.css`
- Delete: `src/app/(app)/ferramentas/[calculadora]/AvisoAcesso.tsx`
- Modify: `src/app/(app)/ferramentas/[calculadora]/page.tsx` (só a linha do `import`)

**Interfaces:**
- Consumes: `avisoDeAcesso`, `textoDoAviso`, `type AvisoAcesso` da Task 1; `checkoutDoProduto` e `type Produto` de `@/lib/produtos/catalogo`; `estadoEDetalheDoProduto` de `@/server/vendas/acesso`.
- Produces: `export default async function AvisoAcesso({ produto }: { produto: Produto })` — server component, importável por `@/components/vendas/AvisoAcesso`.

- [ ] **Step 1: Criar o CSS próprio do componente**

Crie `src/components/vendas/AvisoAcesso.module.css` com as três regras que hoje vivem em `src/app/(app)/ferramentas/[calculadora]/calculadora.module.css:429-451` — copiadas literalmente, sem inventar tom:

```css
/* AvisoAcesso.module.css — o bloco de recado sobre o acesso, no topo da página do produto.
 *
 * 🔴 Estas regras vieram de `app/(app)/ferramentas/[calculadora]/calculadora.module.css` quando o
 * componente virou compartilhado (spec de 2026-09-22). As de lá ficaram para o resto daquela tela;
 * o aviso não depende mais delas.
 */

.aviso {
  padding: var(--s-4) var(--s-5);
  background: var(--aviso-wash);
  border: 1px solid var(--aviso);
  border-radius: var(--r-painel);
  color: var(--tinta);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

/* Aviso de acesso que já TERMINOU (comprado ou degustação): pesa mais que o de vencimento, que
 * ainda é só um lembrete de quem está com acesso. Usa o par --erro/--erro-wash, já medido nos dois
 * temas (globals.css) — não invente tom aqui: a cor precisa passar no contraste nos dois fundos. */
.avisoForte {
  background: var(--erro-wash);
  border-color: var(--erro);
}

/* O botão do aviso não deve colar no texto. */
.aviso :global(button),
.aviso :global(a) {
  margin-left: var(--s-3);
}
```

- [ ] **Step 2: Criar o componente**

Crie `src/components/vendas/AvisoAcesso.tsx` com o conteúdo do arquivo antigo, com **três** mudanças: o `import` do CSS aponta para o módulo novo, `estilos.avisoVersao` vira `estilos.aviso`, e `'nuncaTeve'` entra na lista de quem leva botão.

```tsx
import Botao from '@/components/ui/Botao'
import { avisoDeAcesso, textoDoAviso, type AvisoAcesso } from '@/lib/vendas/aviso-acesso'
import { checkoutDoProduto, type Produto } from '@/lib/produtos/catalogo'
import { estadoEDetalheDoProduto } from '@/server/vendas/acesso'
import estilos from './AvisoAcesso.module.css'

/**
 * O recado sobre o acesso, no topo da tela do produto. Compartilhado pelas páginas de produto das
 * duas famílias (indulto-comutação e detração) — a regra de qual recado sai em cada situação vive
 * em `@/lib/vendas/aviso-acesso`, testada sem render.
 *
 * 🔴 O botão de checkout só aparece para quem PERDEU o acesso, está em degustação, ou NUNCA teve.
 * É a diferença entre conversão e renovação: quem ainda tem acesso e vai renovar na Hotmart não
 * precisa de um botão aqui — ele competiria com o trabalho da pessoa, e o lembrete de vencimento
 * já resolve.
 *
 * 🔴 E o aviso de vencimento é um LEMBRETE, não uma ordem de pagamento: o CRM não cobra e não sabe
 * da assinatura da Hotmart, então o texto manda a ação para a Hotmart em vez de sugerir um botão de
 * pagar que não existe nesta tela.
 */
export default async function AvisoAcesso({ produto }: { produto: Produto }) {
  const { estado, detalhe } = await estadoEDetalheDoProduto(produto.id)
  const aviso = avisoDeAcesso({ estado, detalhe })
  const texto = textoDoAviso(aviso)
  // Nada a dizer: a tela fica limpa, sem bloco vazio.
  if (!texto) return null

  // Lido do ambiente, no servidor: sem a variável (ou vazia), o aviso sai sem botão.
  const checkout = checkoutDoProduto(produto.slug)
  const comBotao =
    aviso.tipo === 'trial' || aviso.tipo === 'expirado' || aviso.tipo === 'trialExpirado' || aviso.tipo === 'nuncaTeve'

  return (
    <div className={`${estilos.aviso} ${classeDoTom(aviso)}`} role="status">
      <b>{texto.titulo}</b> {texto.corpo}
      {comBotao ? (
        checkout ? (
          // Sem "externo": o `Botao` já distingue interno de externo pelo `href` — URL absoluta
          // vira `<a href>` com `target="_blank"`, rota interna vira `<Link>`.
          <Botao href={checkout} variante="primario" tamanho="pequeno" target="_blank" rel="noopener noreferrer">
            {texto.acao}
          </Botao>
        ) : (
          // Sem endereço de venda configurado: o recado vai sem botão, e sem link quebrado.
          <span> {texto.acao}.</span>
        )
      ) : null}
    </div>
  )
}

/** O tom do bloco: o que já perdeu acesso pesa mais que o que ainda tem tempo. */
function classeDoTom(aviso: AvisoAcesso): string {
  // 🔴 `nuncaTeve` NÃO entra aqui: quem nunca teve não perdeu nada, e o tom de erro leria como
  // problema onde o recado é um convite.
  return aviso.tipo === 'expirado' || aviso.tipo === 'trialExpirado' ? estilos.avisoForte : ''
}
```

- [ ] **Step 3: Apagar o antigo e reapontar o import**

```bash
git rm "src/app/(app)/ferramentas/[calculadora]/AvisoAcesso.tsx"
```

Em `src/app/(app)/ferramentas/[calculadora]/page.tsx`, troque:

```tsx
import AvisoAcesso from './AvisoAcesso'
```

por:

```tsx
import AvisoAcesso from '@/components/vendas/AvisoAcesso'
```

- [ ] **Step 4: Conferir que ninguém mais aponta para o arquivo antigo**

Run: `grep -rn "from './AvisoAcesso'\|\[calculadora\]/AvisoAcesso" src/ tests/`
Expected: nenhuma linha. Se aparecer alguma, reaponte também para `@/components/vendas/AvisoAcesso`.

- [ ] **Step 5: Build e suíte**

Run: `pnpm build && pnpm run test`
Expected: PASS nos dois. O build é o que pega import quebrado depois de mover arquivo.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/vendas "src/app/(app)/ferramentas/[calculadora]"
git commit -m "refactor(vitrine): AvisoAcesso vira componente compartilhado

Sai da pasta do CIC com CSS proprio, para a pagina da detracao usar o
mesmo aviso sem duplicar a regra de qual botao aparece. Passa a mostrar
botao tambem no caso nuncaTeve.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A vitrine `/ferramentas` mostra o catálogo inteiro

**Files:**
- Modify: `src/app/(app)/ferramentas/page.tsx`
- Modify: `src/app/(app)/ferramentas/ferramentas.module.css`

**Interfaces:**
- Consumes: `cartaoDaVitrine` (Task 1); `PRODUTOS`, `caminhoDoProduto`, `checkoutDoProduto` de `@/lib/produtos/catalogo`; `estadoEDetalheDoProduto` de `@/server/vendas/acesso`.
- Produces: nada que outra task consuma.

**Por que o HTML precisa mudar de forma:** hoje o card inteiro é um `<Link>`. Um `<Botao href>` dentro dele viraria uma âncora dentro de outra âncora — HTML inválido, e o clique no botão fica imprevisível. O card passa a ser um `<div>` com o `<Link>` cobrindo o texto e o botão como irmão dele.

- [ ] **Step 1: Reescrever a página**

Substitua o conteúdo de `src/app/(app)/ferramentas/page.tsx` por:

```tsx
import Link from 'next/link'
import { ChevronRight, Lock, Scale } from 'lucide-react'
import CabecalhoPagina from '@/components/ui/CabecalhoPagina'
import Botao from '@/components/ui/Botao'
import { tituloDaPagina } from '@/server/marca'
import { PRODUTOS, caminhoDoProduto, checkoutDoProduto } from '@/lib/produtos/catalogo'
import { cartaoDaVitrine } from '@/lib/vendas/aviso-acesso'
import { estadoEDetalheDoProduto } from '@/server/vendas/acesso'
import estilos from './ferramentas.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Ferramentas') }
}

/**
 * A vitrine.
 *
 * 🔴 O catálogo INTEIRO, sempre — e é uma inversão consciente da regra antiga "não existe vitrine
 * do que o membro não tem" (§9.2), revista na spec de 2026-09-22. O acesso decide o que a pessoa
 * PODE FAZER, não o que ela VÊ: quem comprou uma calculadora precisa descobrir que as outras
 * existem, e quem comprou só um produto externo entraria numa tela vazia. Não volte a filtrar por
 * `estado !== 'nunca'` aqui sem ler a spec.
 *
 * O gate de verdade não é este: `/novo` e `/[id]` redirecionam, e `exigirEscrita` recusa na server
 * action. Mostrar o card não libera nada.
 */
export default async function FerramentasPage() {
  const cartoes = await Promise.all(
    PRODUTOS.map(async (produto) => {
      const { estado, detalhe } = await estadoEDetalheDoProduto(produto.id)
      return {
        produto,
        cartao: cartaoDaVitrine({ estado, detalhe, checkout: checkoutDoProduto(produto.slug) }),
      }
    }),
  )

  return (
    <div className={estilos.pagina}>
      <CabecalhoPagina titulo="Ferramentas" subtitulo="Cálculos de execução penal." />

      <div className={estilos.destinos}>
        {cartoes.map(({ produto, cartao }) => (
          <div key={produto.id} className={estilos.destino}>
            {/* 🔴 O `<Link>` cobre só o texto, e o botão é irmão dele: âncora dentro de âncora é
                HTML inválido, e o clique no botão ficaria imprevisível. */}
            <Link href={caminhoDoProduto(produto.slug)} className={estilos.destinoLink}>
              <span className={estilos.destinoIcone}>
                {cartao.bloqueado ? (
                  <Lock size={16} strokeWidth={1.75} aria-label="Sem acesso" />
                ) : (
                  <Scale size={16} strokeWidth={1.75} />
                )}
              </span>
              <span className={estilos.destinoTexto}>
                <span className={estilos.destinoNome}>{produto.menuTitulo}</span>
                <span className={estilos.destinoSub}>{produto.menuDescricao}</span>
                {cartao.meta ? <span className={estilos.destinoMeta}>{cartao.meta}</span> : null}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className={estilos.destinoSeta} />
            </Link>
            {cartao.botao ? (
              <div className={estilos.destinoAcao}>
                <Botao
                  href={cartao.botao.href}
                  variante="primario"
                  tamanho="pequeno"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cartao.botao.rotulo}
                </Botao>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Três coisas saíram de propósito, e nenhuma é descuido:
1. O `EstadoVazio` "Nenhuma ferramenta liberada" — vira inalcançável, porque `PRODUTOS` nunca é vazio. Some também o `import` de `EstadoVazio`.
2. O texto fixo *"Verifica, dispositivo por dispositivo, os requisitos de indulto e de comutação"*, que era repetido em **todo** card, inclusive no de Detração, onde estava errado. No lugar entra `produto.menuDescricao`, que já descreve cada produto.
3. A linha de estado passa a vir de `cartao.meta`, decidida na Task 1 em vez de montada aqui.

- [ ] **Step 2: Ajustar o CSS**

Em `src/app/(app)/ferramentas/ferramentas.module.css`, o card deixa de ser o próprio link. Substitua o bloco de `.destino` (incluindo `.destino:hover`, `.destino:focus-visible` e a regra de hover da seta no fim do arquivo) por:

```css
/* O card: uma caixa que contém o link do produto e, quando há, o botão de compra. */
.destino {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  border-radius: var(--r-controle);
}

/* 🔴 O LINK é quem tem o hover e o foco, não o card: o botão de compra é irmão dele (âncora dentro
 * de âncora é HTML inválido), e pintar o card inteiro no hover do link faria o botão piscar junto. */
.destinoLink {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  flex: 1;
  min-width: 0;
  padding: var(--s-3);
  border-radius: var(--r-controle);
  text-decoration: none;
  color: inherit;
  transition: background-color var(--t-rapido) var(--suave);
}

.destinoLink:hover { background: var(--superficie-hover); }

.destinoLink:focus-visible {
  outline: 2px solid var(--acento);
  outline-offset: 2px;
}

.destinoAcao {
  flex-shrink: 0;
  padding-right: var(--s-3);
}
```

E, no fim do arquivo, troque o seletor do hover da seta:

```css
.destinoLink:hover .destinoSeta,
.destinoLink:focus-visible .destinoSeta {
  opacity: 1;
  transform: none;
}
```

Atualize também o comentário do topo do arquivo, que hoje declara `.destino` como cópia de `config.module.css` e `agentes.module.css`. Acrescente ao fim daquele parágrafo:

```
 * 🔴 A vitrine DIVERGIU dessas duas em 2026-09-22: aqui o card ganhou um botão de compra ao lado
 * do link, então o hover e o foco moraram para `.destinoLink`. As outras duas continuam com o link
 * cobrindo o card inteiro — não propague esta mudança para lá sem necessidade.
```

- [ ] **Step 3: Build e suíte**

Run: `pnpm build && pnpm run test`
Expected: PASS nos dois.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/page.tsx" "src/app/(app)/ferramentas/ferramentas.module.css"
git commit -m "feat(vitrine): /ferramentas mostra o catalogo inteiro

Inverte a §9.2: todo produto aparece sempre, com cadeado e convite de
compra para quem nao tem acesso. O card deixa de ser um link inteiro,
porque o botao nao pode ser ancora dentro de ancora.

Sai o texto fixo que descrevia indulto em TODO card, inclusive no de
detracao, onde estava errado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: O menu lateral mostra o catálogo inteiro, com cadeado

**Files:**
- Modify: `src/components/shell/Rail.tsx:71-72` (o `filter` do `produtosNoMenu`) e o bloco que renderiza os `ItemNav` dos produtos
- Modify: `src/components/shell/ItemNav.tsx`
- Modify: `src/components/shell/Rail.module.css`

**Interfaces:**
- Consumes: `estadoDoProduto` de `@/server/vendas/acesso` (já importado no Rail).
- Produces: `ItemNav` ganha a prop opcional `bloqueado?: boolean`.

**Decisão da spec:** o item bloqueado leva **cadeado e é clicável**, mas **não** leva botão — o menu é estreito, e o convite mora na vitrine e na página do produto.

- [ ] **Step 1: `ItemNav` ganha o cadeado**

Em `src/components/shell/ItemNav.tsx`, acrescente o import do ícone, a prop e o elemento:

```tsx
import { Lock } from 'lucide-react'
```

```tsx
export default function ItemNav({ href, rotulo, descricao, children, indentado, bloqueado }: {
  href: string
  rotulo: string
  // Segunda linha, menor e apagada — o item vira um cartão de duas linhas (título + descrição)
  // em vez do rótulo único de sempre. Usado pelas ferramentas individuais em Rail.tsx.
  descricao?: string
  children?: React.ReactNode
  // Recua o item sem ícone sob o rótulo de um grupo estático acima dele (ver `.navGrupo` em
  // Rail.tsx) — a indentação é o que diz "isto pertence ao grupo de cima".
  indentado?: boolean
  // Cadeado à direita: o membro vê a ferramenta, e a tela abre, mas em leitura. Sem botão aqui —
  // o menu é estreito, e o convite de compra mora na vitrine e na página do produto.
  bloqueado?: boolean
}) {
```

E, dentro do `<Link>`, depois do bloco do rótulo e antes de fechar:

```tsx
      {bloqueado ? (
        <Lock size={14} strokeWidth={2} className={estilos.navCadeado} aria-label="Sem acesso" />
      ) : null}
```

Em `src/components/shell/Rail.module.css`, acrescente ao fim:

```css
/* O cadeado do item de menu sem acesso: encostado à direita, e mudo — ele informa, não chama. */
.navCadeado {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--tinta-3);
}
```

- [ ] **Step 2: `Rail` deixa de filtrar**

Em `src/components/shell/Rail.tsx`, substitua o bloco do `produtosNoMenu` (hoje com o comentário sobre "não existe vitrine do que o membro não tem" e o `.filter((p) => p.estado !== 'nunca')`) por:

```tsx
  // 🔴 TODAS as calculadoras, sempre — inclusive as que o membro não tem. É a inversão da §9.2
  // decidida na spec de 2026-09-22: o item sem acesso aparece com cadeado e a tela abre em leitura.
  // Não volte a filtrar por `estado !== 'nunca'` aqui: quem comprou uma calculadora precisa
  // descobrir que as outras existem.
  const produtosNoMenu = await Promise.all(
    PRODUTOS.map(async (produto) => ({ produto, estado: await estadoDoProduto(produto.id) })),
  )
```

E, no bloco que renderiza os itens, passe a prop:

```tsx
            {produtos.map(({ produto, estado }) => (
              <ItemNav
                key={produto.id}
                href={caminhoDoProduto(produto.slug)}
                rotulo={produto.menuTitulo}
                descricao={produto.menuDescricao}
                indentado
                bloqueado={estado !== 'ativo'}
              />
            ))}
```

O `{produtosNoMenu.length > 0 && (...)}` que envolve a seção "Calculadoras" pode ficar como está: `PRODUTOS` nunca é vazio, então a condição é sempre verdadeira e não atrapalha.

- [ ] **Step 3: Build e suíte**

Run: `pnpm build && pnpm run test`
Expected: PASS nos dois. Preste atenção a `tests/fronteira-rsc.spec.ts`, que vigia o que é client component: `ItemNav` já era `'use client'` e continua sendo, então nada deve mudar ali.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/Rail.tsx src/components/shell/ItemNav.tsx src/components/shell/Rail.module.css
git commit -m "feat(vitrine): menu mostra todas as calculadoras, com cadeado

Item sem acesso aparece com cadeado e e clicavel — a tela abre em
leitura. Sem botao no menu: ele e estreito, e o convite mora na vitrine
e na pagina do produto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A página do CIC abre em leitura

**Files:**
- Modify: `src/app/(app)/ferramentas/[calculadora]/page.tsx:32` (o `redirect`)

**Interfaces:**
- Consumes: o `AvisoAcesso` compartilhado da Task 2 (o import já foi reapontado lá).
- Produces: nada.

- [ ] **Step 1: Tirar o redirecionamento**

Em `src/app/(app)/ferramentas/[calculadora]/page.tsx`, substitua:

```tsx
  // O gate é do produto DESTA rota, não de qualquer produto: quem tem 2025 e não
  // tem 2024 não pode ver a tela de 2024 só porque tem alguma calculadora.
  const estado = await estadoDoProduto(produto.id)
  if (estado === 'nunca') redirect('/ferramentas')
  const ativo = estado === 'ativo'
```

por:

```tsx
  // O gate é do produto DESTA rota, não de qualquer produto: quem tem 2025 e não
  // tem 2024 vê a tela de 2024 em LEITURA, e não a tela de trabalho.
  //
  // 🔴 Aqui havia `if (estado === 'nunca') redirect('/ferramentas')`. Ele saiu na spec de
  // 2026-09-22: a tela passa a abrir para quem nunca teve acesso, com o aviso explicando e
  // convidando. Isso NÃO afrouxa nada — `ativo` continua controlando o botão de criar, `/novo` e
  // `/[id]` redirecionam, e `exigirEscrita` recusa na server action. O gate nunca foi o esconder.
  const estado = await estadoDoProduto(produto.id)
  const ativo = estado === 'ativo'
```

Se o `redirect` ficar sem nenhum outro uso no arquivo, tire-o do `import` de `next/navigation` (o `notFound` continua sendo usado).

- [ ] **Step 2: Conferir que o import não ficou órfão**

Run: `grep -n "redirect" "src/app/(app)/ferramentas/[calculadora]/page.tsx"`
Expected: nenhuma linha (ou só as do comentário acima). O lint do build reclama de import não usado.

- [ ] **Step 3: Build e suíte**

Run: `pnpm build && pnpm run test`
Expected: PASS nos dois.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/[calculadora]/page.tsx"
git commit -m "feat(vitrine): pagina do CIC abre em leitura para quem nao tem acesso

Sai o redirect do estado nunca. O botao de criar continua escondido, e
/novo, /[id] e exigirEscrita continuam recusando: o gate nunca foi o
esconder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A página da Detração entra em paridade

Hoje ela **não tem gate nenhum e não mostra aviso**: exibe "Novo Cálculo" para qualquer membro. Fica escondido porque o menu escondia o produto; com a Task 4, a página vira alcançável por clique e mostraria um botão que leva a um redirecionamento.

**Files:**
- Modify: `src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx`

**Interfaces:**
- Consumes: `estadoDoProduto` de `@/server/vendas/acesso`; `produtoPorSlug` de `@/lib/produtos/catalogo`; `AvisoAcesso` de `@/components/vendas/AvisoAcesso` (Task 2).
- Produces: nada.

- [ ] **Step 1: Acrescentar o gate e o aviso**

Em `src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx`, acrescente aos imports:

```tsx
import AvisoAcesso from '@/components/vendas/AvisoAcesso'
import { estadoDoProduto } from '@/server/vendas/acesso'
import { produtoPorSlug } from '@/lib/produtos/catalogo'
```

E logo abaixo dos imports, a constante que as outras rotas desta pasta já usam:

```tsx
const PRODUTO_ID = 'detracao-recolhimento-noturno'
```

Dentro do componente, substitua:

```tsx
  await params
  const calculos = await listarCalculos('recolhimento-noturno')

  const novo = (
    <Botao href="/ferramentas/detracao/recolhimento-noturno/novo" variante="primario">
      Novo Cálculo
    </Botao>
  )
```

por:

```tsx
  await params
  const calculos = await listarCalculos('recolhimento-noturno')

  // 🔴 Esta página não tinha gate nenhum: mostrava "Novo Cálculo" para qualquer membro, e o clique
  // caía num redirecionamento em `/novo`. Passava despercebido porque o menu escondia o produto de
  // quem não tem acesso — o que deixou de ser verdade na spec de 2026-09-22.
  const ativo = (await estadoDoProduto(PRODUTO_ID)) === 'ativo'
  const produto = produtoPorSlug('recolhimento-noturno')

  const novo = ativo ? (
    <Botao href="/ferramentas/detracao/recolhimento-noturno/novo" variante="primario">
      Novo Cálculo
    </Botao>
  ) : null
```

E, logo depois do `<CabecalhoPagina ... />`, acrescente o aviso:

```tsx
      {produto ? <AvisoAcesso produto={produto} /> : null}
```

O `EstadoVazio` e a tabela continuam como estão: `novo` já é `null` fora do ativo, então a ação do estado vazio some sozinha.

- [ ] **Step 2: Conferir que o botão sumiu mesmo dos dois lugares**

Run: `grep -n "novo" "src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx"`
Expected: o `const novo = ativo ? ... : null`, o `acoes={novo}` do cabeçalho e o `acao={novo}` do `EstadoVazio` — e nenhum outro `<Botao href=".../novo">` solto.

- [ ] **Step 3: Build e suíte**

Run: `pnpm build && pnpm run test`
Expected: PASS nos dois.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx"
git commit -m "fix(detracao): pagina de calculos passa a respeitar o acesso

Ela nao tinha gate nem aviso: mostrava Novo Calculo para qualquer membro,
e o clique caia num redirecionamento. Ficava escondido porque o menu
escondia o produto — o que a vitrine deixou de fazer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verificação no navegador e fechamento

**Files:**
- Nenhum arquivo de produção. Se algum defeito aparecer, ele é corrigido na task que o produziu.

- [ ] **Step 1: Suíte e build completos, do zero**

Run: `pnpm run test && pnpm build`
Expected: PASS nos dois. Cole a saída no relatório — sem a saída, não afirme que passou.

- [ ] **Step 2: Subir o app**

Run: `pnpm dev`
Expected: servidor em `http://localhost:3000`.

- [ ] **Step 3: Conferir com um membro SEM acesso nenhum**

Entre com uma conta que não seja a do dono do servidor (o dono passa por cima de tudo em `estadoDeAcesso` e veria tudo ativo — testar com ele não prova nada) e sem venda nenhuma. Confirme os cinco pontos:

1. `/ferramentas` lista **as três** calculadoras do catálogo, todas com cadeado.
2. Cada card mostra "Você ainda não tem acesso" e, para os produtos com `CHECKOUT_URL_<SLUG>` configurado, o botão **"Assinar agora"**. Para os sem variável, cadeado e nenhum botão.
3. O menu lateral lista as três, com cadeado.
4. Clicar numa delas **abre** a página, sem redirecionar, sem botão "Novo cálculo", com o aviso no topo.
5. O mesmo vale para `/ferramentas/detracao/recolhimento-noturno`.

- [ ] **Step 4: Conferir que o acesso ativo não regrediu**

Com uma conta que tenha acesso ativo a um produto: o card dele sai **sem** cadeado e **sem** botão, o menu idem, e a página abre com "Novo cálculo" funcionando. Criar um cálculo continua funcionando.

- [ ] **Step 5: Tentar escrever sem acesso**

Com a conta sem acesso, abra `/ferramentas/cic-2025/novo` na barra de endereços.
Expected: redirecionamento para a lista do produto. É a confirmação de que abrir a tela de leitura não abriu buraco nenhum.

- [ ] **Step 6: Relatar**

Escreva o que foi verificado, com a saída dos comandos. Se algum ponto falhou, diga qual e pare — não marque a feature como pronta.

---

## Fora deste plano

**Produtos externos** — cadastro dinâmico de produtos que o CRM não entrega, ofertas que os vendem, e o modelo de e-mail `degustacao_liberada`. As decisões do brainstorm estão no fim da spec deste trabalho, e vão virar spec própria depois que esta vitrine estiver em produção.
