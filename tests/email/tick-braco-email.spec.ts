import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mocka TODOS os braços que a rota importa, para o teste não depender de nada real
// (nem Supabase, nem SMTP, nem licença). vi.mock é hoisted para o topo do arquivo, então as
// fábricas só podem referenciar valores criados com vi.hoisted — mesma forma que
// tests/email/enviar.spec.ts (Task 7) usa para o mock do nodemailer.
const mocks = vi.hoisted(() => ({
  tickAutomacao: vi.fn(async () => ({})),
  entregarPendentes: vi.fn(async () => ({})),
  baterLicenca: vi.fn(async () => ({ bateu: false })),
  drenarFila: vi.fn(async () => undefined),
  drenarAgente: vi.fn(async () => ({ reivindicados: 0, respondidos: 0, pulados: 0 })),
  drenarMidia: vi.fn(async () => ({ baixadas: 0, falhas: 0, adiadas: 0, semCota: 0 })),
  drenarPerfis: vi.fn(async () => ({
    resolvidos: 0,
    adiados: 0,
    semCredencial: 0,
    desistidos: 0,
  })),
  tickCustom: vi.fn(async () => ({ tarefas: 0, eventos: 0 })),
  expurgar: vi.fn(async () => ({
    rodou: false,
    jobs: 0,
    custos: 0,
    conversasSimulador: 0,
    objetos: 0,
  })),
  drenarEmail: vi.fn(async () => ({ enviados: 0, falhas: 0, pulados: 0 })),
}))

vi.mock('@/server/automacao/tick', () => ({ tickAutomacao: mocks.tickAutomacao }))
vi.mock('@/server/webhook/entrega', () => ({ entregarPendentes: mocks.entregarPendentes }))
vi.mock('@/server/license/batida', () => ({ baterLicenca: mocks.baterLicenca }))
vi.mock('@/server/canais/envio', () => ({ drenarFila: mocks.drenarFila }))
vi.mock('@/server/agente/runtime', () => ({ drenarAgente: mocks.drenarAgente }))
vi.mock('@/server/canais/midia-tick', () => ({ drenarMidia: mocks.drenarMidia }))
vi.mock('@/server/canais/perfil-tick', () => ({ drenarPerfis: mocks.drenarPerfis }))
vi.mock('@/server/custom/tick', () => ({ tickCustom: mocks.tickCustom }))
vi.mock('@/server/canais/expurgo', () => ({ expurgar: mocks.expurgar }))
vi.mock('@/server/email/fila', () => ({ drenarEmail: mocks.drenarEmail }))

import { POST } from '@/app/api/interno/tick/route'

const SEGREDO = 'segredo-de-teste'

function requisicao(): Request {
  return new Request('http://localhost/api/interno/tick', {
    method: 'POST',
    headers: { authorization: SEGREDO },
  })
}

beforeEach(() => {
  process.env.TICK_SECRET = SEGREDO
  mocks.drenarEmail.mockReset()
  mocks.drenarEmail.mockResolvedValue({ enviados: 0, falhas: 0, pulados: 0 })
})

afterEach(() => {
  delete process.env.TICK_SECRET
})

describe('braço de e-mail no relógio do tick', () => {
  it('não derruba o tick quando drenarEmail lança, e devolve o campo email neutro', async () => {
    mocks.drenarEmail.mockRejectedValue(new Error('smtp indisponível'))

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo.data.email).toEqual({ enviados: 0, falhas: 0, pulados: 0 })
    // os demais braços continuam a rodar mesmo com o de e-mail falhando
    expect(corpo.data.expurgo).toBeDefined()
  })

  it('devolve o resultado de drenarEmail quando ele resolve normalmente', async () => {
    mocks.drenarEmail.mockResolvedValue({ enviados: 3, falhas: 1, pulados: 0 })

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo.data.email).toEqual({ enviados: 3, falhas: 1, pulados: 0 })
  })
})
