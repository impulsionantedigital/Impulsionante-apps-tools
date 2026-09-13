import { describe, it, expect } from 'vitest'
import { REGISTRO, motorPorId, motorPadrao } from '@/lib/indulto-comutacao/registro'
import { ehVeredito } from '@/lib/indulto-comutacao/tipos'

describe('REGISTRO', () => {
  it('não está vazio', () => {
    expect(REGISTRO.length).toBeGreaterThan(0)
  })

  it('não repete id', () => {
    const ids = REGISTRO.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('vem ordenado do mais recente para o mais antigo', () => {
    const anos = REGISTRO.map((m) => m.ano)
    expect([...anos].sort((a, b) => b - a)).toEqual(anos)
  })
})

describe.each(REGISTRO.map((m) => [m.id, m] as const))('contrato — %s', (_id, motor) => {
  it('preenche a identificação', () => {
    expect(motor.id).toMatch(/^indulto-comutacao-\d{4}$/)
    const anoDoId = parseInt(motor.id.slice(-4), 10)
    expect(anoDoId, `Ano extraído do id (${anoDoId}) deve corresponder ao campo ano (${motor.ano}). Ao plugar um novo decreto, eles precisam estar sincronizados.`).toBe(motor.ano)
    expect(motor.ano).toBeGreaterThan(2000)
    expect(motor.rotulo.length).toBeGreaterThan(0)
    expect(motor.versao).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('tem data-base no formato de data e no próprio ano', () => {
    expect(motor.dataBase).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(motor.dataBase.startsWith(String(motor.ano))).toBe(true)
  })

  it('tem questionário com seções e campos, sem chave repetida', () => {
    expect(motor.questionario.length).toBeGreaterThan(0)
    const chaves: string[] = []
    const idsSecao: string[] = []
    for (const secao of motor.questionario) {
      expect(secao.campos.length).toBeGreaterThan(0)
      idsSecao.push(secao.id)
      for (const campo of secao.campos) chaves.push(campo.chave)
    }
    expect(new Set(chaves).size, 'Nenhum campo.chave deve repetir entre seções').toBe(chaves.length)
    expect(new Set(idsSecao).size, 'Nenhum secao.id deve repetir entre seções. Ao plugar um novo decreto, cada seção precisa de um identificador único.').toBe(idsSecao.length)
  })

  it('tem metadados de inciso sem id repetido', () => {
    const ids = [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sempre exibe os pontos a validar juridicamente', () => {
    expect(motor.avisos.validarJuridicamente.length).toBeGreaterThan(0)
    expect(motor.avisos.fixos.length).toBeGreaterThan(0)
  })

  it('calcula com entrada vazia sem lançar, e só devolve veredito válido', () => {
    const r = motor.calcular({})
    expect(r.incisos.length).toBeGreaterThan(0)
    for (const inciso of r.incisos) {
      expect(ehVeredito(inciso.geral), `${inciso.id}.geral`).toBe(true)
      expect(ehVeredito(inciso.especial), `${inciso.id}.especial`).toBe(true)
    }
  })

  it('cobre com metadado todo inciso que o cálculo devolve, e vice-versa', () => {
    const devolvidos = motor.calcular({}).incisos.map((i) => i.id)
    const comMeta = [...motor.incisos.indulto, ...motor.incisos.comutacao].map((i) => i.id)
    expect(devolvidos.filter((id) => !comMeta.includes(id))).toEqual([])
    expect(comMeta.filter((id) => !devolvidos.includes(id))).toEqual([])
  })
})

describe('motorPorId()', () => {
  it('acha o que existe e devolve null para o resto', () => {
    expect(motorPorId(REGISTRO[0].id)?.id).toBe(REGISTRO[0].id)
    expect(motorPorId('indulto-comutacao-1988')).toBeNull()
    expect(motorPorId('')).toBeNull()
  })
})

describe('motorPadrao()', () => {
  it('é o mais recente do registro', () => {
    expect(motorPadrao().id).toBe(REGISTRO[0].id)
  })
})
