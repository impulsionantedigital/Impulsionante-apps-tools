import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guarda da vitrine (§9.2 invertida na spec de 2026-09-22).
 *
 * 🔴 O QUE ESTE TESTE IMPEDE: a regra antiga era *"não existe vitrine do que o membro não tem"* —
 * `/ferramentas`, o `Rail` e a página do produto escondiam/redirecionavam todo produto no estado
 * `nunca`. A spec de 2026-09-22 inverteu isso de propósito: o catálogo aparece sempre, e o que o
 * acesso decide é o que a pessoa PODE FAZER, não o que ela VÊ.
 *
 * Quem ler a regra antiga num comentário e "consertar" o filtro de volta desfaz a feature em
 * silêncio — nenhum outro teste pega, porque as telas são server components que dependem de banco.
 * Daí esta guarda ser estática, como a de `fronteira-rsc.spec.ts`.
 */

const RAIZ = resolve(__dirname, '..', '..', 'src')
const ler = (...partes: string[]) => readFileSync(resolve(RAIZ, ...partes), 'utf8')

/**
 * O código sem os comentários. É indispensável aqui: os próprios comentários que proíbem o filtro
 * antigo o CITAM (`estado !== 'nunca'`) para avisar quem for mexer — e uma guarda que lesse o
 * texto cru acusaria o aviso em vez do defeito.
 */
function codigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '') // blocos /* ... */
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '')) // e o resto de cada linha
    .join('\n')
}

describe('vitrine — a inversão da §9.2 fica invertida', () => {
  it('a vitrine NÃO filtra o catálogo por acesso', () => {
    const txt = codigo(ler('app/(app)/ferramentas/page.tsx'))
    // 🔴 O filtro antigo da §9.2, em qualquer forma: `estado !== 'nunca'` ou um `.filter(...)`
    // que descarte quem não tem o produto. Foi assim que a vitrine escondia essas pessoas.
    expect(txt, 'a vitrine voltou a filtrar por acesso').not.toMatch(/estado\s*!==\s*'nunca'/)
    expect(txt, 'a vitrine voltou a filtrar por acesso').not.toMatch(/\.filter\([^;]*\bnunca\b/)
    // E o catálogo inteiro é desenhado: os cartões vêm de `PRODUTOS.map`.
    expect(ler('app/(app)/ferramentas/page.tsx')).toMatch(/PRODUTOS\.map/)
  })

  it('o menu lateral NÃO filtra o catálogo por acesso', () => {
    const txt = codigo(ler('components/shell/Rail.tsx'))
    expect(txt, 'o menu voltou a filtrar por acesso').not.toMatch(/estado\s*!==\s*'nunca'/)
    expect(txt, 'o menu voltou a filtrar por acesso').not.toMatch(/\.filter\([^;]*\bnunca\b/)
    expect(ler('components/shell/Rail.tsx')).toMatch(/PRODUTOS\.map/)
  })

  it('a página do produto NÃO redireciona quem nunca teve acesso', () => {
    const txt = ler('app/(app)/ferramentas/[calculadora]/page.tsx')
    // `redirect` saiu do import e do corpo; a menção que resta está dentro de um comentário.
    expect(txt).not.toMatch(/^\s*if\s*\(estado === 'nunca'\)\s*redirect\(/m)
    expect(txt).not.toMatch(/import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*'next\/navigation'/)
  })

  it('a página da detração respeita o acesso e mostra o aviso', () => {
    const txt = ler('app/(app)/ferramentas/detracao/[calculadora]/page.tsx')
    expect(txt).toMatch(/estadoDoProduto\(PRODUTO_ID\)/)
    expect(txt).toMatch(/const novo = ativo \?/)
    expect(txt).toMatch(/<AvisoAcesso produto=\{produto\} \/>/)
  })

  it('os gates de ESCRITA continuam de pé — abrir em leitura não abre buraco', () => {
    // Esta é a metade que torna a inversão segura: mostrar o card não libera nada.
    expect(ler('app/(app)/ferramentas/[calculadora]/novo/page.tsx')).toMatch(
      /estadoDoProduto\(produto\.id\)\)\s*!==\s*'ativo'\)\s*redirect\(/,
    )
    expect(ler('app/(app)/ferramentas/detracao/[calculadora]/novo/page.tsx')).toMatch(
      /estadoDoProduto\(PRODUTO_ID\)\)\s*!==\s*'ativo'\)\s*redirect\(/,
    )
    expect(ler('app/(app)/ferramentas/[calculadora]/[id]/page.tsx')).toMatch(/if\s*\(estado === 'nunca'\)\s*notFound\(\)/)
    expect(ler('app/(app)/ferramentas/detracao/[calculadora]/[id]/page.tsx')).toMatch(
      /if\s*\(estado === 'nunca'\)\s*notFound\(\)/,
    )
  })
})
