// tests/detracao/recolhimento-noturno/checkbox-feriados.spec.ts
//
// O checkbox "computar feriados nacionais em dias úteis" precisa EXISTIR na tela e vir
// desmarcado por padrão. Parece teste de markup e não é:
//
//   • o controle é o único caminho pela qual o membro liga os feriados NACIONAIS — o motor lê
//     `incluirFeriadosUteis`, e sem este `<input>` a funcionalidade não tem como ser acionada;
//   • desmarcado por padrão é decisão jurídica, não estética: computar feriado como dia integral
//     muda o número, e o produto não presume isso pelo membro;
//   • o motor não é tocado por este teste — ele fixa a LIGAÇÃO tela → campo do formulário, que é
//     o que se perde num refactor de layout sem nenhum teste vermelho.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CamposSegmento from '@/app/(app)/ferramentas/detracao/[calculadora]/CamposSegmento'
import { segmentoFormularioEmBranco } from '@/lib/detracao/recolhimento-noturno/formulario'
import type { SegmentoFormulario } from '@/lib/detracao/recolhimento-noturno/formulario'

function renderCampos(segmento: SegmentoFormulario, avancado = false): string {
  return renderToStaticMarkup(
    createElement(CamposSegmento as never, { segmento, aoMudar: () => {}, avancado } as never),
  )
}

describe('checkbox de feriados nacionais no formulário', () => {
  it('aparece, com o texto que diz o que ele faz', () => {
    const html = renderCampos(segmentoFormularioEmBranco())
    expect(html).toContain('Computar feriados nacionais')
    expect(html).toMatch(/type="checkbox"/)
  })

  it('aparece também no modo simples — não está escondido atrás do avançado', () => {
    const html = renderCampos(segmentoFormularioEmBranco(), false)
    expect(html).toContain('Computar feriados nacionais')
  })

  it('vem desmarcado por padrão', () => {
    // Sem `checked` no markup, um `<input type="checkbox">` renderiza desmarcado.
    const html = renderCampos({ ...segmentoFormularioEmBranco(), incluirFeriadosUteis: false })
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/)
  })

  it('reflete o estado marcado quando o segmento já vem com a opção ligada', () => {
    const html = renderCampos({ ...segmentoFormularioEmBranco(), incluirFeriadosUteis: true })
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/)
  })
})
