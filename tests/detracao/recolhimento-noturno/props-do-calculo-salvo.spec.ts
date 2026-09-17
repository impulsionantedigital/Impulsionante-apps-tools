// Regressivo do defeito relatado em tela: ao salvar, o cálculo era criado (o dado no banco estava
// correto) mas a tela reabria com o FORMULÁRIO VAZIO e a mensagem "dataInicio deve estar no formato
// AAAA-MM-DD (recebido: "")".
//
// Causa: o `<Calculadora>` do `[id]/page.tsx` tinha perdido as props `inicial`, `calculoId` e
// `tituloInicial` — sobraram só as três que a arquitetura de versões acrescentou. Sem `inicial`, a
// tela monta o formulário EM BRANCO; e o vazio, ao ser validado, produz exatamente aquela mensagem.
//
// 🔴 O dano não era só visual: sem `calculoId`, o botão "Salvar" tentava CRIAR um cálculo novo em
// vez de atualizar o aberto — cada salvamento gerava outro registro.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGINA = resolve(
  process.cwd(),
  'src/app/(app)/ferramentas/detracao/[calculadora]/[id]/page.tsx',
)

describe('a página do cálculo salvo passa o que a tela precisa', () => {
  const fonte = readFileSync(PAGINA, 'utf8')

  it('passa `inicial` — sem isto o formulário abre em branco', () => {
    expect(fonte).toMatch(/inicial=\{calculo\.entrada\}/)
  })

  it('passa `calculoId` — sem isto "Salvar" cria outro registro em vez de atualizar', () => {
    expect(fonte).toMatch(/calculoId=\{calculo\.id\}/)
  })

  it('passa `tituloInicial` — sem isto o título some da barra', () => {
    expect(fonte).toMatch(/tituloInicial=\{calculo\.titulo\}/)
  })

  it('passa `versao` — sem isto a tela abriria com o motor da versão ATUAL', () => {
    expect(fonte).toMatch(/versao=\{versao\.versao\}/)
  })

  it('condiciona `resultadoSalvo` a não-editável — senão o número não acompanha a digitação', () => {
    expect(fonte).toMatch(/resultadoSalvo=\{editavel \? undefined : calculo\.resultado\}/)
  })
})
