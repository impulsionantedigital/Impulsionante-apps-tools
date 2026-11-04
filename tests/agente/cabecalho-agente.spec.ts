import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { comCabecalho, linhaDoCabecalho, semCabecalho } from '@/lib/canais/cabecalho-agente'
import { aplicarDisclosure, carregaDisclosure, linhaDoDisclosure, semDisclosure } from '@/lib/canais/disclosure'
import { montarHistorico } from '@/lib/canais/historico-agente'
import { montarPrompt } from '@/lib/canais/prompt-agente'

describe('cabeçalho com o nome do assistente', () => {
  it('no WhatsApp sai em negrito, em cima do texto', () => {
    expect(comCabecalho('Sim, combina.', 'GuIA de Aruanda', true)).toBe('*GuIA de Aruanda:*\nSim, combina.')
  })

  it('fora do WhatsApp sai como texto simples', () => {
    expect(comCabecalho('Oi', 'Ana', false)).toBe('Ana:\nOi')
  })

  it('sem nome não coloca nada', () => {
    expect(comCabecalho('Oi', '  ', true)).toBe('Oi')
  })

  it('tira o "[assistente]" que o modelo copiou', () => {
    expect(comCabecalho('[assistente] Sim, combina.', 'Ana', true)).toBe('*Ana:*\nSim, combina.')
  })

  it('não repete o nome quando o modelo já o escreveu', () => {
    expect(comCabecalho('*Ana:*\nOi', 'Ana', true)).toBe('*Ana:*\nOi')
    expect(comCabecalho('Ana:\nOi', 'Ana', true)).toBe('*Ana:*\nOi')
  })

  it('mantém uma primeira linha em negrito que não é o nome', () => {
    expect(comCabecalho('*Dica:*\nRegue cedo.', 'Ana', true)).toBe('*Ana:*\n*Dica:*\nRegue cedo.')
  })

  it('asterisco e quebra de linha no nome não quebram o negrito', () => {
    expect(linhaDoCabecalho('*Ana*\nBot', true)).toBe('*Ana Bot:*')
  })

  it('semCabecalho tira o nome em negrito e o rótulo antigo', () => {
    expect(semCabecalho('*GuIA de Aruanda:*\nSim.')).toBe('Sim.')
    expect(semCabecalho('[assistente] Sim.')).toBe('Sim.')
    expect(semCabecalho('Ingredientes:\n- sal')).toBe('Ingredientes:\n- sal')
    expect(semCabecalho('Ana:\nOi', 'Ana')).toBe('Oi')
  })

  it('o aviso de IA vai no fim, em itálico, e a abertura fica com o assistente', () => {
    const final = comCabecalho(aplicarDisclosure('Olá! Tem sim.', true), 'Ana', true)
    expect(final).toBe(`*Ana:*\nOlá! Tem sim.\n\n_${linhaDoDisclosure()}_`)
    expect(carregaDisclosure(final)).toBe(true)
    expect(carregaDisclosure(comCabecalho('Oi', 'Ana', true))).toBe(false)
  })

  it('resposta longa leva o aviso no começo, para ele não cair na última bolha', () => {
    const longo = 'a'.repeat(3600)
    expect(aplicarDisclosure(longo, false).startsWith(linhaDoDisclosure())).toBe(true)
  })

  it('o aviso das versões antigas continua reconhecido', () => {
    const antigo =
      '*Ana:*\nOi! Sou o assistente virtual (IA) da empresa. Se preferir, escreva "falar com atendente": eu paro de responder e alguém do time segue por aqui.\n\nOlá!'
    expect(carregaDisclosure(antigo)).toBe(true)
    expect(semDisclosure(semCabecalho(antigo))).toBe('Olá!')
  })

  it('o histórico devolve a fala do assistente sem rótulo e sem nome', () => {
    const h = montarHistorico([
      { direcao: 'entrada', autor: 'contato', texto: 'oi', status: 'recebida' },
      { direcao: 'saida', autor: 'agente', texto: `*Ana:*\nOlá!\n\n_${linhaDoDisclosure()}_`, status: 'enviada' },
      { direcao: 'saida', autor: 'membro', texto: 'Aqui é a Bia.', status: 'enviada' },
    ])
    expect(h.map((f) => f.content)).toEqual(['oi', 'Olá!', '[atendente] Aqui é a Bia.'])
  })
})

describe('prompt do assistente', () => {
  const base = { nome: 'Ana', tratamento: 'voce' as const, sobreONegocio: '' }

  it('inclui as instruções do dono por último, sem desligar as regras fixas', () => {
    const p = montarPrompt({ ...base, instrucoes: 'Fale de um jeito acolhedor.' })
    expect(p.endsWith('Fale de um jeito acolhedor.')).toBe(true)
    expect(p).toContain('Voce NAO inventa informacao')
    expect(p).toContain('desde que nao contrariem as regras acima')
  })

  it('o modelo sabe que o aviso de IA é do sistema e cumprimenta uma vez só', () => {
    const p = montarPrompt(base)
    expect(p).toContain('Nao escreva esse aviso voce mesmo')
    expect(p).toContain('so na primeira resposta da conversa')
  })

  it('continuação busca de novo pelo item e a citação fica com o trecho de origem', () => {
    const p = montarPrompt(base)
    expect(p).toContain('busque de novo pelo nome do item')
    expect(p).toContain('Nunca junte informacao de um item com a pagina ou a secao de outro')
  })

  it('sem instruções não abre o bloco', () => {
    expect(montarPrompt(base)).not.toContain('Personalidade, tom e instrucoes')
  })

  it('o tamanho da resposta segue a pergunta e a lista não é resumida', () => {
    const p = montarPrompt(base)
    expect(p).not.toContain('1 a 3 frases, sem markdown, sem lista')
    expect(p).toContain('O tamanho segue a pergunta')
    expect(p).toContain('Mostre todos os itens que a base trouxe')
    expect(p).toContain('o sistema ja coloca seu nome em cima da mensagem')
  })
})

describe('migrations 0077 e 0078', () => {
  const ler = (n: string) => readFileSync(`supabase/migrations/${n}`, 'utf8')

  it('instalação nova: rodam duas vezes e aceitam até 12000', async () => {
    const db = new PGlite()
    await db.exec(`create table public.assistentes (id int primary key);`)
    for (let i = 0; i < 2; i++) {
      await db.exec(ler('0077_assistente_instrucoes.sql'))
      await db.exec(ler('0078_assistente_instrucoes_12000.sql'))
    }
    await db.query(`insert into public.assistentes (id, instrucoes) values (1, $1)`, ['x'.repeat(12000)])
    await expect(
      db.query(`insert into public.assistentes (id, instrucoes) values (2, $1)`, ['x'.repeat(12001)]),
    ).rejects.toThrow()
    const { rows } = await db.query<{ instrucoes: string }>(`insert into public.assistentes (id) values (3) returning instrucoes`)
    expect(rows[0]?.instrucoes).toBe('')
    await db.close()
  })

  it('instalação que já tinha o teto de 4000: a 0078 alarga', async () => {
    const db = new PGlite()
    await db.exec(`
      create table public.assistentes (id int primary key, instrucoes text not null default '');
      alter table public.assistentes
        add constraint assistentes_instrucoes_tamanho check (length(instrucoes) <= 4000);
    `)
    await db.exec(ler('0078_assistente_instrucoes_12000.sql'))
    await db.exec(ler('0078_assistente_instrucoes_12000.sql'))
    await db.query(`insert into public.assistentes (id, instrucoes) values (1, $1)`, ['x'.repeat(12000)])
    await expect(
      db.query(`insert into public.assistentes (id, instrucoes) values (2, $1)`, ['x'.repeat(12001)]),
    ).rejects.toThrow()
    await db.close()
  })
})
