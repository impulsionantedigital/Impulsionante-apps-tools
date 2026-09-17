// O PORTÃO do porte: o motor de 2025 tem de devolver, cenário a cenário, o MESMO
// que `validacao/2025/engine.js` — o oráculo do qual ele foi transcrito.
//
// Vale como regressão permanente, e não como script descartável: enquanto o
// engine.js estiver na árvore, qualquer mexida no motor que mude um veredito, um
// quantum de comutação ou um tempo do resumo reprova aqui.
//
// Os três desvios DELIBERADOS do porte (os bugs de planilha corrigidos) não
// aparecem como divergência porque o próprio engine.js já os corrige — é o
// comportamento dele, não o da planilha, que é o oráculo.
//
// 🔴 HÁ UM QUARTO DESVIO, E ESTE APARECE: o Art. 13 com `<` estrito. A decisão do
// dono do produto foi aceitar o cumprimento EXATO da fração (`<=`), como o texto do
// Decreto. Nos dois cenários que caem exatamente na fronteira o porte diz "Preenche"
// e o engine.js diz "Não preenche". Em vez de afrouxar a comparação (o que esconderia
// um desvio NOVO nesses cenários), os dois são PULADOS, nomeados, com a razão — e há
// um teste no fim deste arquivo que reprova se a lista deixar de bater com a
// realidade, nos dois sentidos.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcular2025 } from '@/lib/indulto-comutacao/motores/2025/motor'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import type { Entrada } from '@/lib/indulto-comutacao/tipos'
// O oráculo vem de `_oraculo.ts`, que é o ÚNICO carregador do engine.js — com o
// guard que reprova se o invólucro CommonJS não expuser `calcular`. Não copie o
// carregador para cá: foi uma cópia sem o guard que existiu aqui antes.
import { RAIZ, CENARIOS_ART13_EXATO, engineOriginal } from './_oraculo'

const cenarios = JSON.parse(
  readFileSync(RAIZ + 'validacao/2025/cenarios.json', 'utf8'),
) as Array<Entrada & { _nome: string }>

describe('paridade com validacao/2025/engine.js', () => {
  it('carrega os cenários de validação', () => {
    expect(cenarios.length).toBeGreaterThan(0)
  })

  it('a lista de cenários desviados por decisão bate com a realidade', () => {
    // Nos dois sentidos: um nome na lista que não existe mais (cenário renomeado)
    // deixaria de pular nada e a suíte seguiria verde; um cenário que PASSOU a
    // divergir sem entrar na lista é desvio NOVO, e tem de reprovar aqui.
    const nomes = new Set(cenarios.map((c) => c._nome))
    for (const nome of CENARIOS_ART13_EXATO.keys()) {
      expect(nomes.has(nome), `a lista de desvios cita um cenário que não existe: "${nome}"`).toBe(true)
    }

    const divergentes = cenarios
      .filter((c) => {
        const esperado = engineOriginal.calcular(c)
        const obtido = calcular2025(c)
        return obtido.incisos.some(
          (i) => VEREDITOS[i.geral] !== (esperado.incisos[i.id].geral ?? esperado.incisos[i.id].situacao),
        )
      })
      .map((c) => c._nome)
    expect(divergentes.sort()).toEqual([...CENARIOS_ART13_EXATO.keys()].sort())
  })

  cenarios.forEach((cenario) => {
    const razaoDoDesvio = CENARIOS_ART13_EXATO.get(cenario._nome)
    if (razaoDoDesvio) {
      // `describe.skip` mantém o cenário visível no relatório, com a razão no
      // título — um `if (…) return` faria o cenário sumir sem deixar rastro.
      describe.skip(`${cenario._nome} — DESVIO: ${razaoDoDesvio}`, () => {
        it('pulado', () => {})
      })
      return
    }
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
        // Continua batendo: o `<` do Art. 13 era ambiguidade JURÍDICA (lista
        // `validarJuridicamente`), e não um dos dois `avisos` do engine.js — cuja
        // lista o porte reproduz literalmente.
        expect(obtido.avisos).toEqual(esperado.avisos)
      })
    })
  })
})
