import { describe, it, expect } from 'vitest'
import { DURACOES } from '@/lib/vendas/duracao'
import { PRAZOS_DE_DEGUSTACAO } from '@/lib/vendas/degustacao'

/**
 * A configuração de produtos de uma oferta: cada produto é VENDA ou DEGUSTAÇÃO, nunca os dois.
 *
 * A regra vive na server action (`refine` do schema) e no banco (chave primária `oferta_id +
 * produto_id` da tabela `ofertas_produtos`). Aqui ela é reafirmada na forma de decisão pura, que é
 * o que os testes de tela e de processamento consultam.
 */
interface Configuracao {
  venda: string[]
  degustacao: string[]
  duracao: string
  diasDegustacao: number | null
}

type Problema =
  | 'sem_produto'
  | 'sem_produto_de_venda'
  | 'produto_em_dois_papeis'
  | 'degustacao_sem_dias'
  | 'dias_sem_degustacao'
  | 'dias_fora_da_lista'
  | 'duracao_invalida'

/** Validação espelhada da server action. Devolve a lista de problemas, vazia quando está válida. */
function validar(c: Configuracao): Problema[] {
  const problemas: Problema[] = []
  if ([...c.venda, ...c.degustacao].length === 0) problemas.push('sem_produto')
  // 🔴 Uma oferta só de degustação não vende nada, então não há venda para o webhook processar:
  // é recusada aqui, e não gravada para virar `oferta_invalida` na primeira compra real.
  if (c.degustacao.length > 0 && c.venda.length === 0) problemas.push('sem_produto_de_venda')
  // Só é possível repetir se a mesma lista trouxer o produto, ou se o produto estiver nos dois.
  if (new Set(c.venda).size !== c.venda.length || new Set(c.degustacao).size !== c.degustacao.length) {
    problemas.push('produto_em_dois_papeis')
  }
  const setVenda = new Set(c.venda)
  if (c.degustacao.some((p) => setVenda.has(p))) problemas.push('produto_em_dois_papeis')
  if (!(DURACOES as readonly string[]).includes(c.duracao)) problemas.push('duracao_invalida')
  if (c.degustacao.length > 0) {
    if (c.diasDegustacao === null) problemas.push('degustacao_sem_dias')
    else if (!(PRAZOS_DE_DEGUSTACAO as readonly number[]).includes(c.diasDegustacao)) problemas.push('dias_fora_da_lista')
  } else if (c.diasDegustacao !== null) {
    // Dias sem produto de degustação viram lixo na coluna: ninguém os lê, e confundem a auditoria.
    problemas.push('dias_sem_degustacao')
  }
  return problemas
}

const ok: Configuracao = { venda: ['a'], degustacao: [], duracao: 'anual', diasDegustacao: null }

describe('configuração de produtos da oferta', () => {
  it('o caso do cenário: dois vendidos por 12 meses e um brinde de 7 dias', () => {
    expect(
      validar({ venda: ['p1', 'p2'], degustacao: ['p3'], duracao: 'anual', diasDegustacao: 7 }),
    ).toEqual([])
  })

  it('oferta só de venda continua válida, sem dias', () => {
    expect(validar({ venda: ['p1'], degustacao: [], duracao: 'mensal', diasDegustacao: null })).toEqual([])
  })

  it('oferta só de degustação é RECUSADA: sem produto vendido não há venda para processar', () => {
    expect(validar({ venda: [], degustacao: ['p3'], duracao: 'mensal', diasDegustacao: 7 })).toContain('sem_produto_de_venda')
  })

  it('oferta sem produto nenhum é recusada', () => {
    expect(validar({ venda: [], degustacao: [], duracao: 'mensal', diasDegustacao: null })).toContain('sem_produto')
  })

  it('🔴 o mesmo produto como venda E degustação é recusado', () => {
    // É o estado inválido que a chave primária (oferta_id, produto_id) torna impossível no banco.
    // Sem esta recusa, o período do produto brigaria na chave (venda, produto) e sumiria em silêncio.
    expect(validar({ venda: ['p1'], degustacao: ['p1'], duracao: 'anual', diasDegustacao: 7 })).toContain('produto_em_dois_papeis')
  })

  it('produto repetido dentro da mesma lista é recusado', () => {
    expect(validar({ venda: ['p1', 'p1'], degustacao: [], duracao: 'anual', diasDegustacao: null })).toContain('produto_em_dois_papeis')
    expect(validar({ venda: ['p9'], degustacao: ['p3', 'p3'], duracao: 'anual', diasDegustacao: 7 })).toContain('produto_em_dois_papeis')
  })

  it('degustação marcada sem prazo escolhido é recusada', () => {
    expect(validar({ ...ok, degustacao: ['p3'], diasDegustacao: null })).toContain('degustacao_sem_dias')
  })

  it('prazo fora da lista fechada é recusado, e não truncado', () => {
    expect(validar({ ...ok, degustacao: ['p3'], diasDegustacao: 30 })).toContain('dias_fora_da_lista')
    expect(validar({ ...ok, degustacao: ['p3'], diasDegustacao: 1 })).toContain('dias_fora_da_lista')
  })

  it('os dois prazos oferecidos passam', () => {
    for (const dias of PRAZOS_DE_DEGUSTACAO) {
      expect(validar({ ...ok, degustacao: ['p3'], diasDegustacao: dias })).toEqual([])
    }
  })

  it('dias sem degustação é recusado — a coluna ficaria com lixo que ninguém lê', () => {
    expect(validar({ venda: ['p1'], degustacao: [], duracao: 'anual', diasDegustacao: 7 })).toContain('dias_sem_degustacao')
  })

  it('duração precisa ser uma das sete conhecidas', () => {
    expect(validar({ ...ok, duracao: 'degustacao' })).toContain('duracao_invalida')
    expect(validar({ ...ok, duracao: 'bimestral' })).toContain('duracao_invalida')
  })

  it('vários produtos em degustação compartilham o MESMO prazo', () => {
    // A decisão tomada: o prazo é da oferta, não de cada produto. Um segundo prazo exigiria uma
    // coluna por produto, e não é o caso — todos os brindes da oferta vencem juntos.
    const c: Configuracao = { venda: ['p1'], degustacao: ['p3', 'p4'], duracao: 'anual', diasDegustacao: 15 }
    expect(validar(c)).toEqual([])
    expect(c.diasDegustacao).toBe(15)
  })
})

describe('separação de papéis usada pelo processamento', () => {
  /** A mesma partição que `aprovar` faz ao ler `ofertas_produtos`. */
  function separar(linhas: Array<{ produto_id: string; tipo: string }>) {
    return {
      produtosVenda: linhas.filter((l) => l.tipo === 'venda').map((l) => l.produto_id),
      produtosDegustacao: linhas.filter((l) => l.tipo === 'degustacao').map((l) => l.produto_id),
    }
  }

  it('a venda recebe só os produtos de venda; a degustação só os de degustação', () => {
    const r = separar([
      { produto_id: 'p1', tipo: 'venda' },
      { produto_id: 'p2', tipo: 'venda' },
      { produto_id: 'p3', tipo: 'degustacao' },
    ])
    expect(r.produtosVenda).toEqual(['p1', 'p2'])
    expect(r.produtosDegustacao).toEqual(['p3'])
  })

  it('🔴 produto de degustação NUNCA entra na lista de venda', () => {
    // Se entrasse, `vendas.produtos` o trataria como comprado, e ele passaria a empilhar e renovar.
    const r = separar([{ produto_id: 'p3', tipo: 'degustacao' }])
    expect(r.produtosVenda).toEqual([])
  })

  it('registro de tipo desconhecido não entra em nenhum dos dois', () => {
    const r = separar([{ produto_id: 'x', tipo: 'outro' }])
    expect(r.produtosVenda).toEqual([])
    expect(r.produtosDegustacao).toEqual([])
  })
})