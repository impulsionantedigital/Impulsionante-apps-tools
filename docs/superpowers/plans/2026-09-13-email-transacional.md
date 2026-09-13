# E-mail transacional — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao CRM a capacidade de enviar e-mail transacional a partir de modelos HTML editáveis pelo dono do servidor, com merge de campos escapado, fila com retentativa e envio pelo relógio interno.

**Architecture:** toda a decisão vive em `src/lib/email/` como funções puras (é o que o vitest consegue testar — não há banco sob teste neste repositório); `src/server/email/` fica fino e só faz I/O. A fila copia a forma do outbox de webhook da `0007`, incluindo a RPC de reserva com `for update skip locked`, e é drenada por um braço novo no relógio que já bate a cada 30 s.

**Tech Stack:** TypeScript, Next.js 16 (App Router, server actions), Supabase/Postgres, vitest, nodemailer.

**Spec:** `docs/superpowers/specs/2026-09-13-vendas-hotmart-design.md` (§8 inteira; §12.2 no que toca ao armazenamento)

## Global Constraints

- **Gestor de pacotes é `pnpm@10.33.0`.** Nunca `npm` — misturar os dois gera lockfile que o build do servidor não entende. `pnpm build` antes de cada commit que toque em `src/`.
- **Testes**: vitest, `tests/**/*.spec.ts`, ambiente `node`. Alias `@` → `src/`. Rodar com `pnpm test`.
- **Não há banco sob teste.** Nenhum teste pode depender de Postgres. Código que fala com o banco é mantido fino e a lógica sai dele para `src/lib/`.
- **Migration que falha impede o container de subir**, em toda instalação. Toda instrução aguenta rodar duas vezes: `if not exists` onde a linguagem aceita (`create table`, `create index`, `add column`); bloco `do $$ … end $$` consultando `pg_policies` / `pg_trigger` / `pg_constraint` onde não aceita (`create policy`, `create trigger`, `add constraint`).
- **Toda `check` é nomeada.** `add check (…)` anónima recebe do Postgres o nome `<tabela>_<coluna>_check`, que é o padrão que as migrations do produto procuram para alargar domínios.
- **Toda tabela nova**: `enable row level security`, `grant all … to anon, authenticated, service_role` (igual à `0061`, não o mínimo — grant diferente criaria dois mundos de instalação), e policy **só** para `service_role`. **Nenhuma policy de escrita para `authenticated`**: o navegador recebe um cliente Supabase na tela de Conversas, e o Postgres não distingue "o servidor em nome do utilizador" de "o utilizador pelo console". As escritas vão por server action com service-role, que não passa por RLS.
- **Numeração de migration**: `0063`. A `0062` é da calculadora; abaixo de 9000 é faixa do produto.
- **Este é o repositório-fonte do produto.** A regra do `AGENTS.md` que confina edições a `custom/` é para o comprador; aqui o trabalho é em `src/` e `supabase/migrations/`.
- **Branch**: `vendas-hotmart`, já criada a partir de `main`.

---

## Estrutura de arquivos

**Puro e testável — `src/lib/`**

| arquivo | responsabilidade |
|---|---|
| `src/lib/email/tipos.ts` | a união `TipoModelo` e o catálogo de campos de merge por tipo |
| `src/lib/email/merge.ts` | substituição de campos, com escape de HTML no valor |
| `src/lib/email/smtp.ts` | leitura e validação da configuração SMTP a partir do ambiente |
| `src/lib/email/envelope.ts` | montagem do envelope (de, para, assunto, html, alternativa em texto) |
| `src/lib/email/padroes.ts` | o HTML e o assunto padrão de cada um dos quatro modelos |
| `src/lib/retentativa.ts` | escada de recuo e regra de desistência, partilhada com o outbox de webhook |

**I/O — `src/server/`**

| arquivo | responsabilidade |
|---|---|
| `src/server/email/enviar.ts` | transporte nodemailer e envio de uma mensagem |
| `src/server/email/modelos.ts` | leitura do modelo (linha do banco, ou o padrão do código) e gravação |
| `src/server/email/fila.ts` | `enfileirar()` e `drenarEmail()` |

**Modificados**

| arquivo | mudança |
|---|---|
| `src/server/webhook/nucleo.ts` | `backoff` passa a ser reexportado de `@/lib/retentativa` |
| `src/lib/orcamento-tick.ts` | braço `email` em `PIORES_CASOS` e `PORTOES` |
| `src/app/api/interno/tick/route.ts` | chamada a `drenarEmail(orcamento)` |
| `src/app/(app)/config/page.tsx` | card de modelos na aba Servidor |
| `.env.example`, `docs/DEPLOY.md` | as seis variáveis SMTP |
| `package.json` | `nodemailer` + `@types/nodemailer` |

**Criados fora de `src/`**

- `supabase/migrations/0063_email_transacional.sql`
- `src/app/(app)/config/ModelosEmailCard.tsx`, `src/app/(app)/config/acoes-email.ts`
- `tests/email/*.spec.ts`, `tests/migracoes/idempotencia.spec.ts`

**Desvio consciente do spec §8.2:** o spec dizia que os quatro modelos nascem *semeados* no banco. Aqui os padrões vivem em `src/lib/email/padroes.ts` e a linha em `modelos_email` só nasce quando o dono edita. O comportamento visível é o mesmo, e assim não é preciso semear workspace nenhum — nem os que existem hoje, nem os que nascerem depois.

---

### Task 1: Tipos e catálogo de campos de merge

**Files:**
- Create: `src/lib/email/tipos.ts`
- Test: `tests/email/tipos.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type TipoModelo`, `const TIPOS: readonly TipoModelo[]`, `const CAMPOS: Record<TipoModelo, readonly string[]>`, `function ehTipoConhecido(valor: string): valor is TipoModelo`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/email/tipos.spec.ts
import { describe, it, expect } from 'vitest'
import { TIPOS, CAMPOS, ehTipoConhecido, type TipoModelo } from '@/lib/email/tipos'

describe('catálogo de tipos de modelo', () => {
  it('tem exatamente os quatro tipos do spec', () => {
    expect([...TIPOS]).toEqual([
      'boas_vindas', 'recuperacao_senha', 'entrega_produto', 'pagamento_recebido',
    ])
  })

  it('define campos para todos os tipos, sem tipo órfão nos dois sentidos', () => {
    expect(Object.keys(CAMPOS).sort()).toEqual([...TIPOS].sort())
  })

  it('nomeia todo campo em CAIXA_ALTA com sublinhado', () => {
    for (const tipo of TIPOS) {
      for (const campo of CAMPOS[tipo]) expect(campo).toMatch(/^[A-Z][A-Z_]*$/)
    }
  })

  it('não repete campo dentro do mesmo tipo', () => {
    for (const tipo of TIPOS) {
      expect(new Set(CAMPOS[tipo]).size).toBe(CAMPOS[tipo].length)
    }
  })

  it('oferece MEMBER_NAME e LOGIN_URL em todos os tipos', () => {
    for (const tipo of TIPOS) {
      expect(CAMPOS[tipo]).toContain('MEMBER_NAME')
      expect(CAMPOS[tipo]).toContain('LOGIN_URL')
    }
  })

  it('só o e-mail de boas-vindas e o de recuperação levam a senha temporária', () => {
    const comSenha = TIPOS.filter((t) => CAMPOS[t].includes('TEMP_PASSWORD'))
    expect(comSenha).toEqual(['boas_vindas', 'recuperacao_senha'])
  })

  it('reconhece tipo conhecido e recusa desconhecido', () => {
    expect(ehTipoConhecido('boas_vindas')).toBe(true)
    expect(ehTipoConhecido('cobranca')).toBe(false)
    expect(ehTipoConhecido('')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/tipos.spec.ts`
Expected: FAIL — `Failed to resolve import "@/lib/email/tipos"`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/email/tipos.ts
export type TipoModelo =
  | 'boas_vindas'
  | 'recuperacao_senha'
  | 'entrega_produto'
  | 'pagamento_recebido'

export const TIPOS = [
  'boas_vindas',
  'recuperacao_senha',
  'entrega_produto',
  'pagamento_recebido',
] as const satisfies readonly TipoModelo[]

export const CAMPOS: Record<TipoModelo, readonly string[]> = {
  boas_vindas: ['MEMBER_NAME', 'MEMBER_EMAIL', 'TEMP_PASSWORD', 'LOGIN_URL'],
  recuperacao_senha: ['MEMBER_NAME', 'TEMP_PASSWORD', 'LOGIN_URL'],
  entrega_produto: ['MEMBER_NAME', 'PRODUCT_NAME', 'OFFER_NAME', 'EXPIRES_AT', 'TOOL_URL', 'LOGIN_URL'],
  pagamento_recebido: ['MEMBER_NAME', 'OFFER_NAME', 'PRODUCT_NAME', 'EXPIRES_AT', 'VALUE', 'TRANSACTION', 'LOGIN_URL'],
}

export function ehTipoConhecido(valor: string): valor is TipoModelo {
  return (TIPOS as readonly string[]).includes(valor)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/email/tipos.spec.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/tipos.ts tests/email/tipos.spec.ts
git commit -m "Declara os tipos de modelo de e-mail e seus campos de merge"
```

---

### Task 2: Motor de merge, com escape no valor

**Files:**
- Create: `src/lib/email/merge.ts`
- Test: `tests/email/merge.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `function escaparHtml(valor: string): string`, `function renderizarHtml(modelo: string, valores: Record<string, string>): string`, `function renderizarTexto(modelo: string, valores: Record<string, string>): string`.

**Por que duas funções de renderização:** o assunto do e-mail é **texto puro**, não HTML. Escapar ali faria o cliente ver `Bar &amp; Cia` na linha de assunto. O corpo é HTML e o valor **tem** de ser escapado — `[MEMBER_NAME]` vem de `data.buyer.name`, ou seja, de quem compra (spec §8.3).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/email/merge.spec.ts
import { describe, it, expect } from 'vitest'
import { escaparHtml, renderizarHtml, renderizarTexto } from '@/lib/email/merge'

describe('escaparHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('escapa o & uma vez só, sem duplo escape', () => {
    expect(escaparHtml('Bar & Cia')).toBe('Bar &amp; Cia')
    expect(escaparHtml('&lt;')).toBe('&amp;lt;')
  })

  it('deixa texto comum intacto', () => {
    expect(escaparHtml('Alexandre Pavon')).toBe('Alexandre Pavon')
  })
})

describe('renderizarHtml', () => {
  it('substitui campo conhecido', () => {
    expect(renderizarHtml('Olá [MEMBER_NAME]!', { MEMBER_NAME: 'Ana' })).toBe('Olá Ana!')
  })

  it('substitui todas as ocorrências do mesmo campo', () => {
    expect(renderizarHtml('[A] e [A]', { A: 'x' })).toBe('x e x')
  })

  it('deixa literal o campo sem valor', () => {
    expect(renderizarHtml('Olá [MEMBER_NAME]!', {})).toBe('Olá [MEMBER_NAME]!')
  })

  it('aceita valor vazio como substituição legítima', () => {
    expect(renderizarHtml('[A]!', { A: '' })).toBe('!')
  })

  it('ESCAPA o valor — marcação vinda do comprador não vira marcação', () => {
    expect(renderizarHtml('<p>[MEMBER_NAME]</p>', { MEMBER_NAME: '<script>alert(1)</script>' }))
      .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('NÃO escapa o modelo — o HTML que o dono escreve continua HTML', () => {
    expect(renderizarHtml('<b>Olá</b> [A]', { A: 'x' })).toBe('<b>Olá</b> x')
  })

  it('ignora colchetes que não são campo', () => {
    expect(renderizarHtml('[nao-campo] [A1] [ ]', { A: 'x' })).toBe('[nao-campo] [A1] [ ]')
  })
})

describe('renderizarTexto', () => {
  it('substitui SEM escapar, porque assunto não é HTML', () => {
    expect(renderizarTexto('Compra de [OFFER_NAME]', { OFFER_NAME: 'Bar & Cia' }))
      .toBe('Compra de Bar & Cia')
  })

  it('deixa literal o campo sem valor', () => {
    expect(renderizarTexto('[X]', {})).toBe('[X]')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/merge.spec.ts`
Expected: FAIL — `Failed to resolve import "@/lib/email/merge"`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/email/merge.ts
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caractere) => ESCAPES[caractere])
}

const CAMPO = /\[([A-Z][A-Z_]*)\]/g

function substituir(
  modelo: string,
  valores: Record<string, string>,
  transformar: (valor: string) => string,
): string {
  return modelo.replace(CAMPO, (inteiro, campo: string) =>
    Object.prototype.hasOwnProperty.call(valores, campo) ? transformar(valores[campo]) : inteiro,
  )
}

export function renderizarHtml(modelo: string, valores: Record<string, string>): string {
  return substituir(modelo, valores, escaparHtml)
}

export function renderizarTexto(modelo: string, valores: Record<string, string>): string {
  return substituir(modelo, valores, (valor) => valor)
}
```

Nota: a substituição numa única passada de regex é o que impede duplo escape — o `&` produzido por `&lt;` não volta a ser visitado.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/email/merge.spec.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/merge.ts tests/email/merge.spec.ts
git commit -m "Implementa o merge de campos com escape de HTML no valor"
```

---

### Task 3: Leitura da configuração SMTP

**Files:**
- Create: `src/lib/email/smtp.ts`
- Test: `tests/email/smtp.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type ConfigSmtp = { host: string; porta: number; seguro: boolean; usuario: string; senha: string; remetente: string }`, `type LeituraSmtp = { ok: true; config: ConfigSmtp } | { ok: false; faltando: string[] }`, `function lerConfigSmtp(env: Record<string, string | undefined>): LeituraSmtp`.

**Por que recebe `env` por parâmetro:** para ser puro e testável. Quem chama passa `process.env`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/email/smtp.spec.ts
import { describe, it, expect } from 'vitest'
import { lerConfigSmtp } from '@/lib/email/smtp'

const COMPLETO = {
  SMTP_HOST: 'smtp.exemplo.com',
  SMTP_PORT: '587',
  SMTP_USER: 'apikey',
  SMTP_PASS: 'segredo',
  SMTP_FROM: 'GPS da Pena <nao-responda@exemplo.com>',
}

describe('lerConfigSmtp', () => {
  it('lê a configuração completa', () => {
    const r = lerConfigSmtp(COMPLETO)
    expect(r).toEqual({
      ok: true,
      config: {
        host: 'smtp.exemplo.com',
        porta: 587,
        seguro: false,
        usuario: 'apikey',
        senha: 'segredo',
        remetente: 'GPS da Pena <nao-responda@exemplo.com>',
      },
    })
  })

  it('nomeia TODAS as variáveis que faltam, não só a primeira', () => {
    const r = lerConfigSmtp({ SMTP_HOST: 'h' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'])
  })

  it('trata variável só com espaços como ausente', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_HOST: '   ' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_HOST'])
  })

  it('recusa porta não numérica', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: 'quinhentos' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('inesperado')
    expect(r.faltando).toEqual(['SMTP_PORT'])
  })

  it('recusa porta fora da faixa', () => {
    for (const porta of ['0', '65536', '-1', '587.5']) {
      expect(lerConfigSmtp({ ...COMPLETO, SMTP_PORT: porta }).ok).toBe(false)
    }
  })

  it('deduz seguro=true na 465 quando SMTP_SECURE não foi dito', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465' })
    if (!r.ok) throw new Error('inesperado')
    expect(r.config.seguro).toBe(true)
  })

  it('deixa SMTP_SECURE explícito vencer a dedução, nos dois sentidos', () => {
    const a = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '465', SMTP_SECURE: 'false' })
    const b = lerConfigSmtp({ ...COMPLETO, SMTP_PORT: '587', SMTP_SECURE: 'true' })
    if (!a.ok || !b.ok) throw new Error('inesperado')
    expect(a.config.seguro).toBe(false)
    expect(b.config.seguro).toBe(true)
  })

  it('apara espaços em volta dos valores', () => {
    const r = lerConfigSmtp({ ...COMPLETO, SMTP_HOST: '  smtp.exemplo.com  ' })
    if (!r.ok) throw new Error('inesperado')
    expect(r.config.host).toBe('smtp.exemplo.com')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/smtp.spec.ts`
Expected: FAIL — `Failed to resolve import "@/lib/email/smtp"`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/email/smtp.ts
export interface ConfigSmtp {
  host: string
  porta: number
  seguro: boolean
  usuario: string
  senha: string
  remetente: string
}

export type LeituraSmtp = { ok: true; config: ConfigSmtp } | { ok: false; faltando: string[] }

const OBRIGATORIAS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const

function aparar(env: Record<string, string | undefined>, chave: string): string {
  return (env[chave] ?? '').trim()
}

export function lerConfigSmtp(env: Record<string, string | undefined>): LeituraSmtp {
  const faltando = OBRIGATORIAS.filter((chave) => aparar(env, chave) === '')
  if (faltando.length > 0) return { ok: false, faltando: [...faltando] }

  const porta = Number(aparar(env, 'SMTP_PORT'))
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    return { ok: false, faltando: ['SMTP_PORT'] }
  }

  const dito = aparar(env, 'SMTP_SECURE').toLowerCase()
  const seguro = dito === '' ? porta === 465 : dito === 'true'

  return {
    ok: true,
    config: {
      host: aparar(env, 'SMTP_HOST'),
      porta,
      seguro,
      usuario: aparar(env, 'SMTP_USER'),
      senha: aparar(env, 'SMTP_PASS'),
      remetente: aparar(env, 'SMTP_FROM'),
    },
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/email/smtp.spec.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/smtp.ts tests/email/smtp.spec.ts
git commit -m "Lê e valida a configuração SMTP do ambiente"
```

---

### Task 4: Política de retentativa, partilhada com o outbox

**Files:**
- Create: `src/lib/retentativa.ts`
- Modify: `src/server/webhook/nucleo.ts:5-9`
- Test: `tests/email/retentativa.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `const MAX_TENTATIVAS: number`, `const IDADE_MAX_MS: number`, `function backoff(tentativas: number): number`, `function deveDesistir(tentativas: number, criadoEmMs: number, agoraMs: number): boolean`.

**Por que mover em vez de duplicar:** `backoff` já existe em `src/server/webhook/nucleo.ts:6`, com a escada exata que a fila de e-mail precisa. Copiá-la criaria duas escadas que divergem na primeira vez que alguém ajustar uma. `nucleo.ts` passa a reexportá-la, então `entrega.ts` e o resto continuam a funcionar sem tocar numa linha.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/email/retentativa.spec.ts
import { describe, it, expect } from 'vitest'
import { backoff, deveDesistir, MAX_TENTATIVAS, IDADE_MAX_MS } from '@/lib/retentativa'
import { backoff as backoffDoNucleo } from '@/server/webhook/nucleo'

const MIN = 60_000

describe('backoff', () => {
  it('sobe pela escada de 1, 5, 15, 30, 60, 120, 360 e 720 minutos', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(backoff))
      .toEqual([1, 5, 15, 30, 60, 120, 360, 720].map((m) => m * MIN))
  })

  it('satura no último degrau em vez de estourar o índice', () => {
    expect(backoff(8)).toBe(720 * MIN)
    expect(backoff(999)).toBe(720 * MIN)
  })

  it('trata tentativa negativa como zero', () => {
    expect(backoff(-3)).toBe(1 * MIN)
  })

  it('é a MESMA função que o outbox de webhook usa', () => {
    expect(backoffDoNucleo).toBe(backoff)
  })
})

describe('deveDesistir', () => {
  const agora = 1_800_000_000_000

  it('não desiste antes do teto de tentativas nem do teto de idade', () => {
    expect(deveDesistir(0, agora, agora)).toBe(false)
    expect(deveDesistir(MAX_TENTATIVAS - 1, agora - 1000, agora)).toBe(false)
  })

  it('desiste ao atingir o teto de tentativas', () => {
    expect(deveDesistir(MAX_TENTATIVAS, agora, agora)).toBe(true)
  })

  it('desiste quando a linha passa da idade máxima, mesmo com poucas tentativas', () => {
    expect(deveDesistir(1, agora - IDADE_MAX_MS - 1, agora)).toBe(true)
  })

  it('não desiste exatamente na idade máxima — a fronteira é exclusiva', () => {
    expect(deveDesistir(1, agora - IDADE_MAX_MS, agora)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/retentativa.spec.ts`
Expected: FAIL — `Failed to resolve import "@/lib/retentativa"`.

- [ ] **Step 3: Criar o módulo partilhado**

```ts
// src/lib/retentativa.ts
const DEGRAUS_MIN = [1, 5, 15, 30, 60, 120, 360, 720]

export const MAX_TENTATIVAS = 8

export const IDADE_MAX_MS = 7 * 24 * 60 * 60 * 1000

export function backoff(tentativas: number): number {
  const i = Math.min(Math.max(tentativas, 0), DEGRAUS_MIN.length - 1)
  return DEGRAUS_MIN[i] * 60_000
}

export function deveDesistir(tentativas: number, criadoEmMs: number, agoraMs: number): boolean {
  if (tentativas >= MAX_TENTATIVAS) return true
  return agoraMs - criadoEmMs > IDADE_MAX_MS
}
```

- [ ] **Step 4: Fazer `nucleo.ts` reexportar em vez de definir**

Em `src/server/webhook/nucleo.ts`, apagar as linhas 5 a 9 (a constante `DEGRAUS_MIN` e a função `backoff`) e pôr no lugar:

```ts
export { backoff } from '@/lib/retentativa'
```

- [ ] **Step 5: Rodar a suíte inteira e confirmar que nada quebrou**

Run: `pnpm test`
Expected: PASS — os 9 testes novos de retentativa mais toda a suíte da calculadora, sem regressão.

- [ ] **Step 6: Confirmar que a tipagem continua limpa**

Run: `pnpm build`
Expected: build conclui sem erro de tipo. `src/server/webhook/entrega.ts` importa `backoff` de `nucleo` e continua a resolver pela reexportação.

- [ ] **Step 7: Commit**

```bash
git add src/lib/retentativa.ts src/server/webhook/nucleo.ts tests/email/retentativa.spec.ts
git commit -m "Extrai a política de retentativa para um módulo partilhado"
```

---

### Task 5: Modelos padrão e montagem da mensagem

**Files:**
- Create: `src/lib/email/padroes.ts`, `src/lib/email/envelope.ts`
- Test: `tests/email/padroes.spec.ts`, `tests/email/envelope.spec.ts`

**Interfaces:**
- Consumes: `TipoModelo`, `TIPOS`, `CAMPOS` (Task 1); `renderizarHtml`, `renderizarTexto` (Task 2); `ConfigSmtp` (Task 3).
- Produces:
  - `interface Modelo { assunto: string; html: string }`
  - `const PADROES: Record<TipoModelo, Modelo>`
  - `interface Envelope { de: string; para: string; assunto: string; html: string; texto: string }`
  - `function montarEnvelope(config: ConfigSmtp, para: string, modelo: Modelo, valores: Record<string, string>): Envelope`
  - `function htmlParaTexto(html: string): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/email/padroes.spec.ts
import { describe, it, expect } from 'vitest'
import { PADROES } from '@/lib/email/padroes'
import { TIPOS, CAMPOS } from '@/lib/email/tipos'

const CAMPO = /\[([A-Z][A-Z_]*)\]/g

describe('modelos padrão', () => {
  it('existe um padrão para cada tipo, e nenhum a mais', () => {
    expect(Object.keys(PADROES).sort()).toEqual([...TIPOS].sort())
  })

  it('todo padrão tem assunto e corpo não vazios', () => {
    for (const tipo of TIPOS) {
      expect(PADROES[tipo].assunto.trim().length).toBeGreaterThan(0)
      expect(PADROES[tipo].html.trim().length).toBeGreaterThan(0)
    }
  })

  it('nenhum padrão cita campo que o tipo dele não oferece', () => {
    for (const tipo of TIPOS) {
      const { assunto, html } = PADROES[tipo]
      const citados = [...`${assunto} ${html}`.matchAll(CAMPO)].map((m) => m[1])
      for (const campo of citados) expect(CAMPOS[tipo]).toContain(campo)
    }
  })

  it('os dois e-mails com senha temporária de facto a mostram', () => {
    expect(PADROES.boas_vindas.html).toContain('[TEMP_PASSWORD]')
    expect(PADROES.recuperacao_senha.html).toContain('[TEMP_PASSWORD]')
  })

  it('nenhum padrão vaza senha temporária para o assunto', () => {
    for (const tipo of TIPOS) expect(PADROES[tipo].assunto).not.toContain('[TEMP_PASSWORD]')
  })
})
```

```ts
// tests/email/envelope.spec.ts
import { describe, it, expect } from 'vitest'
import { montarEnvelope, htmlParaTexto } from '@/lib/email/envelope'
import type { ConfigSmtp } from '@/lib/email/smtp'

const CONFIG: ConfigSmtp = {
  host: 'smtp.exemplo.com',
  porta: 587,
  seguro: false,
  usuario: 'u',
  senha: 's',
  remetente: 'GPS <nao-responda@exemplo.com>',
}

describe('htmlParaTexto', () => {
  it('remove marcação e devolve o texto legível', () => {
    expect(htmlParaTexto('<p>Olá <b>Ana</b></p>')).toBe('Olá Ana')
  })

  it('vira quebra de linha em <br> e </p>', () => {
    expect(htmlParaTexto('<p>um</p><p>dois</p>')).toBe('um\ndois')
    expect(htmlParaTexto('um<br>dois')).toBe('um\ndois')
  })

  it('desfaz as entidades que o escape produziu', () => {
    expect(htmlParaTexto('<p>Bar &amp; Cia &lt;x&gt;</p>')).toBe('Bar & Cia <x>')
  })

  it('colapsa espaços e apara as pontas', () => {
    expect(htmlParaTexto('  <p>  a   b  </p>  ')).toBe('a b')
  })
})

describe('montarEnvelope', () => {
  const modelo = { assunto: 'Bem-vindo, [MEMBER_NAME]', html: '<p>Olá [MEMBER_NAME]</p>' }

  it('usa o remetente da configuração e o destinatário dado', () => {
    const e = montarEnvelope(CONFIG, 'ana@exemplo.com', modelo, { MEMBER_NAME: 'Ana' })
    expect(e.de).toBe('GPS <nao-responda@exemplo.com>')
    expect(e.para).toBe('ana@exemplo.com')
  })

  it('renderiza o assunto SEM escapar e o corpo COM escape', () => {
    const e = montarEnvelope(CONFIG, 'a@b.c', modelo, { MEMBER_NAME: 'Bar & Cia' })
    expect(e.assunto).toBe('Bem-vindo, Bar & Cia')
    expect(e.html).toBe('<p>Olá Bar &amp; Cia</p>')
  })

  it('deriva a alternativa em texto do corpo já renderizado', () => {
    const e = montarEnvelope(CONFIG, 'a@b.c', modelo, { MEMBER_NAME: 'Bar & Cia' })
    expect(e.texto).toBe('Olá Bar & Cia')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm vitest run tests/email/padroes.spec.ts tests/email/envelope.spec.ts`
Expected: FAIL — módulos `@/lib/email/padroes` e `@/lib/email/envelope` não resolvem.

- [ ] **Step 3: Implementar os padrões**

```ts
// src/lib/email/padroes.ts
import type { TipoModelo } from '@/lib/email/tipos'

export interface Modelo {
  assunto: string
  html: string
}

function moldura(miolo: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;max-width:560px">',
    miolo,
    '<p style="color:#7b8794;font-size:13px">Esta mensagem foi enviada automaticamente. Não responda a este endereço.</p>',
    '</div>',
  ].join('')
}

function botao(url: string, rotulo: string): string {
  return `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1f2933;color:#ffffff;text-decoration:none;border-radius:6px">${rotulo}</a></p>`
}

export const PADROES: Record<TipoModelo, Modelo> = {
  boas_vindas: {
    assunto: 'Seu acesso está pronto, [MEMBER_NAME]',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua conta foi criada. Entre com o e-mail <strong>[MEMBER_EMAIL]</strong> e a senha temporária abaixo:</p>' +
        '<p style="font-size:20px;font-weight:600;letter-spacing:1px">[TEMP_PASSWORD]</p>' +
        '<p>Ela vale por 7 dias, e o sistema pedirá que você defina uma senha sua no primeiro acesso.</p>' +
        botao('[LOGIN_URL]', 'Entrar'),
    ),
  },
  recuperacao_senha: {
    assunto: 'Sua senha temporária',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Você pediu para recuperar o acesso. Use a senha temporária abaixo:</p>' +
        '<p style="font-size:20px;font-weight:600;letter-spacing:1px">[TEMP_PASSWORD]</p>' +
        '<p>Ela vale por 7 dias. Sua senha anterior continua funcionando, caso você se lembre dela.</p>' +
        botao('[LOGIN_URL]', 'Entrar'),
    ),
  },
  entrega_produto: {
    assunto: '[PRODUCT_NAME] liberado para você',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua compra de <strong>[OFFER_NAME]</strong> foi confirmada e <strong>[PRODUCT_NAME]</strong> já está liberado na sua conta.</p>' +
        '<p>Seu acesso vale até <strong>[EXPIRES_AT]</strong>.</p>' +
        botao('[TOOL_URL]', 'Abrir a ferramenta'),
    ),
  },
  pagamento_recebido: {
    assunto: 'Recebemos seu pagamento',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Recebemos o pagamento de <strong>[OFFER_NAME]</strong> no valor de <strong>[VALUE]</strong>.</p>' +
        '<p>Seu acesso a <strong>[PRODUCT_NAME]</strong> segue ativo até <strong>[EXPIRES_AT]</strong>.</p>' +
        '<p style="color:#7b8794;font-size:13px">Transação [TRANSACTION]</p>' +
        botao('[LOGIN_URL]', 'Acessar minha conta'),
    ),
  },
}
```

- [ ] **Step 4: Implementar o envelope**

```ts
// src/lib/email/envelope.ts
import { renderizarHtml, renderizarTexto } from '@/lib/email/merge'
import type { Modelo } from '@/lib/email/padroes'
import type { ConfigSmtp } from '@/lib/email/smtp'

export interface Envelope {
  de: string
  para: string
  assunto: string
  html: string
  texto: string
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

export function htmlParaTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entidade) => ENTIDADES[entidade])
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '')
    .join('\n')
}

export function montarEnvelope(
  config: ConfigSmtp,
  para: string,
  modelo: Modelo,
  valores: Record<string, string>,
): Envelope {
  const html = renderizarHtml(modelo.html, valores)
  return {
    de: config.remetente,
    para,
    assunto: renderizarTexto(modelo.assunto, valores),
    html,
    texto: htmlParaTexto(html),
  }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm vitest run tests/email/padroes.spec.ts tests/email/envelope.spec.ts`
Expected: PASS, 12 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/padroes.ts src/lib/email/envelope.ts tests/email/padroes.spec.ts tests/email/envelope.spec.ts
git commit -m "Escreve os quatro modelos padrão e a montagem do envelope"
```

---

### Task 6: Migration `0063` e a guarda de idempotência

**Files:**
- Create: `supabase/migrations/0063_email_transacional.sql`
- Test: `tests/migracoes/idempotencia.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `public.modelos_email` e `public.emails_fila`; RPC `public.reservar_emails(int, interval)`.

**Por que o teste é um analisador do arquivo SQL:** não há Postgres sob teste, mas a regra que mais dói neste produto é verificável por leitura — migration não idempotente derruba o boot de **toda** instalação. O teste varre as migrations da `0063` para cima (as anteriores são história e usam formas antigas).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/migracoes/idempotencia.spec.ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
const PRIMEIRA_NOVA = 63

const novas = readdirSync(DIR)
  .filter((nome) => nome.endsWith('.sql'))
  .filter((nome) => Number(nome.slice(0, 4)) >= PRIMEIRA_NOVA)
  .sort()

describe('migrations novas aguentam rodar duas vezes', () => {
  it('existe ao menos uma migration nova para verificar', () => {
    expect(novas.length).toBeGreaterThan(0)
  })

  describe.each(novas)('%s', (nome) => {
    const sql = readFileSync(`${DIR}/${nome}`, 'utf8')
    const semComentario = sql.replace(/^\s*--.*$/gm, '')

    it('não cria tabela sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('não cria índice sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('não acrescenta coluna sem `if not exists`', () => {
      const cruas = [...semComentario.matchAll(/add\s+column\s+(?!if\s+not\s+exists)/gi)]
      expect(cruas.map((m) => m[0])).toEqual([])
    })

    it('embrulha `create policy` num bloco do-$$, que é onde a segunda passada falharia', () => {
      const politicas = (semComentario.match(/create\s+policy/gi) ?? []).length
      const blocos = (semComentario.match(/do\s+\$\$/gi) ?? []).length
      if (politicas > 0) expect(blocos).toBeGreaterThan(0)
    })

    it('não usa `create policy` fora de bloco, na coluna zero', () => {
      expect(semComentario).not.toMatch(/^create\s+policy/im)
    })

    it('nomeia toda restrição `check`', () => {
      const anonimas = [...semComentario.matchAll(/add\s+check\s*\(/gi)]
      expect(anonimas.map((m) => m[0])).toEqual([])
    })

    it('concede privilégio aos três papéis em toda tabela que cria', () => {
      const criadas = [...semComentario.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)]
        .map((m) => m[1])
      for (const tabela of criadas) {
        expect(semComentario).toMatch(new RegExp(`grant\\s+all\\s+on\\s+table\\s+public\\.${tabela}`, 'i'))
      }
    })

    it('liga row level security em toda tabela que cria', () => {
      const criadas = [...semComentario.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)]
        .map((m) => m[1])
      for (const tabela of criadas) {
        expect(semComentario).toMatch(
          new RegExp(`alter\\s+table\\s+public\\.${tabela}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
        )
      }
    })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/migracoes/idempotencia.spec.ts`
Expected: FAIL — `expect(novas.length).toBeGreaterThan(0)` falha, porque a `0063` ainda não existe.

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/0063_email_transacional.sql — modelos de e-mail e a fila de envio.
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Migration que falha = container que NÃO SOBE, em toda instalação:
-- o CRM reaplica no boot qualquer migration que não encontre registrada.
--
-- 🔴 SEM SEED. Os quatro modelos padrão vivem em src/lib/email/padroes.ts e a linha aqui só
-- nasce quando o dono edita. Assim nenhum workspace precisa ser semeado — nem os que já
-- existem, nem os que nascerem depois.

-- == modelos ================================================================
create table if not exists public.modelos_email (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  tipo          text not null,
  assunto       text not null,
  html          text not null,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (workspace_id, tipo)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'modelos_email_tipo_dominio_check'
      and conrelid = 'public.modelos_email'::regclass
  ) then
    alter table public.modelos_email
      add constraint modelos_email_tipo_dominio_check
      check (tipo in ('boas_vindas','recuperacao_senha','entrega_produto','pagamento_recebido'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'modelos_email_set_atualizado'
      and tgrelid = 'public.modelos_email'::regclass
  ) then
    create trigger modelos_email_set_atualizado before update on public.modelos_email
      for each row execute function public.set_atualizado_em();
  end if;
end $$;

alter table public.modelos_email enable row level security;
grant all on table public.modelos_email to anon, authenticated, service_role;

-- 🔴 NENHUMA policy para `authenticated`: o navegador não lê nem escreve esta tabela. Tudo
-- passa por server action com service-role, depois de conferir quem pede.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'modelos_email'
      and policyname = 'modelos_email_service_role'
  ) then
    create policy modelos_email_service_role on public.modelos_email
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- == fila ===================================================================
-- Forma copiada de eventos_webhook (0007), incluindo o índice parcial: sem ele a fila varre a
-- tabela inteira a cada batida do relógio, e o sintoma só aparece na instalação com volume.
--
-- 🔴 O assunto e o HTML vão RENDERIZADOS para a fila. O e-mail enviado é o que o modelo dizia
-- no momento em que o evento aconteceu, e editar um modelo não reescreve o que está por enviar.
create table if not exists public.emails_fila (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  destinatario      text not null,
  assunto           text not null,
  html              text not null,
  criado_em         timestamptz not null default now(),
  enviado_em        timestamptz,
  tentativas        int not null default 0,
  proxima_tentativa timestamptz not null default now(),
  ultimo_erro       text,
  desistido_em      timestamptz
);

create index if not exists emails_fila_pendentes_idx
  on public.emails_fila (proxima_tentativa)
  where enviado_em is null and desistido_em is null;

alter table public.emails_fila enable row level security;
grant all on table public.emails_fila to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emails_fila'
      and policyname = 'emails_fila_service_role'
  ) then
    create policy emails_fila_service_role on public.emails_fila
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- == reserva ================================================================
-- `for update skip locked` é o que impede duas batidas concorrentes de enviarem o mesmo
-- e-mail duas vezes. Mesma forma de public.reservar_eventos (0007:105).
create or replace function public.reservar_emails(p_limite int, p_reserva interval default interval '2 minutes')
returns setof public.emails_fila language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.emails_fila e
    set proxima_tentativa = now() + p_reserva
  where e.id in (
    select id from public.emails_fila
    where enviado_em is null and desistido_em is null and proxima_tentativa <= now()
    order by criado_em
    limit p_limite
    for update skip locked
  )
  returning e.*;
end $$;

revoke all on function public.reservar_emails(int, interval) from public, anon, authenticated;
grant execute on function public.reservar_emails(int, interval) to service_role;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/migracoes/idempotencia.spec.ts`
Expected: PASS — 1 teste de presença mais 8 por arquivo, sobre a `0063`.

- [ ] **Step 5: Provar que a guarda de facto pega o erro que ela existe para pegar**

Trocar, temporariamente, `create table if not exists public.emails_fila` por `create table public.emails_fila` e rodar de novo.
Expected: FAIL em "não cria tabela sem `if not exists`". **Desfazer a mudança** e confirmar que volta a PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0063_email_transacional.sql tests/migracoes/idempotencia.spec.ts
git commit -m "Cria as tabelas de modelo e fila de e-mail, com guarda de idempotência"
```

---

### Task 7: Transporte SMTP

**Files:**
- Modify: `package.json`
- Create: `src/server/email/enviar.ts`
- Test: `tests/email/enviar.spec.ts`

**Interfaces:**
- Consumes: `lerConfigSmtp`, `ConfigSmtp` (Task 3); `Envelope` (Task 5).
- Produces: `type ResultadoEnvio = { ok: true } | { erro: string }`, `function enviarEnvelope(envelope: Envelope, config: ConfigSmtp): Promise<ResultadoEnvio>`, `function configAtual(): LeituraSmtp`.

**Injeção de dependência:** `enviarEnvelope` recebe a `config` em vez de a ler do ambiente. É o que torna o módulo testável sem SMTP e sem variáveis globais.

- [ ] **Step 1: Instalar a dependência**

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Confirmar que só `package.json` e `pnpm-lock.yaml` mudaram: `git status --porcelain`.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/email/enviar.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMail = vi.fn()
const createTransport = vi.fn(() => ({ sendMail }))

vi.mock('nodemailer', () => ({ default: { createTransport } }))

import { enviarEnvelope } from '@/server/email/enviar'
import type { ConfigSmtp } from '@/lib/email/smtp'

const CONFIG: ConfigSmtp = {
  host: 'smtp.exemplo.com',
  porta: 587,
  seguro: false,
  usuario: 'u',
  senha: 's',
  remetente: 'GPS <nao-responda@exemplo.com>',
}

const ENVELOPE = {
  de: 'GPS <nao-responda@exemplo.com>',
  para: 'ana@exemplo.com',
  assunto: 'Oi',
  html: '<p>Oi</p>',
  texto: 'Oi',
}

beforeEach(() => {
  sendMail.mockReset()
  createTransport.mockClear()
})

describe('enviarEnvelope', () => {
  it('monta o transporte com host, porta, segurança e credenciais', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    await enviarEnvelope(ENVELOPE, CONFIG)
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.exemplo.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 's' },
    })
  })

  it('traduz o envelope para os campos do nodemailer', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    await enviarEnvelope(ENVELOPE, CONFIG)
    expect(sendMail).toHaveBeenCalledWith({
      from: 'GPS <nao-responda@exemplo.com>',
      to: 'ana@exemplo.com',
      subject: 'Oi',
      html: '<p>Oi</p>',
      text: 'Oi',
    })
  })

  it('devolve ok quando o envio conclui', async () => {
    sendMail.mockResolvedValue({ messageId: '1' })
    expect(await enviarEnvelope(ENVELOPE, CONFIG)).toEqual({ ok: true })
  })

  it('devolve erro em vez de lançar quando o SMTP falha', async () => {
    sendMail.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:587'))
    const r = await enviarEnvelope(ENVELOPE, CONFIG)
    expect(r).toHaveProperty('erro')
  })

  it('não deixa a senha SMTP vazar na mensagem de erro', async () => {
    sendMail.mockRejectedValue(new Error('auth falhou para u com senha s'))
    const r = await enviarEnvelope(ENVELOPE, { ...CONFIG, senha: 'super-secreta' })
    if ('ok' in r) throw new Error('inesperado')
    expect(r.erro).not.toContain('super-secreta')
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/enviar.spec.ts`
Expected: FAIL — `Failed to resolve import "@/server/email/enviar"`.

- [ ] **Step 4: Implementar o mínimo**

```ts
// src/server/email/enviar.ts
import 'server-only'
import nodemailer from 'nodemailer'
import { lerConfigSmtp, type ConfigSmtp, type LeituraSmtp } from '@/lib/email/smtp'
import type { Envelope } from '@/lib/email/envelope'

const TIMEOUT_MS = 15_000

export type ResultadoEnvio = { ok: true } | { erro: string }

export function configAtual(): LeituraSmtp {
  return lerConfigSmtp(process.env)
}

export async function enviarEnvelope(
  envelope: Envelope,
  config: ConfigSmtp,
): Promise<ResultadoEnvio> {
  try {
    const transporte = nodemailer.createTransport({
      host: config.host,
      port: config.porta,
      secure: config.seguro,
      auth: { user: config.usuario, pass: config.senha },
    })
    await transporte.sendMail({
      from: envelope.de,
      to: envelope.para,
      subject: envelope.assunto,
      html: envelope.html,
      text: envelope.texto,
    })
    return { ok: true }
  } catch (err) {
    const cru = err instanceof Error ? err.message : String(err)
    const limpo = config.senha === '' ? cru : cru.split(config.senha).join('***')
    return { erro: limpo.slice(0, 300) }
  }
}
```

Nota: `TIMEOUT_MS` fica declarado para a Task 8 o usar no orçamento do braço; o nodemailer tem timeouts próprios por conexão.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/email/enviar.spec.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/server/email/enviar.ts tests/email/enviar.spec.ts
git commit -m "Envia e-mail por SMTP com nodemailer, sem vazar a senha em erro"
```

---

### Task 8: Fila — enfileirar e drenar

**Files:**
- Create: `src/server/email/modelos.ts`, `src/server/email/fila.ts`
- Modify: `src/lib/orcamento-tick.ts:11-33`, `src/app/api/interno/tick/route.ts`
- Test: `tests/email/orcamento-email.spec.ts`

**Interfaces:**
- Consumes: `TipoModelo` (Task 1); `PADROES`, `Modelo`, `montarEnvelope` (Task 5); `backoff`, `deveDesistir` (Task 4); `enviarEnvelope`, `configAtual` (Task 7); `reservar_emails` (Task 6).
- Produces:
  - `function lerModelo(workspaceId: string, tipo: TipoModelo): Promise<Modelo>`
  - `function gravarModelo(workspaceId: string, tipo: TipoModelo, modelo: Modelo): Promise<void>`
  - `function enfileirar(args: { workspaceId: string; tipo: TipoModelo; para: string; valores: Record<string, string> }): Promise<{ ok: true } | { erro: string }>`
  - `function drenarEmail(orcamento?: Orcamento): Promise<{ enviados: number; falhas: number; pulados: number }>`

**A chave do desenho:** `enfileirar` **renderiza na hora** e grava assunto e HTML já prontos. A fila não guarda o tipo nem os valores — guarda a mensagem. É o que garante que editar um modelo não reescreve o que está por enviar (spec §8.4).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/email/orcamento-email.spec.ts
import { describe, it, expect } from 'vitest'
import { criarOrcamento, PIORES_CASOS, PORTOES } from '@/lib/orcamento-tick'

describe('braço de e-mail no orçamento do tick', () => {
  it('declara o pior caso do braço de e-mail', () => {
    expect(PIORES_CASOS.email).toBeGreaterThan(0)
  })

  it('declara o portão do braço de e-mail', () => {
    expect(PORTOES.email).toBeGreaterThan(0)
  })

  it('cabe no início do tick', () => {
    const o = criarOrcamento(1000, () => 1000)
    expect(o.cabe('email')).toBe(true)
  })

  it('não cabe quando o tick está no fim', () => {
    const o = criarOrcamento(1000, () => 1000 + 44_000)
    expect(o.cabe('email')).toBe(false)
  })

  it('a fatia do braço nunca passa do que resta', () => {
    const o = criarOrcamento(1000, () => 1000 + 40_000)
    expect(o.fatiaPara('email')).toBeLessThanOrEqual(o.restaMs())
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/email/orcamento-email.spec.ts`
Expected: FAIL — `PIORES_CASOS.email` é `undefined`, e o TypeScript acusa `'email'` fora de `NomeDeBraco`.

- [ ] **Step 3: Abrir o braço no orçamento**

Em `src/lib/orcamento-tick.ts`, acrescentar a entrada em `PIORES_CASOS` (junto das que já existem) e a linha correspondente em `PORTOES`:

```ts
// dentro de PIORES_CASOS
  email: 8_000,
```

```ts
// dentro de PORTOES
  email: PIORES_CASOS.email,
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/email/orcamento-email.spec.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Implementar a leitura e gravação de modelo**

```ts
// src/server/email/modelos.ts
import 'server-only'
import { admin } from '@/server/supabase'
import { PADROES, type Modelo } from '@/lib/email/padroes'
import type { TipoModelo } from '@/lib/email/tipos'

export async function lerModelo(workspaceId: string, tipo: TipoModelo): Promise<Modelo> {
  const { data } = await admin()
    .from('modelos_email')
    .select('assunto, html, ativo')
    .eq('workspace_id', workspaceId)
    .eq('tipo', tipo)
    .maybeSingle()

  const linha = data as { assunto: string; html: string; ativo: boolean } | null
  if (!linha || !linha.ativo) return PADROES[tipo]
  return { assunto: linha.assunto, html: linha.html }
}

export async function gravarModelo(
  workspaceId: string,
  tipo: TipoModelo,
  modelo: Modelo,
): Promise<void> {
  const { error } = await admin()
    .from('modelos_email')
    .upsert(
      {
        workspace_id: workspaceId,
        tipo,
        assunto: modelo.assunto,
        html: modelo.html,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,tipo' },
    )
  if (error) throw error
}
```

- [ ] **Step 6: Implementar a fila**

```ts
// src/server/email/fila.ts
import 'server-only'
import { criarOrcamento, type Orcamento } from '@/lib/orcamento-tick'
import { admin } from '@/server/supabase'
import { backoff, deveDesistir } from '@/lib/retentativa'
import { montarEnvelope, htmlParaTexto } from '@/lib/email/envelope'
import type { TipoModelo } from '@/lib/email/tipos'
import { lerModelo } from '@/server/email/modelos'
import { configAtual, enviarEnvelope } from '@/server/email/enviar'

const LIMITE_POR_TICK = 20

type LinhaFila = {
  id: string
  workspace_id: string
  destinatario: string
  assunto: string
  html: string
  criado_em: string
  tentativas: number
}

export async function enfileirar(args: {
  workspaceId: string
  tipo: TipoModelo
  para: string
  valores: Record<string, string>
}): Promise<{ ok: true } | { erro: string }> {
  const leitura = configAtual()
  if (!leitura.ok) return { erro: 'smtp_nao_configurado' }

  const modelo = await lerModelo(args.workspaceId, args.tipo)
  const envelope = montarEnvelope(leitura.config, args.para, modelo, args.valores)

  const { error } = await admin().from('emails_fila').insert({
    workspace_id: args.workspaceId,
    destinatario: envelope.para,
    assunto: envelope.assunto,
    html: envelope.html,
  })
  if (error) return { erro: 'falha_enfileirar' }
  return { ok: true }
}

export async function drenarEmail(
  orcamento: Orcamento = criarOrcamento(Date.now()),
): Promise<{ enviados: number; falhas: number; pulados: number }> {
  if (!orcamento.cabe('email')) return { enviados: 0, falhas: 0, pulados: 0 }

  const leitura = configAtual()
  if (!leitura.ok) return { enviados: 0, falhas: 0, pulados: 0 }

  const cli = admin()
  const { data, error } = await cli.rpc('reservar_emails', { p_limite: LIMITE_POR_TICK })
  if (error) throw error
  const linhas = (data ?? []) as LinhaFila[]

  let enviados = 0
  let falhas = 0
  let pulados = 0

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (!orcamento.cabe('email')) {
      pulados += linhas.length - i
      break
    }

    const resultado = await enviarEnvelope(
      {
        de: leitura.config.remetente,
        para: linha.destinatario,
        assunto: linha.assunto,
        html: linha.html,
        texto: htmlParaTexto(linha.html),
      },
      leitura.config,
    )

    if ('ok' in resultado) {
      await cli
        .from('emails_fila')
        .update({ enviado_em: new Date().toISOString(), ultimo_erro: null })
        .eq('id', linha.id)
      enviados++
      continue
    }

    const tentativas = linha.tentativas + 1
    const desiste = deveDesistir(tentativas, new Date(linha.criado_em).getTime(), Date.now())
    await cli
      .from('emails_fila')
      .update({
        tentativas,
        ultimo_erro: resultado.erro,
        proxima_tentativa: new Date(Date.now() + backoff(tentativas)).toISOString(),
        desistido_em: desiste ? new Date().toISOString() : null,
      })
      .eq('id', linha.id)
    falhas++
  }

  return { enviados, falhas, pulados }
}
```

- [ ] **Step 7: Ligar o braço ao relógio**

Em `src/app/api/interno/tick/route.ts`, acrescentar o import junto dos outros:

```ts
import { drenarEmail } from '@/server/email/fila'
```

e, depois da chamada a `drenarFila(orcamento)`, acrescentar:

```ts
  const email = await drenarEmail(orcamento).catch((err) => {
    console.warn('[tick] braço de e-mail falhou:', detalheSeguro(err))
    return { enviados: 0, falhas: 0, pulados: 0 }
  })
```

O `.catch` é obrigatório: um braço que lança derruba o tick inteiro, e é esse mesmo tick que revalida a licença. Incluir `email` no objeto que a rota devolve, junto dos outros braços.

- [ ] **Step 8: Rodar a suíte inteira e o build**

Run: `pnpm test && pnpm build`
Expected: PASS em tudo; build sem erro de tipo.

- [ ] **Step 9: Commit**

```bash
git add src/server/email/modelos.ts src/server/email/fila.ts src/lib/orcamento-tick.ts src/app/api/interno/tick/route.ts tests/email/orcamento-email.spec.ts
git commit -m "Enfileira e-mail já renderizado e drena a fila no relógio interno"
```

---

### Task 9: Tela de modelos na aba Servidor

**Files:**
- Create: `src/app/(app)/config/acoes-email.ts`, `src/app/(app)/config/ModelosEmailCard.tsx`
- Modify: `src/app/(app)/config/page.tsx`
- Modify: `.env.example`, `docs/DEPLOY.md`

**Interfaces:**
- Consumes: `TIPOS`, `CAMPOS`, `TipoModelo`, `ehTipoConhecido` (Task 1); `PADROES`, `Modelo` (Task 5); `lerModelo`, `gravarModelo` (Task 8); `enfileirar` (Task 8); `configAtual` (Task 7).
- Produces: `function lerModelosEmail(): Promise<VistaModelos | { erro: string }>`, `function salvarModeloEmail(tipo: string, assunto: string, html: string): Promise<{ ok: true } | { erro: string }>`, `function enviarTeste(tipo: string): Promise<{ ok: true } | { erro: string }>`.

**Por que na aba Servidor e não numa aba nova:** SMTP é configuração de deploy, e a aba Servidor já existe e já é gated por `ehDonoDoDeploy()` (`src/app/(app)/config/page.tsx:57`). Uma aba nova entraria em `src/lib/config-abas.ts` e acoplaria este plano ao das vendas sem ganho.

- [ ] **Step 1: Escrever as ações de servidor**

```ts
// src/app/(app)/config/acoes-email.ts
'use server'

import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { criarClienteServidor } from '@/server/supabase-session'
import { ehDonoDoDeploy } from '@/server/auth/dono-deploy'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { TIPOS, CAMPOS, ehTipoConhecido, type TipoModelo } from '@/lib/email/tipos'
import { PADROES } from '@/lib/email/padroes'
import { lerModelo, gravarModelo } from '@/server/email/modelos'
import { enfileirar } from '@/server/email/fila'
import { configAtual } from '@/server/email/enviar'

export interface ItemModelo {
  tipo: TipoModelo
  assunto: string
  html: string
  campos: readonly string[]
  ehPadrao: boolean
}

export interface VistaModelos {
  smtpConfigurado: boolean
  faltando: string[]
  itens: ItemModelo[]
}

async function workspaceDoDono(): Promise<string | null> {
  if (!(await ehDonoDoDeploy())) return null
  const cliente = await criarClienteServidor()
  return resolverWorkspaceAtivo({ cliente })
}

export async function lerModelosEmail(): Promise<VistaModelos | { erro: string }> {
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }

  const leitura = configAtual()
  const itens: ItemModelo[] = []
  for (const tipo of TIPOS) {
    const modelo = await lerModelo(ws, tipo)
    itens.push({
      tipo,
      assunto: modelo.assunto,
      html: modelo.html,
      campos: CAMPOS[tipo],
      ehPadrao: modelo.assunto === PADROES[tipo].assunto && modelo.html === PADROES[tipo].html,
    })
  }

  return {
    smtpConfigurado: leitura.ok,
    faltando: leitura.ok ? [] : leitura.faltando,
    itens,
  }
}

export async function salvarModeloEmail(
  tipo: string,
  assunto: string,
  html: string,
): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }
  if (!ehTipoConhecido(tipo)) return { erro: 'tipo_desconhecido' }
  if (assunto.trim() === '' || html.trim() === '') return { erro: 'campos_obrigatorios' }

  await gravarModelo(ws, tipo, { assunto, html })
  return { ok: true }
}

export async function enviarTeste(tipo: string): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }
  if (!ehTipoConhecido(tipo)) return { erro: 'tipo_desconhecido' }

  const cliente = await criarClienteServidor()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user?.email) return { erro: 'sem_email' }

  const valores: Record<string, string> = {}
  for (const campo of CAMPOS[tipo]) valores[campo] = `«${campo}»`
  valores.MEMBER_EMAIL = user.email
  valores.MEMBER_NAME = 'Teste'

  return enfileirar({ workspaceId: ws, tipo, para: user.email, valores })
}
```

- [ ] **Step 2: Escrever o card**

```tsx
// src/app/(app)/config/ModelosEmailCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { salvarModeloEmail, enviarTeste, type VistaModelos } from './acoes-email'
import estilos from './config.module.css'

const ROTULO: Record<string, string> = {
  boas_vindas: 'Boas-vindas (cadastro novo)',
  recuperacao_senha: 'Recuperação de senha',
  entrega_produto: 'Produto liberado',
  pagamento_recebido: 'Pagamento recebido',
}

export default function ModelosEmailCard({ vista }: { vista: VistaModelos }) {
  const [abertoEm, setAbertoEm] = useState<string | null>(null)

  return (
    <section className={estilos.card}>
      <h2 className={estilos.cardTitulo}>Modelos de e-mail</h2>

      {!vista.smtpConfigurado && (
        <p className={estilos.aviso}>
          O CRM ainda não envia e-mail. Configure no painel do servidor:{' '}
          <strong>{vista.faltando.join(', ')}</strong>. Sem elas nada quebra — os modelos
          continuam editáveis e nada é enviado.
        </p>
      )}

      {vista.itens.map((item) => (
        <div key={item.tipo} className={estilos.linha}>
          <button
            type="button"
            className={estilos.destino}
            onClick={() => setAbertoEm(abertoEm === item.tipo ? null : item.tipo)}
          >
            {ROTULO[item.tipo] ?? item.tipo}
            {item.ehPadrao && <span className={estilos.destinoMeta}>padrão</span>}
          </button>
          {abertoEm === item.tipo && (
            <Editor item={item} podeTestar={vista.smtpConfigurado} />
          )}
        </div>
      ))}
    </section>
  )
}

function Editor({
  item,
  podeTestar,
}: {
  item: VistaModelos['itens'][number]
  podeTestar: boolean
}) {
  const [assunto, setAssunto] = useState(item.assunto)
  const [html, setHtml] = useState(item.html)
  const [recado, setRecado] = useState('')
  const [pendente, comecar] = useTransition()

  function salvar() {
    comecar(async () => {
      const r = await salvarModeloEmail(item.tipo, assunto, html)
      setRecado('erro' in r ? `Não deu para salvar: ${r.erro}` : 'Salvo.')
    })
  }

  function testar() {
    comecar(async () => {
      const r = await enviarTeste(item.tipo)
      setRecado('erro' in r ? `Não deu para enviar: ${r.erro}` : 'Teste na fila. Chega em segundos.')
    })
  }

  return (
    <div className={estilos.editor}>
      <label htmlFor={`assunto-${item.tipo}`}>Assunto</label>
      <input
        id={`assunto-${item.tipo}`}
        value={assunto}
        onChange={(e) => setAssunto(e.target.value)}
      />

      <label htmlFor={`html-${item.tipo}`}>Corpo (HTML)</label>
      <textarea
        id={`html-${item.tipo}`}
        rows={12}
        value={html}
        onChange={(e) => setHtml(e.target.value)}
      />

      <p className={estilos.destinoSub}>
        Campos disponíveis neste modelo — copie para dentro do texto:
      </p>
      <ul className={estilos.chips}>
        {item.campos.map((campo) => (
          <li key={campo}>
            <code>[{campo}]</code>
          </li>
        ))}
      </ul>

      <div className={estilos.acoes}>
        <button type="button" onClick={salvar} disabled={pendente}>
          Salvar
        </button>
        <button type="button" onClick={testar} disabled={pendente || !podeTestar}>
          Enviar teste para mim
        </button>
      </div>

      {recado && <p className={estilos.recado}>{recado}</p>}
    </div>
  )
}
```

As classes de `config.module.css` usadas aqui (`editor`, `chips`, `acoes`, `recado`, `aviso`, `linha`) precisam existir — acrescentar as que faltarem, seguindo o estilo dos cards vizinhos (`MarcaCard.tsx`, `EquipeCard.tsx`).

- [ ] **Step 3: Ligar o card à aba Servidor**

Em `src/app/(app)/config/page.tsx`, junto das outras leituras condicionadas a `mostrarServidor`:

```ts
  const rModelos = mostrarServidor ? await lerModelosEmail() : null
  const modelos = rModelos && !('erro' in rModelos) ? rModelos : null
```

e, no JSX da aba Servidor, renderizar `{modelos && <ModelosEmailCard vista={modelos} />}` depois de `MarcaCard`.

- [ ] **Step 4: Documentar as variáveis**

Acrescentar ao `.env.example`:

```
# E-mail transacional (opcional). Sem estas, o CRM não envia e-mail e diz isso na tela.
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=
```

Em `docs/DEPLOY.md`, na linha 288-289, trocar "Nada é enviado por e-mail pelo CRM — ele roda no **seu** servidor e não assume que você tem um serviço de e-mail configurado." por uma redação que diga: o CRM **não envia e-mail até você configurar SMTP**; as seis variáveis são opcionais; sem elas nada quebra, e a tela de Configurações → Servidor mostra o que falta.

- [ ] **Step 5: Rodar a suíte e o build**

Run: `pnpm test && pnpm build`
Expected: PASS em tudo; build sem erro de tipo.

- [ ] **Step 6: Verificação manual, com SMTP de teste**

Subir o app com as seis variáveis apontando para um servidor de teste (Mailpit, Ethereal ou equivalente), abrir Configurações → Servidor, editar o assunto de **Boas-vindas**, salvar, clicar em **Enviar teste para mim** e confirmar que a mensagem chega com o assunto editado, com os campos substituídos por `«CAMPO»` e com o HTML preservado.
Depois, remover `SMTP_HOST` do ambiente, reiniciar e confirmar que o card mostra a variável em falta em vez dos botões de teste.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/config/acoes-email.ts" "src/app/(app)/config/ModelosEmailCard.tsx" "src/app/(app)/config/page.tsx" .env.example docs/DEPLOY.md
git commit -m "Dá ao dono do servidor a tela de modelos de e-mail"
```

---

## O que este plano NÃO entrega

Fica para o plano seguinte (vendas e acesso por compra), porque depende de colunas de `membros` que ele cria:

- a emissão de senha temporária e o segundo caminho do login (spec §8.5);
- a tela de recuperação de senha em `/recuperar`;
- quem, de facto, chama `enfileirar` com cada um dos quatro tipos.

Ao fim deste plano os quatro modelos existem, são editáveis, e o único disparo real é o botão **Enviar teste para mim**. Isso é de propósito: a fila e o transporte ficam provados antes de qualquer fluxo de negócio depender deles.
