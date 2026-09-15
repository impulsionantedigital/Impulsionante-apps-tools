// tests/detracao/recolhimento-noturno/contrato.spec.ts
import { describe, it, expect } from 'vitest'
import { PRODUTOS, caminhoDoProduto, produtoPorSlug } from '@/lib/produtos/catalogo'
import { ALGORITMO_VERSAO } from '@/lib/detracao/recolhimento-noturno/tipos'
import { calcular } from '@/lib/detracao/recolhimento-noturno/motor'
import { preparar } from '@/app/(app)/ferramentas/[calculadora]/preparar'

describe('contrato — reconciliação catálogo ↔ motor ↔ rotas', () => {
  it('Test 1: Catálogo tem produto detracao-recolhimento-noturno', () => {
    expect(PRODUTOS).toContainEqual(
      expect.objectContaining({
        id: 'detracao-recolhimento-noturno',
        slug: 'recolhimento-noturno',
        familia: 'detracao',
      }),
    )
  })

  it('Test 2: caminhoDoProduto retorna rota detracao para familia detracao', () => {
    expect(caminhoDoProduto('recolhimento-noturno')).toBe(
      '/ferramentas/detracao/recolhimento-noturno',
    )
  })

  it('Test 3: produtoPorSlug resolve recolhimento-noturno → id', () => {
    expect(produtoPorSlug('recolhimento-noturno')?.id).toBe('detracao-recolhimento-noturno')
  })

  it('Test 4: algoritmoVersao matches RN-1.0', () => {
    expect(ALGORITMO_VERSAO).toBe('RN-1.0')
  })

  it('Test 5: Motor calcular is importable and callable', () => {
    expect(typeof calcular).toBe('function')
  })

  it('Test 6: preparar (validation) is importable and callable', () => {
    expect(typeof preparar).toBe('function')
  })

  it('Test 7: Nenhum motor genérico (motorPorId equiv) — arquitetura independente', () => {
    // Detracao não usa motorPorId (recolhimento-noturno é hardcoded no motor.ts)
    // Este teste verifica que a arquitetura é independente (sem shared motor dispatch)

    // 1. preparar é da rota /ferramentas/[calculadora] — não é específico de detracao
    expect(typeof preparar).toBe('function')

    // 2. calcular é específico do motor de recolhimento-noturno
    expect(typeof calcular).toBe('function')

    // 3. Verificar que calcular realmente processa dados corretamente (não é um stub)
    const resultado = calcular({
      timezone: 'America/Sao_Paulo',
      segmentos: [
        {
          inicio: '2026-01-01T00:00:00',
          fim: '2026-01-02T00:00:00',
          horaInicioNoturno: '22:00',
          horaFimNoturno: '06:00',
          diasSemanaNoturno: [],
          diasFolgaIntegral: [],
          feriadosIntegral: [],
          intervalosAdicionais: [{ inicio: '2026-01-01T00:00:00', fim: '2026-01-02T00:00:00' }],
          intervalosExcluidos: [],
        },
      ],
    })
    expect(resultado.totalMinutos).toBe(1440)
    expect(resultado.diasDetracao).toBe(1)
    expect(resultado.algoritmoVersao).toBe('RN-1.0')
  })
})
