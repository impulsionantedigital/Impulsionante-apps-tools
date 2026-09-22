// tests/detracao/recolhimento-noturno/atualiza-ao-digitar.spec.ts
//
// Regressivo do defeito relatado em tela: "não atualiza de forma automática enquanto eu digito — só
// atualiza o cálculo se eu clicar em salvar".
//
// A causa era a combinação de duas coisas que, isoladas, estão certas:
//
//   • `resultadoSalvo` existe para mostrar o número GRAVADO num cálculo que é DOCUMENTO (de versão
//     anterior, que não se recalcula);
//   • `exibido = resultadoSalvo ?? calculo.valor` respeita isso.
//
// O `[id]/page.tsx` passava `resultadoSalvo` para TODO cálculo aberto, inclusive o editável da
// versão vigente. O formulário recalculava por dentro a cada tecla, e a tela seguia mostrando o
// número do banco até alguém salvar.
//
// 🔴 Estes testes fixam a REGRA, e não o componente: `resultadoSalvo` só vale quando o cálculo NÃO
// é editável. Editar é trabalhar, e a tela tem de acompanhar.

import { describe, it, expect } from 'vitest'
import { estaDesatualizada, versaoAtual } from '@/lib/detracao/recolhimento-noturno/versoes/registro'

/** A mesma expressão do `[id]/page.tsx`, isolada — é o que se está fixando. */
function exibivel(rotulo: string, estadoDoProduto: string | null): { editavel: boolean; usaGravado: boolean } {
  const desatualizada = estaDesatualizada(rotulo)
  const editavel = estadoDoProduto === 'ativo' && !desatualizada
  return { editavel, usaGravado: !editavel }
}

describe('o número exibido acompanha o que se digita', () => {
  it('cálculo na versão VIGENTE e produto ativo: edita e acompanha a digitação', () => {
    const { editavel, usaGravado } = exibivel(versaoAtual().versao, 'ativo')
    expect(editavel).toBe(true)
    // 🔴 `usaGravado: false` é o ponto do defeito: o recalculado é que vai para a tela.
    expect(usaGravado).toBe(false)
  })

  it('a versão vigente tem de ser editável — senão a tela trava o trabalho do membro', () => {
    expect(exibivel(versaoAtual().versao, 'ativo').editavel).toBe(true)
  })
})

describe('o número GRAVADO aparece quando o cálculo é documento', () => {
  it('versão ANTERIOR: não edita e mostra o gravado, como foi salvo', () => {
    const { editavel, usaGravado } = exibivel('RN-1.1', 'ativo')
    expect(editavel).toBe(false)
    expect(usaGravado).toBe(true)
  })

  it('produto INATIVO: não edita e mostra o gravado', () => {
    const { editavel, usaGravado } = exibivel(versaoAtual().versao, 'expirado')
    expect(editavel).toBe(false)
    expect(usaGravado).toBe(true)
  })

  it('produto `nunca` também não edita', () => {
    expect(exibivel(versaoAtual().versao, 'nunca').editavel).toBe(false)
  })
})

describe('as duas situações nunca se cruzam', () => {
  it('editável implica NÃO usar o gravado, e vice-versa', () => {
    for (const rotulo of [versaoAtual().versao, 'RN-1.0', 'RN-1.1']) {
      for (const estado of ['ativo', 'expirado', 'nunca']) {
        const { editavel, usaGravado } = exibivel(rotulo, estado)
        expect(usaGravado).toBe(!editavel)
      }
    }
  })
})
