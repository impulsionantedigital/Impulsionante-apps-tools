import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/supabase', () => ({ admin: () => { throw new Error('sem banco no teste') } }))
vi.mock('@/server/agente/embed', () => ({ embedar: async () => null }))

import {
  POR_PAGINA_LISTA,
  POR_PAGINA_LISTA_COM_TEMA,
  TETO_BLOCO_CONHECIMENTO,
  montarBlocoConhecimento,
  montarBlocoLista,
  montarBlocoSecao,
} from '@/lib/canais/bloco-conhecimento'
import { criarRefs } from '@/lib/canais/refs-da-rodada'
import { juntarConsultas } from '@/server/agente/busca-base'
import { montarFerramentas } from '@/server/agente/ferramentas'
import { montarPrompt, type Persona } from '@/lib/canais/prompt-agente'

const personaDeTeste = (): Persona => ({ nome: 'Ana', tratamento: 'voce', sobreONegocio: '' })

describe('bloco de conhecimento', () => {
  it('achado de documento leva fonte, página e ref', () => {
    const refs = criarRefs()
    expect(
      montarBlocoConhecimento(
        { achados: [{ id: 'u1', titulo: 'Arruda', conteudo: 'Quente.', tipo: 'fato', fonte: { documento: 'Almanaque das Ervas', caminho: 'Ervas › Arruda', pagina: 12 } }] },
        refs,
      ),
    ).toBe('[conhecimento r1] Fonte: Almanaque das Ervas › Ervas › Arruda (p. 12) | Arruda: Quente.')
  })

  it('card manual sem refs fica como hoje', () =>
    expect(montarBlocoConhecimento({ achados: [{ id: 'c', titulo: 'Prazo', conteudo: '3 dias', tipo: 'fato', fonte: null }] })).toBe(
      '[conhecimento] Prazo: 3 dias',
    ))

  it('card manual com refs leva a ref', () =>
    expect(montarBlocoConhecimento({ achados: [{ id: 'c', titulo: 'Prazo', conteudo: '3 dias', tipo: 'fato', fonte: null }] }, criarRefs())).toBe(
      '[conhecimento r1] Prazo: 3 dias',
    ))

  it('fonte sem caminho e sem página fica só com o documento', () =>
    expect(
      montarBlocoConhecimento({ achados: [{ id: 'd', titulo: 'T', conteudo: 'c', tipo: 'fato', fonte: { documento: 'Doc', caminho: '', pagina: null } }] }),
    ).toBe('[conhecimento] Fonte: Doc | T: c'))

  it('lista conta seções e avisa quantas faltam', () => {
    const itens = Array.from({ length: 25 }, (_, i) => ({
      id: `u${i}`,
      titulo: `E${i}`,
      fonte: { documento: 'Almanaque das Ervas', caminho: `Ervas › E${i}`, pagina: null },
      recorte: 'Oxum',
    }))
    const b = montarBlocoLista('Oxum', { total: 34, pagina: 1, itens }, criarRefs())
    expect(b.split('\n')[0]).toBe('[lista] "Oxum": 34 secoes; mostrando 1–25. Faltam 9: peca pagina 2.')
    expect(b.split('\n')[1]).toBe('r1 | Almanaque das Ervas › Ervas › E0: Oxum')
    expect(b).not.toContain('u0')
  })

  it('segunda página numera a partir do fim da primeira', () => {
    const itens = Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, titulo: 'x', fonte: null, recorte: 'y' }))
    const b = montarBlocoLista('Oxum', { total: 34, pagina: 2, itens }, criarRefs())
    expect(b.split('\n')[0]).toBe('[lista] "Oxum": 34 secoes; mostrando 26–34.')
    expect(b.split('\n')[1]).toBe('r1 | x: y')
  })

  it('com tema a página tem outro tamanho', () => {
    const itens = Array.from({ length: 18 }, (_, i) => ({ id: `u${i}`, titulo: 'x', fonte: null, recorte: 'y' }))
    const b = montarBlocoLista('a | tema: b', { total: 40, pagina: 2, itens, porPagina: POR_PAGINA_LISTA_COM_TEMA }, criarRefs())
    expect(b.split('\n')[0]).toBe('[lista] "a | tema: b": 40 secoes; mostrando 19–36. Faltam 4: peca pagina 3.')
  })

  it('página cheia de lista cabe no teto do bloco', () => {
    const item = (i: number) => ({
      id: `u${i}`,
      titulo: 'x'.repeat(40),
      fonte: { documento: 'Almanaque das Ervas', caminho: 'Ervas › ' + 'y'.repeat(60), pagina: 999 },
      recorte: 'z'.repeat(300),
    })
    expect(
      montarBlocoLista('a + b | tema: c', { total: 99, pagina: 1, itens: Array.from({ length: POR_PAGINA_LISTA_COM_TEMA }, (_, i) => item(i)) }, criarRefs())
        .length,
    ).toBeLessThanOrEqual(TETO_BLOCO_CONHECIMENTO)
  })

  it('página cheia sem tema, com tudo no máximo, também cabe e mostra todos', () => {
    const item = (i: number) => ({
      id: `u${i}`,
      titulo: 'x'.repeat(400),
      fonte: { documento: 'D'.repeat(300), caminho: 'C'.repeat(600), pagina: 99999 },
      recorte: 'z'.repeat(1000),
    })
    const b = montarBlocoLista('w'.repeat(1000), { total: 999, pagina: 1, itens: Array.from({ length: POR_PAGINA_LISTA }, (_, i) => item(i)) }, criarRefs())
    expect(b.length).toBeLessThanOrEqual(TETO_BLOCO_CONHECIMENTO)
    expect(b.split('\n')).toHaveLength(POR_PAGINA_LISTA + 1)
  })

  it('lista vazia diz que não achou', () =>
    expect(montarBlocoLista('Zzz', { total: 0, pagina: 1, itens: [] }, criarRefs())).toBe('[lista] "Zzz": nada encontrado na base.'))

  it('página além do fim manda voltar para a primeira', () =>
    expect(montarBlocoLista('Zzz', { total: null, pagina: 4, itens: [] }, criarRefs())).toBe(
      '[lista] "Zzz": pagina 4 nao existe; volte para a pagina 1.',
    ))

  it('lista indisponível', () => expect(montarBlocoLista('Zzz', 'indisponivel', criarRefs())).toBe('[lista] Base indisponivel agora.'))

  it('rótulo da lista com vários termos e tema', () => {
    expect(montarBlocoLista('fria + Oxum | tema: harmonizar o corpo', { total: 0, pagina: 1, itens: [] }, criarRefs())).toBe(
      '[lista] "fria + Oxum | tema: harmonizar o corpo": nada encontrado na base.',
    )
  })

  it('seção com fonte, e aviso quando cortada', () => {
    const fonte = { documento: 'Almanaque das Ervas', caminho: 'Ervas › Arruda', pagina: 3 }
    expect(montarBlocoSecao({ fonte, texto: 'Linha 1\nLinha 2', cortado: false })).toBe(
      '[secao] Fonte: Almanaque das Ervas › Ervas › Arruda (p. 3)\nLinha 1\nLinha 2',
    )
    expect(montarBlocoSecao({ fonte, texto: 'a', cortado: true })).toBe(
      '[secao] Fonte: Almanaque das Ervas › Ervas › Arruda (p. 3)\na\n[secao continua: use lerSecao modo vizinhos]',
    )
    expect(montarBlocoSecao({ fonte: null, texto: 'a', cortado: false })).toBe('[secao]\na')
    expect(montarBlocoSecao('nao_encontrado')).toMatch(/^\[secao\] /)
    expect(montarBlocoSecao('indisponivel')).toBe('[secao] Base indisponivel agora.')
  })

  it('juntarConsultas intercala, não repete e corta em 16', () => {
    const a = (id: string) => ({ id, titulo: id, conteudo: '', tipo: 'fato' as const, fonte: null })
    expect(juntarConsultas([[a('x'), a('y')], [a('y'), a('z')]]).map((r) => r.id)).toEqual(['x', 'y', 'z'])
    expect(
      juntarConsultas([Array.from({ length: 8 }, (_, i) => a(`p${i}`)), Array.from({ length: 8 }, (_, i) => a(`q${i}`)), [a('r0')]]),
    ).toHaveLength(16)
    expect(juntarConsultas([[a('p0'), a('p1')], [a('q0'), a('q1')]]).map((r) => r.id)).toEqual(['p0', 'q0', 'p1', 'q1'])
  })

  it('descrições das ferramentas e prompt não citam assunto de projeto', () => {
    const ferr = montarFerramentas({ workspaceId: 'w', conversaId: 'c', contatoId: null, assistenteId: null }) as Record<string, { description: string }>
    const textos = [montarPrompt(personaDeTeste()), ...Object.values(ferr).map((f) => f.description)].join('\n')
    expect(textos).not.toMatch(/orix|erva|oxum|almanaque|aruanda|gps da pena|indulto/i)
  })

  it('as três ferramentas da base existem', () => {
    const ferr = montarFerramentas({ workspaceId: 'w', conversaId: 'c', contatoId: null, assistenteId: null })
    expect(Object.keys(ferr)).toEqual(expect.arrayContaining(['buscarBase', 'listarNaBase', 'lerSecao']))
  })

  it('lerSecao com ref desconhecida responde sem ir ao banco', async () => {
    const ferr = montarFerramentas({ workspaceId: 'w', conversaId: 'c', contatoId: null, assistenteId: null }) as Record<
      string,
      { execute: (i: unknown) => Promise<unknown> }
    >
    expect(await ferr.lerSecao.execute({ ref: 'r7', modo: 'secao' })).toBe(
      '[secao] Referencia desconhecida. Use uma referencia devolvida por buscarBase ou listarNaBase.',
    )
  })

  it('nenhum bloco deixa vazar uuid', () => {
    const uuid = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`
    const refs = criarRefs()
    const fonte = { documento: 'Doc', caminho: 'A › B', pagina: 1 }
    const blocos = [
      montarBlocoConhecimento({ achados: [1, 2].map((n) => ({ id: uuid(n), titulo: 't', conteudo: 'c', tipo: 'fato' as const, fonte })) }, refs),
      montarBlocoLista('t', { total: 2, pagina: 1, itens: [3, 4].map((n) => ({ id: uuid(n), titulo: 't', fonte, recorte: 'r' })) }, refs),
      montarBlocoSecao({ fonte, texto: 'texto', cortado: true }),
    ].join('\n')
    expect(blocos).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('o prompt manda citar a fonte e avisar lista incompleta', () => {
    const p = montarPrompt(personaDeTeste())
    expect(p).toContain('diga de onde tirou')
    expect(p).toContain('a lista pode nao estar completa')
    expect(p).toContain('use lerSecao antes de responder')
    expect(p).toContain('buscarBase aceita ate 3 consultas')
  })
})
