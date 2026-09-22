// tests/detracao/recolhimento-noturno/rn22-feriados-com-nome.spec.ts
//
// A RN-2.2 dá NOME aos feriados municipais/estaduais e os faz APARECER na lista de considerados.
//
// 🔴 O que estes testes protegem é o defeito relatado em tela: o resumo dizia "6 feriados" enquanto
// o membro havia informado 8. Os dois extras ESTAVAM sendo computados — mas não apareciam na lista,
// e sem aparecer não há como conferir se entraram. O número sozinho não audita nada.

import { describe, it, expect } from 'vitest'
import { versaoAtual, versaoPorRotulo } from '@/lib/detracao/recolhimento-noturno/versoes/registro'
import type { FeriadoDeclarado } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/tipos'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/formulario'

const rn22 = versaoPorRotulo('RN-2.2')!
const rn21 = versaoPorRotulo('RN-2.1')!

function segmento(over: Partial<SegmentoFormulario> = {}): SegmentoFormulario {
  return {
    dataInicio: '2025-01-01',
    dataFim: '2025-12-31',
    horaInicioNoturno: '22:00',
    horaFimNoturno: '06:00',
    diasSemanaNoturno: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    diasFolgaIntegral: ['SAT', 'SUN'],
    feriadosIntegral: [],
    incluirFeriadosUteis: false,
    ...over,
  }
}

describe('RN-2.2 é a versão vigente, e as anteriores seguem abrindo', () => {
  it('a vigente é a RN-2.2', () => {
    expect(versaoAtual().versao).toBe('RN-2.2')
  })

  it('RN-2.1 e RN-2.0 continuam no registro', () => {
    expect(rn21).not.toBeNull()
    expect(versaoPorRotulo('RN-2.0')).not.toBeNull()
  })
})

describe('o feriado declarado tem data E nome', () => {
  it('o nome entra no resultado, junto dos feriados nacionais', () => {
    // 09/07/2025 (quarta) e 20/08/2025 (quarta) — dias úteis, para não serem capturados pela folga.
    const feriadosIntegral: FeriadoDeclarado[] = [
      { data: '2025-07-09', nome: 'Revolução Constitucionalista' },
      { data: '2025-08-20', nome: 'Aniversário da cidade' },
    ]
    const r = rn22.calcular(rn22.formulario.paraCalculo({ segmentos: [segmento({ feriadosIntegral })] }))

    const nomes = r.feriadosConsiderados.map((f) => f.nome)
    expect(nomes).toContain('Revolução Constitucionalista')
    expect(nomes).toContain('Aniversário da cidade')
    // Os dois são marcados como declarados, e não como nacionais.
    const declarados = r.feriadosConsiderados.filter((f) => f.origem === 'declarado')
    expect(declarados).toHaveLength(2)
  })

  it('os declarados têm dia da semana, como os nacionais', () => {
    const r = rn22.calcular(
      rn22.formulario.paraCalculo({
        segmentos: [segmento({ feriadosIntegral: [{ data: '2025-07-09', nome: 'X' }] })],
      }),
    )
    const f = r.feriadosConsiderados.find((x) => x.data === '2025-07-09')
    expect(f?.diaSemana).toBe('quarta-feira')
  })

  it('feriado declarado SEM nome não quebra e ganha um rótulo genérico', () => {
    const r = rn22.calcular(
      rn22.formulario.paraCalculo({ segmentos: [segmento({ feriadosIntegral: [{ data: '2025-07-09' }] })] }),
    )
    const f = r.feriadosConsiderados.find((x) => x.data === '2025-07-09')
    expect(f?.nome).toBe('Feriado local')
    // E continua computando o dia — o nome é para o documento, não para a conta.
    expect(r.composicao.diasFeriados).toBe(1)
  })

  it('linha com data em branco é IGNORADA, e não vira feriado', () => {
    // É o estado da linha que o membro acabou de adicionar e ainda não preencheu.
    const r = rn22.calcular(
      rn22.formulario.paraCalculo({
        segmentos: [segmento({ feriadosIntegral: [{ data: '', nome: 'digitando...' }] })],
      }),
    )
    expect(r.feriadosConsiderados).toHaveLength(0)
    expect(r.composicao.diasFeriados).toBe(0)
  })

  it('os nacionais e os declarados aparecem JUNTOS, ordenados por data', () => {
    const r = rn22.calcular(
      rn22.formulario.paraCalculo({
        segmentos: [
          segmento({
            incluirFeriadosUteis: true,
            feriadosIntegral: [{ data: '2025-07-09', nome: 'Estadual de SP' }],
          }),
        ],
      }),
    )
    const datas = r.feriadosConsiderados.map((f) => f.data)
    expect([...datas].sort()).toEqual(datas)
    expect(datas).toContain('2025-01-01') // nacional
    expect(datas).toContain('2025-07-09') // declarado
    expect(r.feriadosConsiderados.some((f) => f.origem === 'nacional')).toBe(true)
    expect(r.feriadosConsiderados.some((f) => f.origem === 'declarado')).toBe(true)
  })
})

describe('o CÁLCULO não mudou entre a RN-2.1 e a RN-2.2', () => {
  it('mesmos dias e mesmo total — só o que a entrada carrega é diferente', () => {
    // A RN-2.1 guarda as datas como string solta; a RN-2.2, como objeto com data e nome.
    const r21 = rn21.calcular(
      rn21.formulario.paraCalculo({
        segmentos: [{ ...segmento(), feriadosIntegral: ['2025-07-09', '2025-08-20'] }],
      }),
    )
    const r22 = rn22.calcular(
      rn22.formulario.paraCalculo({
        segmentos: [
          {
            ...segmento(),
            feriadosIntegral: [
              { data: '2025-07-09', nome: 'A' },
              { data: '2025-08-20', nome: 'B' },
            ],
          },
        ],
      }),
    )
    expect(r22.totalMinutos).toBe(r21.totalMinutos)
    expect(r22.diasDetracao).toBe(r21.diasDetracao)
    expect(r22.composicao).toEqual(r21.composicao)
    expect(r22.diasUteis).toBe(r21.diasUteis)
  })
})
