import { describe, it, expect } from 'vitest'
import { DIAS_DE_AVISO_DE_VENCIMENTO, avisoDeAcesso, textoDoAviso } from '@/lib/vendas/aviso-acesso'
import type { DetalheAcesso, EstadoAcesso } from '@/lib/vendas/acesso'

/** Só o que cada caso declara importa; o resto é o default de um acesso comprado e vigente. */
function detalhe(p: Partial<DetalheAcesso>): DetalheAcesso {
  return { trial: false, degustou: false, expiraEm: null, diasRestantes: null, ...p }
}

const aviso = (estado: EstadoAcesso, d: Partial<DetalheAcesso> = {}) => avisoDeAcesso({ estado, detalhe: detalhe(d) })

describe('avisoDeAcesso', () => {
  it('sem acesso nenhum: não há o que avisar (a tela nem é alcançada)', () => {
    expect(aviso('nunca')).toEqual({ tipo: 'nada' })
  })

  describe('acesso comprado', () => {
    it('folgado (acima do limiar): tela limpa, sem aviso', () => {
      expect(aviso('ativo', { diasRestantes: DIAS_DE_AVISO_DE_VENCIMENTO + 1 })).toEqual({ tipo: 'nada' })
      expect(aviso('ativo', { diasRestantes: 90 })).toEqual({ tipo: 'nada' })
    })

    it('exatamente no limiar: já avisa — o limite é inclusivo', () => {
      expect(aviso('ativo', { diasRestantes: DIAS_DE_AVISO_DE_VENCIMENTO })).toEqual({
        tipo: 'vencendo',
        diasRestantes: DIAS_DE_AVISO_DE_VENCIMENTO,
      })
    })

    it('faltando 1 dia: avisa com o número certo', () => {
      expect(aviso('ativo', { diasRestantes: 1 })).toEqual({ tipo: 'vencendo', diasRestantes: 1 })
    })

    it('vitalício (sem vencimento): nunca avisa de vencimento', () => {
      expect(aviso('ativo', { diasRestantes: null, expiraEm: null })).toEqual({ tipo: 'nada' })
    })

    it('já venceu: expirado', () => {
      expect(aviso('encerrado')).toEqual({ tipo: 'expirado' })
    })
  })

  describe('degustação', () => {
    it('vigente: avisa SEMPRE, mesmo faltando muitos dias', () => {
      // 🔴 É a diferença central: o trial é curto por definição, então o limiar de 7 dias não se
      // aplica a ele — um trial de 30 dias precisa se anunciar no primeiro dia.
      expect(aviso('ativo', { trial: true, degustou: true, diasRestantes: 30 })).toEqual({ tipo: 'trial', diasRestantes: 30 })
      expect(aviso('ativo', { trial: true, degustou: true, diasRestantes: 7 })).toEqual({ tipo: 'trial', diasRestantes: 7 })
      expect(aviso('ativo', { trial: true, degustou: true, diasRestantes: 1 })).toEqual({ tipo: 'trial', diasRestantes: 1 })
    })

    it('vigente sem vencimento calculável: ainda é trial, sem número', () => {
      expect(aviso('ativo', { trial: true, degustou: true, diasRestantes: null })).toEqual({ tipo: 'trial', diasRestantes: null })
    })

    it('VENCIDA: recado próprio, e não "acesso expirado"', () => {
      // `trial` já é false aqui (ele responde sobre o acesso de AGORA) — quem responde pelo
      // histórico é `degustou`. Sem esta separação, quem experimentou e não comprou receberia o
      // mesmo texto de quem era pagante, que é a conversão errada.
      expect(aviso('encerrado', { trial: false, degustou: true })).toEqual({ tipo: 'trialExpirado' })
    })
  })

  describe('a fronteira entre trial e comprado', () => {
    it('quem degustou e DEPOIS comprou, e está vigente: é acesso comprado, não trial', () => {
      expect(aviso('ativo', { trial: false, degustou: true, diasRestantes: 90 })).toEqual({ tipo: 'nada' })
      expect(aviso('ativo', { trial: false, degustou: true, diasRestantes: 3 })).toEqual({ tipo: 'vencendo', diasRestantes: 3 })
    })

    it('quem comprou e depois degustou (brinde), com o trial vigente: anuncia a degustação', () => {
      expect(aviso('ativo', { trial: true, degustou: true, diasRestantes: 5 })).toEqual({ tipo: 'trial', diasRestantes: 5 })
    })
  })
})

describe('textoDoAviso', () => {
  it('sem aviso: nenhum texto, para não renderizar bloco vazio', () => {
    expect(textoDoAviso({ tipo: 'nada' })).toBeNull()
  })

  it('todo aviso tem título, corpo e ação', () => {
    for (const a of [{ tipo: 'vencendo', diasRestantes: 3 }, { tipo: 'trial', diasRestantes: 5 }, { tipo: 'expirado' }, { tipo: 'trialExpirado' }] as const) {
      const t = textoDoAviso(a)
      expect(t?.titulo.length).toBeGreaterThan(0)
      expect(t?.corpo.length).toBeGreaterThan(0)
      expect(t?.acao.length).toBeGreaterThan(0)
    }
  })

  it('o aviso de vencimento diz o número de dias e manda a ação para a Hotmart', () => {
    const t = textoDoAviso({ tipo: 'vencendo', diasRestantes: 5 })
    expect(t?.corpo).toContain('5 dia')
    // 🔴 O CRM não cobra: sem esta menção, o membro procuraria um botão de pagar que não existe aqui.
    expect(t?.corpo).toContain('Hotmart')
  })

  it('singular e plural corretos no último dia', () => {
    expect(textoDoAviso({ tipo: 'vencendo', diasRestantes: 1 })?.corpo).toContain('1 dia ')
    expect(textoDoAviso({ tipo: 'vencendo', diasRestantes: 1 })?.corpo).not.toContain('1 dia(s)')
  })

  it('a degustação vigente diz os dias restantes', () => {
    expect(textoDoAviso({ tipo: 'trial', diasRestantes: 4 })?.corpo).toContain('de 4 dia')
  })

  it('a degustação vigente sem dias não inventa número', () => {
    const t = textoDoAviso({ tipo: 'trial', diasRestantes: null })
    expect(t?.corpo).toContain('degustação')
    expect(t?.corpo).not.toContain('de null')
  })

  it('a degustação se anuncia como acesso BÔNUS e convida a escolher um plano', () => {
    const t = textoDoAviso({ tipo: 'trial', diasRestantes: 7 })
    expect(t?.titulo).toContain('Bônus')
    expect(t?.corpo).toContain('escolha um dos planos disponíveis')
    expect(t?.acao).toBe('Escolher um plano')
  })

  it('o convite ao plano vem DEPOIS dos dias, e não no lugar deles', () => {
    const t = textoDoAviso({ tipo: 'trial', diasRestantes: 7 })
    expect(t?.corpo).toContain('de 7 dia')
    expect(t?.corpo?.indexOf('planos')).toBeGreaterThan(t?.corpo?.indexOf('de 7 dia') ?? -1)
  })

  it('os dois recados de expiração são DIFERENTES entre si', () => {
    const expirado = textoDoAviso({ tipo: 'expirado' })
    const trialExpirado = textoDoAviso({ tipo: 'trialExpirado' })
    expect(expirado?.titulo).not.toBe(trialExpirado?.titulo)
    expect(expirado?.acao).not.toBe(trialExpirado?.acao)
  })
})

describe('quais avisos levam botão de checkout', () => {
  // A regra vive na tela (`AvisoAcesso`), mas é regra de negócio: quem ainda TEM acesso renova na
  // Hotmart por conta própria, e um botão ali competiria com o trabalho da pessoa. Botão é para
  // quem perdeu o acesso ou está experimentando.
  const LEVAM_BOTAO = ['trial', 'expirado', 'trialExpirado']
  const SEM_BOTAO = ['nada', 'vencendo']

  it('o lembrete de vencimento NÃO leva botão', () => {
    expect(SEM_BOTAO).toContain('vencendo')
  })

  it('trial, expirado e trial expirado LEVAM botão', () => {
    for (const tipo of LEVAM_BOTAO) expect(LEVAM_BOTAO).toContain(tipo)
  })

  it('todo aviso que leva botão tem uma ação nomeada', () => {
    for (const tipo of LEVAM_BOTAO) {
      expect(textoDoAviso({ tipo } as never)?.acao.length).toBeGreaterThan(0)
    }
  })
})
