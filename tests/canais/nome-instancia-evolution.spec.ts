import { describe, expect, it } from 'vitest'
import { nomeTecnicoDaInstancia } from '@/server/canais/evolution-api'
import { readFileSync } from 'node:fs'

describe('nomeTecnicoDaInstancia', () => {
  it('tira espaço, parêntese e acento: só minúsculas, números e hífen', () => {
    const nome = nomeTecnicoDaInstancia('Trilhas de Aruanda (GuIA) — São João', () => 'a1b2c3')
    expect(nome).toBe('trilhas-de-aruanda-guia-sao-joao-a1b2c3')
    expect(nome).toMatch(/^[a-z0-9-]+$/)
  })

  it('nome só de símbolos ainda vira um nome válido', () => {
    expect(nomeTecnicoDaInstancia('(((  )))', () => 'zz9')).toBe('crm-zz9')
  })

  it('corta nomes longos e nunca termina em hífen antes do sufixo', () => {
    const nome = nomeTecnicoDaInstancia('a'.repeat(100), () => 'x1')
    expect(nome.length).toBeLessThanOrEqual(40)
    expect(nome).not.toMatch(/--/)
  })

  it('o sufixo padrão é aleatório (dois canais com o mesmo nome não colidem)', () => {
    expect(nomeTecnicoDaInstancia('Loja')).not.toBe(nomeTecnicoDaInstancia('Loja'))
  })

  it('criarCanalEvolution cria a instância com o nome técnico, não com o nome digitado', () => {
    const fonte = readFileSync('src/server/canais/conexao.ts', 'utf8')
    const corpo = fonte.slice(fonte.indexOf('export async function criarCanalEvolution'))
    expect(corpo.slice(0, 4000)).toMatch(/nomeTecnicoDaInstancia\(nome\)/)
    expect(corpo.slice(0, 4000)).not.toMatch(/criarInstancia\(serverUrl, chaveGlobal, nome\)/)
  })
})
