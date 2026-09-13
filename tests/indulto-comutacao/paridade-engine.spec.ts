// O PORTÃO do porte: o motor de 2025 tem de devolver, cenário a cenário, o MESMO
// que `validacao/2025/engine.js` — o oráculo do qual ele foi transcrito.
//
// Vale como regressão permanente, e não como script descartável: enquanto o
// engine.js estiver na árvore, qualquer mexida no motor que mude um veredito, um
// quantum de comutação ou um tempo do resumo reprova aqui.
//
// Os dois desvios DELIBERADOS do porte (os bugs de planilha corrigidos) não
// aparecem como divergência porque o próprio engine.js já os corrige — é o
// comportamento dele, não o da planilha, que é o oráculo.

import { describe, it, expect } from 'vitest'
import { runInThisContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada } from '@/lib/indulto-comutacao/tipos'

const raiz = fileURLToPath(new URL('../../', import.meta.url))

type IncisoOriginal = {
  geral?: string
  situacao?: string
  especial?: string
  comutacao?: number | null
  penaApos?: number | null
}
type SaidaOriginal = {
  incisos: Record<string, IncisoOriginal>
  resumo: {
    totalPenasImpostas: string
    totalPenaCumprida: string
    penaCumpridaImpeditivos: string
    penaRemanescente: string
    fracoes: Record<string, string>
  }
  avisos: string[]
}
const cenarios = JSON.parse(
  readFileSync(raiz + 'validacao/2025/cenarios.json', 'utf8'),
) as Array<Entrada & { _nome: string }>

// 🔴 O engine.js é carregado à mão, pelo MESMO invólucro que o Node usa para
// CommonJS, e não por `import`/`createRequire`. Dois motivos, os dois já sentidos
// aqui: o transform do Vitest entrega o arquivo sem `module`, e o `package.json`
// da raiz é `"type": "module"`, então um `require` normal trataria o `.js` como
// ESM e devolveria um namespace vazio. Nos dois casos o UMD cai no ramo
// `root.MotorIndulto` e o oráculo some. Assim ele roda exatamente como está em
// disco, byte por byte, sem transform nenhum no meio.
const engineOriginal = (() => {
  const fonte = readFileSync(raiz + 'validacao/2025/engine.js', 'utf8')
  const mod = { exports: {} as { calcular(input: unknown): SaidaOriginal } }
  const invólucro = runInThisContext(
    `(function (exports, module) {\n${fonte}\n})`,
    { filename: raiz + 'validacao/2025/engine.js' },
  ) as (exports: unknown, module: unknown) => void
  invólucro(mod.exports, mod)
  return mod.exports
})()

describe('paridade com validacao/2025/engine.js', () => {
  it('carrega os cenários de validação', () => {
    expect(cenarios.length).toBeGreaterThan(0)
  })

  cenarios.forEach((cenario) => {
    describe(cenario._nome, () => {
      const esperado = engineOriginal.calcular(cenario)
      const obtido = calcular2025(cenario)

      it('produz exatamente os mesmos dispositivos, na mesma ordem', () => {
        expect(obtido.incisos.map((i) => i.id)).toEqual(Object.keys(esperado.incisos))
      })

      for (const inciso of obtido.incisos) {
        it(`${inciso.id}: mesmo veredito, mesmo quantum`, () => {
          const orig = esperado.incisos[inciso.id]
          expect(orig, `${inciso.id} não existe no original`).toBeDefined()

          // O original devolve `geral` nos incisos de indulto e `situacao` nos de
          // comutação; o contrato unificou os dois em `geral`.
          expect(VEREDITOS[inciso.geral]).toBe(orig.geral ?? orig.situacao)

          // `especial` só existe no original nos incisos de indulto. Nos de
          // comutação o porte escreve 'sem_previsao', que não tem contraparte.
          if (orig.especial !== undefined) {
            expect(VEREDITOS[inciso.especial]).toBe(orig.especial)
          } else {
            expect(inciso.especial).toBe('sem_previsao')
          }

          // Quantum e pena após: números idênticos (inclusive os `null` do bug
          // L145:L149 corrigido, que o engine.js já devolve como null).
          if (orig.comutacao !== undefined) {
            expect(inciso.quantum).toBe(orig.comutacao)
            expect(inciso.penaApos).toBe(orig.penaApos)
          }
        })
      }

      it('resumo: mesmos tempos', () => {
        const r = obtido.resumo
        expect(fmtDias(r.totalImposto)).toBe(esperado.resumo.totalPenasImpostas)
        expect(fmtDias(r.totalCumprido)).toBe(esperado.resumo.totalPenaCumprida)
        expect(fmtDias(r.penaCumpridaImpeditivos)).toBe(esperado.resumo.penaCumpridaImpeditivos)
        expect(fmtDias(r.remanescente)).toBe(esperado.resumo.penaRemanescente)
        expect(fmtDias(r.fracoes.doisTercosImpeditivos)).toBe(esperado.resumo.fracoes['2/3 impeditivos'])
        expect(fmtDias(r.fracoes.umQuinto)).toBe(esperado.resumo.fracoes['1/5 não impeditivos'])
        expect(fmtDias(r.fracoes.umQuarto)).toBe(esperado.resumo.fracoes['1/4 não impeditivos'])
        expect(fmtDias(r.fracoes.umTerco)).toBe(esperado.resumo.fracoes['1/3 não impeditivos'])
        expect(fmtDias(r.fracoes.metade)).toBe(esperado.resumo.fracoes['1/2 não impeditivos'])
      })

      it('avisos: mesmas ambiguidades sinalizadas', () => {
        expect(obtido.avisos).toEqual(esperado.avisos)
      })
    })
  })
})
