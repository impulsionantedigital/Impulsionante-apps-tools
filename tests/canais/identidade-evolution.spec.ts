import { describe, it, expect } from 'vitest'
import { nomeDaInstancia, tokenDeclarado } from '@/lib/canais/identidade-do-envelope'
import { verificarEvento, type CanalRow } from '@/server/canais/registry'

describe('identidade do envelope por provider', () => {
  it('evolution: lê instance string e apikey', () => {
    const env = { instance: 'loja', apikey: 'k' }
    expect(nomeDaInstancia(env, 'evolution')).toBe('loja')
    expect(tokenDeclarado(env, 'evolution')).toBe('k')
  })

  it('evolution: apikey ausente ou não-string vira "" (a chave é obrigatória)', () => {
    expect(tokenDeclarado({ instance: 'loja' }, 'evolution')).toBe('')
    expect(tokenDeclarado({ instance: 'loja', apikey: 3 }, 'evolution')).toBe('')
  })

  it('evolution: instance em objeto não é aceito', () => {
    expect(nomeDaInstancia({ instance: { name: 'loja' } }, 'evolution')).toBeNull()
  })

  it('uazapi continua ignorando instance string e apikey', () => {
    const env = { instance: 'loja', apikey: 'k' }
    expect(nomeDaInstancia(env, 'uazapi')).toBeNull()
    expect(nomeDaInstancia(env)).toBeNull()
    expect(tokenDeclarado(env, 'uazapi')).toBeNull()
    expect(tokenDeclarado(env)).toBeNull()
    expect(nomeDaInstancia({ instance: { name: 'loja' }, token: 't' })).toBe('loja')
    expect(tokenDeclarado({ instance: { name: 'loja' }, token: 't' })).toBe('t')
  })
})

describe('verificarEvento num canal evolution', () => {
  const canal: CanalRow = {
    id: 'c1',
    workspace_id: 'w',
    provider: 'evolution',
    external_id: 'loja',
    config: {},
    agente_ligado: false,
  }
  const getSecret = async () => 'chave-da-instancia'

  it('envelope válido passa', async () => {
    expect(await verificarEvento(canal, { instance: 'loja', apikey: 'chave-da-instancia' }, { getSecret })).toEqual({
      veredito: 'ok',
    })
  })

  it('apikey errada ou ausente é recusada', async () => {
    expect(await verificarEvento(canal, { instance: 'loja', apikey: 'outra' }, { getSecret })).toEqual({
      veredito: 'recusado',
      motivo: 'token_diferente',
    })
    expect(await verificarEvento(canal, { instance: 'loja' }, { getSecret })).toEqual({
      veredito: 'recusado',
      motivo: 'token_diferente',
    })
  })

  it('instância trocada é recusada', async () => {
    expect(await verificarEvento(canal, { instance: 'outra', apikey: 'chave-da-instancia' }, { getSecret })).toEqual({
      veredito: 'recusado',
      motivo: 'instancia_diferente',
    })
  })

  it('canal uazapi com envelope no formato Evolution continua recusado', async () => {
    const uaz = { ...canal, provider: 'uazapi' }
    expect(await verificarEvento(uaz, { instance: 'loja', apikey: 'chave-da-instancia' }, { getSecret })).toEqual({
      veredito: 'recusado',
      motivo: 'instancia_diferente',
    })
  })
})
