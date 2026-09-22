import { describe, it, expect } from 'vitest'
import { PREFIXO_CHECKOUT, checkoutDoProduto, nomeDaVariavelDeCheckout, PRODUTOS } from '@/lib/produtos/catalogo'

describe('nomeDaVariavelDeCheckout', () => {
  it('maiúsculas, com o hífen do slug trocado por sublinhado', () => {
    // 🔴 Nome de variável de ambiente não aceita hífen: `CHECKOUT_URL_CIC-2025` não é lido por
    // nenhum painel, e a variável "não existiria" sem erro nenhum.
    expect(nomeDaVariavelDeCheckout('cic-2025')).toBe('CHECKOUT_URL_CIC_2025')
    expect(nomeDaVariavelDeCheckout('recolhimento-noturno')).toBe('CHECKOUT_URL_RECOLHIMENTO_NOTURNO')
  })

  it('sem hífen, o nome sai intacto', () => {
    expect(nomeDaVariavelDeCheckout('contratos')).toBe('CHECKOUT_URL_CONTRATOS')
  })

  it('o prefixo é o único lugar que define o nome — nada de string solta espalhada', () => {
    expect(nomeDaVariavelDeCheckout('x')).toBe(`${PREFIXO_CHECKOUT}X`)
  })

  it('NÃO leva prefixo NEXT_PUBLIC_', () => {
    // Ele seria inlinado no bundle em tempo de BUILD, e o CRM roda em Docker: a variável do painel
    // só chegaria ao bundle se estivesse presente durante o `pnpm build` dentro da imagem. O aviso
    // de acesso é renderizado no servidor, então a leitura sem prefixo basta.
    expect(nomeDaVariavelDeCheckout('cic-2025')).not.toContain('NEXT_PUBLIC')
  })

  it('todo produto do catálogo tem um nome de variável válido', () => {
    for (const p of PRODUTOS) {
      const nome = nomeDaVariavelDeCheckout(p.slug)
      expect(nome).toMatch(/^[A-Z0-9_]+$/)
      expect(nome).toContain(PREFIXO_CHECKOUT)
    }
  })

  it('dois produtos diferentes nunca geram a mesma variável', () => {
    const nomes = PRODUTOS.map((p) => nomeDaVariavelDeCheckout(p.slug))
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})

describe('checkoutDoProduto', () => {
  it('devolve o endereço quando a variável existe', () => {
    expect(checkoutDoProduto('cic-2025', { CHECKOUT_URL_CIC_2025: 'https://pay.hotmart.com/ABC' })).toBe(
      'https://pay.hotmart.com/ABC',
    )
  })

  it('apara espaços em volta — colar no painel costuma trazer um', () => {
    expect(checkoutDoProduto('cic-2025', { CHECKOUT_URL_CIC_2025: '  https://pay.hotmart.com/ABC  ' })).toBe(
      'https://pay.hotmart.com/ABC',
    )
  })

  it('sem a variável: null, e o aviso sai sem botão', () => {
    expect(checkoutDoProduto('cic-2025', {})).toBeNull()
  })

  it('variável vazia ou só com espaços: null, como se não existisse', () => {
    // É o caso do `.env.example` copiado sem preencher — e tem de ser idêntico ao de não existir.
    expect(checkoutDoProduto('cic-2025', { CHECKOUT_URL_CIC_2025: '' })).toBeNull()
    expect(checkoutDoProduto('cic-2025', { CHECKOUT_URL_CIC_2025: '   ' })).toBeNull()
  })

  it('lê cada produto pela SUA variável, e não a de outro', () => {
    const env = { CHECKOUT_URL_CIC_2024: 'https://pay.hotmart.com/DO_2024' }
    expect(checkoutDoProduto('cic-2024', env)).toBe('https://pay.hotmart.com/DO_2024')
    expect(checkoutDoProduto('cic-2025', env)).toBeNull()
  })

  it('o nome do slug em minúsculas não é encontrado — o painel é case-sensitive', () => {
    expect(checkoutDoProduto('cic-2025', { checkout_url_cic_2025: 'https://x.com' })).toBeNull()
  })
})
