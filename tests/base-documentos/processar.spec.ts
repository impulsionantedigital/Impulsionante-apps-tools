// O processador de documentos com um repositório FALSO em memória: nada de Supabase, OpenAI nem
// worker. A extração falsa entrega os trechos pelos mesmos ganchos (`aoHash`, `aoLote`) que o
// `extrairNoWorker` de verdade usa.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Etapa, Extensao, Trecho } from '@/lib/base-documentos/tipos'
import type { Orcamento } from '@/lib/orcamento-tick'
import { PIORES_CASOS, PORTOES } from '@/lib/orcamento-tick'
import {
  CONCORRENCIA_CONTEXTO,
  processarVersao,
  RENOVACAO_MS,
  RESERVA_MS,
  TETO_TRECHOS_POR_VERSAO,
  type Deps,
  type RepoDocumentos,
  type VersaoReivindicada,
} from '@/server/base-documentos/processar'
import { _reiniciarParaTeste, _processamentoAtual, drenarDocumentos } from '@/server/base-documentos/tick'

type TrechoFalso = { id: string; caminho: string[]; texto: string; contexto: string | null; vetor: number[] | null }

type Opcoes = {
  arquivo?: string
  ext?: Extensao
  origem?: 'envio' | 'reprocesso'
  etapa?: Etapa | null
  /** Quantas vezes a versão já foi reivindicada, contando esta (o RPC incrementa). Padrão: 1. */
  tentativas?: number
  duplicataDe?: string
  someNaEtapa?: Etapa
  trechosProntosSemVetor?: number
  caminhoAntigo?: string
  faxina?: string[]
  /** Trechos que a extração falsa entrega; padrão: um por título do `arquivo`. */
  trechosExtraidos?: number
  /** Tamanho do objeto no Storage; `null` = objeto não encontrado. Padrão: o do `arquivo`. */
  tamanho?: number | null
}

function repoFalso(o: Opcoes = {}) {
  const arquivo = o.arquivo ?? '# A\num.\n# B\ndois.'
  const ext = o.ext ?? 'md'
  const versao: VersaoReivindicada = {
    id: 'v1',
    workspaceId: 'w1',
    documentoId: 'd1',
    nomeExibicao: 'Documento de teste',
    caminho: `w1/d1/v1.${ext}`,
    extensao: ext,
    origem: o.origem ?? 'envio',
    etapa: o.etapa ?? null,
    tentativas: o.tentativas ?? 1,
  }
  let seq = 0
  const trechos: TrechoFalso[] = []
  for (let i = 0; i < (o.trechosProntosSemVetor ?? 0); i++) {
    trechos.push({ id: `t${++seq}`, caminho: ['T'], texto: `pronto ${i}`, contexto: 'ctx', vetor: null })
  }
  const f = {
    versao,
    arquivo,
    trechosExtraidos: o.trechosExtraidos,
    etapas: [] as Etapa[],
    totais: null as { trechosTotal: number; custoEstimadoUsd: number } | null,
    promovida: false,
    trechos,
    motivo: null as string | null,
    removidos: [] as string[],
    remocoesEmLote: [] as string[][],
    baixou: false,
    sumiu: false,
    hash: null as string | null,
    apagouTrechos: 0,
    reivindicacoes: 0,
    fila: [versao] as VersaoReivindicada[],
    repo: null as unknown as RepoDocumentos,
  }
  f.repo = {
    reivindicar: async () => {
      f.reivindicacoes++
      return f.fila.shift() ?? null
    },
    renovar: async () => !f.sumiu,
    tamanhoDoObjeto: async () =>
      o.tamanho === undefined ? new TextEncoder().encode(arquivo).length : o.tamanho,
    baixar: async () => {
      f.baixou = true
      return new TextEncoder().encode(arquivo)
    },
    acharDuplicata: async () => o.duplicataDe ?? null,
    gravarHash: async (_v, h) => {
      f.hash = h
    },
    apagarTrechos: async () => {
      f.apagouTrechos++
      f.trechos.length = 0
    },
    inserirTrechos: async (_v, ts) => {
      if (f.sumiu) return false
      for (const t of ts) f.trechos.push({ id: `t${++seq}`, caminho: t.caminho, texto: t.texto, contexto: null, vetor: null })
      return true
    },
    marcarEtapa: async (_v, etapa, totais) => {
      f.etapas.push(etapa)
      if (totais) f.totais = totais
      if (o.someNaEtapa === etapa) {
        f.sumiu = true
        f.trechos.length = 0
      }
    },
    semContexto: async (_v, limite) =>
      f.trechos
        .filter((t) => t.contexto === null)
        .slice(0, limite)
        .map((t) => ({ id: t.id, caminho: t.caminho, texto: t.texto })),
    gravarContexto: async (_v, id, contexto) => {
      const t = f.trechos.find((x) => x.id === id)
      if (t) t.contexto = contexto
    },
    semVetor: async (_v, limite) =>
      f.trechos
        .filter((t) => t.contexto !== null && t.vetor === null)
        .slice(0, limite)
        .map((t) => ({ id: t.id, caminho: t.caminho, contexto: t.contexto, texto: t.texto })),
    gravarVetores: async (_v, itens) => {
      for (const it of itens) {
        const t = f.trechos.find((x) => x.id === it.id)
        if (t) t.vetor = it.vetor
      }
    },
    promover: async () => {
      if (f.sumiu) return null
      f.promovida = true
      return o.caminhoAntigo ?? ''
    },
    falhar: async (_v, motivo) => {
      f.motivo = motivo
    },
    removerObjeto: async (caminho) => {
      f.removidos.push(caminho)
    },
    removerObjetos: async (caminhos) => {
      f.remocoesEmLote.push([...caminhos])
      f.removidos.push(...caminhos)
    },
    faxina: async () => o.faxina ?? [],
    contagemDeFrases: async () => ({
      total: f.trechos.length,
      semFrase: f.trechos.filter((t) => t.contexto === '').length,
    }),
  }
  return f
}

type Falso = ReturnType<typeof repoFalso>

/** Corta o markdown falso por título: um trecho por `# `. */
function trechosDoArquivo(f: Falso): Trecho[] {
  if (f.trechosExtraidos !== undefined) {
    return Array.from({ length: f.trechosExtraidos }, (_, i) => ({
      caminho: [],
      pagina: null,
      secao: i,
      posicao: i,
      texto: `trecho ${i}`,
    }))
  }
  return f.arquivo
    .split(/^# /m)
    .filter(Boolean)
    .map((bloco, i) => {
      const [titulo, ...resto] = bloco.split('\n')
      return { caminho: [titulo], pagina: null, secao: i, posicao: i, texto: resto.join('\n').trim() }
    })
}

function deps(f: Falso, extra: Partial<Deps> = {}): Deps {
  const extrair: Deps['extrair'] = async (_dados, _ext, ganchos) => {
    if (!(await ganchos.aoHash('abc123'))) return { ok: false, parou: true }
    const todos = trechosDoArquivo(f)
    for (let i = 0; i < todos.length; i += 500) {
      if (!(await ganchos.aoLote(todos.slice(i, i + 500)))) return { ok: false, parou: true }
    }
    return { ok: true, total: todos.length, hash: 'abc123' }
  }
  return {
    repo: f.repo,
    extrair,
    frase: async (p) => `contexto de ${p.texto}`,
    vetores: async (textos) => ({ vetores: textos.map(() => [0.1, 0.2]), versao: 'openai:teste:2' }),
    ...extra,
  }
}

const orcamentoQueCabe: Orcamento = {
  comecoMs: 0,
  restaMs: () => 45_000,
  venceu: () => false,
  cabe: () => true,
  fatiaPara: () => 2_000,
}

afterEach(async () => {
  vi.useRealTimers()
  await _processamentoAtual()
  _reiniciarParaTeste()
})

describe('constantes', () => {
  it('contrato do processador e do braço do tick', () => {
    expect(RESERVA_MS).toBe(120_000)
    expect(TETO_TRECHOS_POR_VERSAO).toBe(20_000)
    expect(CONCORRENCIA_CONTEXTO).toBe(4)
    expect(RENOVACAO_MS).toBeLessThanOrEqual(RESERVA_MS / 2)
    expect(PIORES_CASOS.documentos).toBe(2_000)
    expect(PORTOES.documentos).toBe(2_000)
  })
})

describe('processarVersao', () => {
  it('caminho feliz: extrai, contextualiza, vetoriza e promove', async () => {
    const f = repoFalso({ arquivo: '# A\num.\n# B\ndois.', ext: 'md' })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.etapas).toEqual(['extraindo', 'contextualizando', 'vetorizando'])
    expect(f.promovida).toBe(true)
    expect(f.trechos).toHaveLength(2)
    expect(f.trechos.every((t) => t.contexto && t.vetor)).toBe(true)
    expect(f.hash).toBe('abc123')
    expect(f.totais?.trechosTotal).toBe(2)
    expect(f.totais?.custoEstimadoUsd).toBeGreaterThan(0)
    expect(f.motivo).toBeNull()
  })

  it('arquivo repetido termina em erro e apaga o objeto', async () => {
    const f = repoFalso({ duplicataDe: 'Almanaque das Ervas' })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.motivo).toBe('Este arquivo é igual a «Almanaque das Ervas», que já está na base.')
    expect(f.removidos).toContain(f.versao.caminho)
    expect(f.trechos).toHaveLength(0)
    expect(f.promovida).toBe(false)
  })

  it('objeto maior que o limite termina em erro com a frase do limite, sem baixar, e sai do bucket', async () => {
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '1')
    const f = repoFalso({ tamanho: 1024 * 1024 + 1 })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.motivo).toBe('O arquivo passa do limite de 1 MB.')
    expect(f.baixou).toBe(false)
    expect(f.removidos).toContain(f.versao.caminho)
    expect(f.promovida).toBe(false)
    vi.unstubAllEnvs()
  })

  it('objeto exatamente no limite é processado', async () => {
    vi.stubEnv('BASE_ARQUIVO_MAX_MB', '1')
    const f = repoFalso({ tamanho: 1024 * 1024 })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    vi.unstubAllEnvs()
  })

  it('objeto sem tamanho conhecido termina em erro, sem baixar', async () => {
    const f = repoFalso({ tamanho: null })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.motivo).toBe('O arquivo não está mais guardado. Envie o arquivo de novo.')
    expect(f.baixou).toBe(false)
    expect(f.promovida).toBe(false)
  })

  it('reprocesso não confere duplicata', async () => {
    const f = repoFalso({ origem: 'reprocesso', duplicataDe: 'Almanaque das Ervas' })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.motivo).toBeNull()
    expect(f.removidos).not.toContain(f.versao.caminho)
    expect(f.promovida).toBe(true)
  })

  it('documento excluído no meio para com sumiu (Review Focus 3)', async () => {
    const f = repoFalso({ someNaEtapa: 'contextualizando' })
    expect(await processarVersao(f.versao, deps(f))).toBe('sumiu')
    expect(f.promovida).toBe(false)
    expect(f.motivo).toBeNull()
  })

  it('documento excluído durante a extração (FK violada) para com sumiu', async () => {
    const f = repoFalso()
    const repo = { ...f.repo, inserirTrechos: async () => false }
    expect(await processarVersao(f.versao, deps(f, { repo }))).toBe('sumiu')
    expect(f.motivo).toBeNull()
    expect(f.promovida).toBe(false)
  })

  it('retoma etapa: versão reivindicada em vetorizando não reextrai (Review Focus 4)', async () => {
    const f = repoFalso({ etapa: 'vetorizando', trechosProntosSemVetor: 3 })
    const frase = vi.fn(async () => 'x')
    expect(await processarVersao(f.versao, deps(f, { frase }))).toBe('pronto')
    expect(f.baixou).toBe(false)
    expect(f.apagouTrechos).toBe(0)
    expect(frase).not.toHaveBeenCalled()
    expect(f.promovida).toBe(true)
    expect(f.trechos.every((t) => t.vetor)).toBe(true)
  })

  it('retoma em extraindo: apaga os trechos da tentativa anterior antes de reextrair', async () => {
    const f = repoFalso({ etapa: 'extraindo', trechosProntosSemVetor: 5 })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.apagouTrechos).toBeGreaterThanOrEqual(1)
    expect(f.trechos).toHaveLength(2)
  })

  it('extração interrompida antes (extraindo, tentativa 2): falha sem extrair e guarda o arquivo', async () => {
    const f = repoFalso({ etapa: 'extraindo', tentativas: 2, trechosProntosSemVetor: 3 })
    const extrair = vi.fn(deps(f).extrair)
    expect(await processarVersao(f.versao, deps(f, { extrair }))).toBe('erro')
    expect(f.motivo).toBe(
      'A leitura deste arquivo foi interrompida duas vezes (o servidor pode ter ficado sem memória). Tente um arquivo menor ou divida-o em partes.',
    )
    expect(extrair).not.toHaveBeenCalled()
    expect(f.baixou).toBe(false)
    expect(f.apagouTrechos).toBeGreaterThanOrEqual(1)
    expect(f.trechos).toHaveLength(0)
    expect(f.removidos).not.toContain(f.versao.caminho)
    expect(f.etapas).toEqual([])
    expect(f.promovida).toBe(false)
  })

  it('extração interrompida em tentativas posteriores (4) também falha sem extrair', async () => {
    const f = repoFalso({ etapa: 'extraindo', tentativas: 4 })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.baixou).toBe(false)
  })

  it('primeira tentativa de extração (tentativas 1) segue normal', async () => {
    const f = repoFalso({ etapa: 'extraindo', tentativas: 1 })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.baixou).toBe(true)
    expect(f.motivo).toBeNull()
  })

  it('versão sem etapa com tentativas > 1 (nunca começou a extrair) extrai normal', async () => {
    const f = repoFalso({ etapa: null, tentativas: 3 })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.baixou).toBe(true)
  })

  it.each(['contextualizando', 'vetorizando'] as const)(
    'retomada em %s com várias tentativas não é afetada',
    async (etapa) => {
      const f = repoFalso({ etapa, tentativas: 4, trechosProntosSemVetor: 3 })
      expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
      expect(f.baixou).toBe(false)
      expect(f.motivo).toBeNull()
      expect(f.promovida).toBe(true)
    },
  )

  it('promovida com mais de 20% dos trechos sem frase: um aviso com a contagem, sem conteúdo', async () => {
    const f = repoFalso({ arquivo: '# A\nsegredo um.\n# B\nsegredo dois.' })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await processarVersao(f.versao, deps(f, { frase: async () => 'falhou' }))).toBe('pronto')
    expect(aviso).toHaveBeenCalledTimes(1)
    const linha = aviso.mock.calls[0].join(' ')
    expect(linha).toContain('[base-documentos]')
    expect(linha).toContain('2 de 2')
    expect(linha).not.toContain('segredo')
    expect(linha).not.toContain('Documento de teste')
    aviso.mockRestore()
  })

  it('promovida com até 20% dos trechos sem frase: sem aviso', async () => {
    const f = repoFalso({ trechosExtraidos: 5 })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let n = 0
    const frase: Deps['frase'] = async () => (++n === 1 ? 'falhou' : 'ctx')
    expect(await processarVersao(f.versao, deps(f, { frase }))).toBe('pronto')
    expect(f.trechos.filter((t) => t.contexto === '')).toHaveLength(1)
    expect(aviso).not.toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('erro ao contar as frases não impede o pronto', async () => {
    const f = repoFalso()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo: RepoDocumentos = { ...f.repo, contagemDeFrases: async () => Promise.reject(new Error('fora')) }
    expect(await processarVersao(f.versao, deps(f, { repo }))).toBe('pronto')
    expect(f.promovida).toBe(true)
    aviso.mockRestore()
  })

  it('falha da frase não trava: trecho fica com contexto vazio', async () => {
    const f = repoFalso()
    expect(await processarVersao(f.versao, deps(f, { frase: async () => 'falhou' }))).toBe('pronto')
    expect(f.trechos).toHaveLength(2)
    expect(f.trechos.every((t) => t.contexto === '' && t.vetor)).toBe(true)
  })

  it('no máximo CONCORRENCIA_CONTEXTO frases ao mesmo tempo', async () => {
    const f = repoFalso({ trechosExtraidos: 30 })
    let agora = 0
    let pico = 0
    const frase: Deps['frase'] = async () => {
      agora++
      pico = Math.max(pico, agora)
      await new Promise((r) => setTimeout(r, 1))
      agora--
      return 'ctx'
    }
    expect(await processarVersao(f.versao, deps(f, { frase }))).toBe('pronto')
    expect(pico).toBe(CONCORRENCIA_CONTEXTO)
  })

  it('sem chave da OpenAI vira erro com motivo', async () => {
    const f = repoFalso()
    expect(await processarVersao(f.versao, deps(f, { frase: async () => 'sem_chave' }))).toBe('erro')
    expect(f.motivo).toBe('Falta a chave da OpenAI. Cadastre-a em Configurações para processar documentos.')
    expect(f.promovida).toBe(false)
  })

  it('sem chave na vetorização também vira erro com o mesmo motivo', async () => {
    const f = repoFalso()
    expect(await processarVersao(f.versao, deps(f, { vetores: async () => 'sem_chave' }))).toBe('erro')
    expect(f.motivo).toBe('Falta a chave da OpenAI. Cadastre-a em Configurações para processar documentos.')
  })

  it('vetorização que falha três vezes seguidas vira erro', async () => {
    const f = repoFalso()
    const vetores = vi.fn(async () => null)
    expect(await processarVersao(f.versao, deps(f, { vetores }))).toBe('erro')
    expect(vetores).toHaveBeenCalledTimes(3)
    expect(f.motivo).toBe('Não consegui gerar a busca por significado agora. Tente reprocessar mais tarde.')
  })

  it('uma falha isolada da vetorização não derruba', async () => {
    const f = repoFalso()
    let n = 0
    const vetores: Deps['vetores'] = async (textos) =>
      ++n === 1 ? null : { vetores: textos.map(() => [1]), versao: 'v' }
    expect(await processarVersao(f.versao, deps(f, { vetores }))).toBe('pronto')
  })

  it('passar de 20.000 trechos vira erro', async () => {
    const f = repoFalso({ trechosExtraidos: 20_001 })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.motivo).toBe('O arquivo geraria mais de 20.000 trechos. Divida-o em partes menores.')
    expect(f.promovida).toBe(false)
  })

  it('exatamente 20.000 trechos passa', async () => {
    const f = repoFalso({ trechosExtraidos: 20_000 })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
  }, 20_000)

  it('arquivo sem texto vira erro', async () => {
    const f = repoFalso({ trechosExtraidos: 0 })
    expect(await processarVersao(f.versao, deps(f))).toBe('erro')
    expect(f.motivo).toBe('Não encontrei texto neste arquivo.')
  })

  it('motivo da extração (arquivo ilegível) vira o motivo do erro', async () => {
    const f = repoFalso()
    const extrair: Deps['extrair'] = async () => ({ ok: false, motivo: 'Não consegui ler este arquivo.' })
    expect(await processarVersao(f.versao, deps(f, { extrair }))).toBe('erro')
    expect(f.motivo).toBe('Não consegui ler este arquivo.')
  })

  it('promover com outra versão ativa remove o objeto antigo', async () => {
    const f = repoFalso({ caminhoAntigo: 'w/d/velha.md' })
    expect(await processarVersao(f.versao, deps(f))).toBe('pronto')
    expect(f.removidos).toEqual(['w/d/velha.md'])
  })

  it('erro ao remover o objeto antigo não impede o pronto', async () => {
    const f = repoFalso({ caminhoAntigo: 'w/d/velha.md' })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = { ...f.repo, removerObjeto: async () => Promise.reject(new Error('storage fora')) }
    expect(await processarVersao(f.versao, deps(f, { repo }))).toBe('pronto')
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })
})

/** Maior intervalo sem renovação entre o início (0) e o fim da execução. */
function maiorIntervalo(instantes: number[], fim: number): number {
  const todos = [0, ...instantes, fim].sort((a, b) => a - b)
  return Math.max(...todos.slice(1).map((t, i) => t - todos[i]))
}

describe('renovação da reserva durante passos lentos', () => {
  it('download lento: a reserva é renovada a cada RESERVA_MS/2 no máximo', async () => {
    vi.useFakeTimers({ now: 0 })
    const f = repoFalso()
    const renovacoes: number[] = []
    const repo: RepoDocumentos = {
      ...f.repo,
      renovar: async () => {
        renovacoes.push(Date.now())
        return true
      },
      baixar: () => new Promise((r) => setTimeout(() => r(new TextEncoder().encode(f.arquivo)), 200_000)),
    }
    let fim = -1
    const p = processarVersao(f.versao, deps(f, { repo })).then((r) => ((fim = Date.now()), r))
    await vi.advanceTimersByTimeAsync(250_000)
    expect(await p).toBe('pronto')
    expect(renovacoes.filter((t) => t < 200_000).length).toBeGreaterThanOrEqual(6)
    expect(maiorIntervalo(renovacoes, fim)).toBeLessThanOrEqual(RESERVA_MS / 2)
  })

  it('frases lentas (50 × 15 s): a reserva não fica sem renovação por mais de RESERVA_MS/2', async () => {
    vi.useFakeTimers({ now: 0 })
    const f = repoFalso({ trechosExtraidos: 50 })
    const renovacoes: number[] = []
    const repo: RepoDocumentos = {
      ...f.repo,
      renovar: async () => {
        renovacoes.push(Date.now())
        return true
      },
    }
    const frase: Deps['frase'] = () => new Promise((r) => setTimeout(() => r('ctx'), 15_000))
    let fim = -1
    const p = processarVersao(f.versao, deps(f, { repo, frase })).then((r) => ((fim = Date.now()), r))
    await vi.advanceTimersByTimeAsync(400_000)
    expect(await p).toBe('pronto')
    expect(fim).toBeGreaterThanOrEqual(13 * 15_000)
    expect(maiorIntervalo(renovacoes, fim)).toBeLessThanOrEqual(RESERVA_MS / 2)
  })

  it('renovar devolve false no meio do download: para com sumiu e nada é promovido', async () => {
    vi.useFakeTimers({ now: 0 })
    const f = repoFalso()
    const extrair = vi.fn(deps(f).extrair)
    const repo: RepoDocumentos = {
      ...f.repo,
      renovar: async () => false,
      baixar: () => new Promise((r) => setTimeout(() => r(new TextEncoder().encode(f.arquivo)), 100_000)),
    }
    const p = processarVersao(f.versao, deps(f, { repo, extrair }))
    await vi.advanceTimersByTimeAsync(150_000)
    expect(await p).toBe('sumiu')
    expect(extrair).not.toHaveBeenCalled()
    expect(f.promovida).toBe(false)
    expect(f.motivo).toBeNull()
  })

  it('renovar devolve false durante um lote de frases lento: para com sumiu', async () => {
    vi.useFakeTimers({ now: 0 })
    const f = repoFalso({ trechosExtraidos: 50 })
    // As renovações das voltas (no instante 0) passam; a do relógio, aos 30 s, diz que sumiu.
    const repo: RepoDocumentos = { ...f.repo, renovar: async () => Date.now() < RENOVACAO_MS }
    const frase = vi.fn<Deps['frase']>(() => new Promise((r) => setTimeout(() => r('ctx'), 15_000)))
    const p = processarVersao(f.versao, deps(f, { repo, frase }))
    await vi.advanceTimersByTimeAsync(400_000)
    expect(await p).toBe('sumiu')
    expect(f.promovida).toBe(false)
    expect(frase.mock.calls.length).toBeLessThan(50)
  })
})

describe('drenarDocumentos', () => {
  it('não começa segundo processamento enquanto o primeiro roda', async () => {
    const f = repoFalso()
    f.fila.push({ ...f.versao, id: 'v2' })
    let soltar!: () => void
    const preso = new Promise<void>((r) => (soltar = r))
    const d = deps(f)
    const extrairOriginal = d.extrair
    d.extrair = async (...args) => {
      await preso
      return extrairOriginal(...args)
    }

    const primeiro = await drenarDocumentos(orcamentoQueCabe, d)
    expect(primeiro).toEqual({ iniciou: true, emAndamento: true, limpos: 0 })
    const segundo = await drenarDocumentos(orcamentoQueCabe, d)
    expect(segundo).toEqual({ iniciou: false, emAndamento: true, limpos: 0 })
    expect(f.reivindicacoes).toBe(1)

    soltar()
    await _processamentoAtual()
    expect(f.promovida).toBe(true)
  })

  it('chamadas simultâneas reivindicam uma vez só', async () => {
    const f = repoFalso()
    f.fila.push({ ...f.versao, id: 'v2' })
    const d = deps(f)
    await Promise.all([drenarDocumentos(orcamentoQueCabe, d), drenarDocumentos(orcamentoQueCabe, d)])
    expect(f.reivindicacoes).toBe(1)
  })

  it('depois de terminar, a próxima chamada reivindica de novo', async () => {
    const f = repoFalso()
    const d = deps(f)
    await drenarDocumentos(orcamentoQueCabe, d)
    await _processamentoAtual()
    expect(await drenarDocumentos(orcamentoQueCabe, d)).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(f.reivindicacoes).toBe(2)
  })

  it('erro no processamento é logado e libera o próximo', async () => {
    const f = repoFalso()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = { ...f.repo, baixar: async () => Promise.reject(new Error('storage fora')) }
    const r = await drenarDocumentos(orcamentoQueCabe, deps(f, { repo }))
    expect(r.iniciou).toBe(true)
    await _processamentoAtual()
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('[base-documentos]'), expect.any(String))
    aviso.mockRestore()
    await drenarDocumentos(orcamentoQueCabe, deps(f))
    expect(f.reivindicacoes).toBe(2)
  })

  it('faxina: objetos de envios abandonados são apagados', async () => {
    const f = repoFalso({ faxina: ['w/d/v.pdf'] })
    f.fila.length = 0
    const r = await drenarDocumentos(orcamentoQueCabe, deps(f))
    expect(f.removidos).toEqual(['w/d/v.pdf'])
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 1 })
  })

  it('faxina apaga os objetos numa chamada só', async () => {
    const f = repoFalso({ faxina: ['a', 'b', 'c'] })
    f.fila.length = 0
    const r = await drenarDocumentos(orcamentoQueCabe, deps(f))
    expect(f.remocoesEmLote).toEqual([['a', 'b', 'c']])
    expect(r.limpos).toBe(3)
  })

  it('faxina com muitos objetos: grupos de 100', async () => {
    const caminhos = Array.from({ length: 250 }, (_, i) => `w/d/${i}.pdf`)
    const f = repoFalso({ faxina: caminhos })
    f.fila.length = 0
    const r = await drenarDocumentos(orcamentoQueCabe, deps(f))
    expect(f.remocoesEmLote.map((g) => g.length)).toEqual([100, 100, 50])
    expect(r.limpos).toBe(250)
  })

  it('remoção lenta não segura o braço além da fatia', async () => {
    const f = repoFalso({ faxina: ['a', 'b'] })
    f.fila.length = 0
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo: RepoDocumentos = { ...f.repo, removerObjetos: () => new Promise(() => {}) }
    const inicio = Date.now()
    const r = await drenarDocumentos({ ...orcamentoQueCabe, fatiaPara: () => 100 }, deps(f, { repo }))
    expect(Date.now() - inicio).toBeLessThan(1_000)
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('faxina lenta não segura o braço além da fatia e tem a consulta abortada', async () => {
    const f = repoFalso()
    f.fila.length = 0
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let sinalDaFaxina: AbortSignal | undefined
    const repo: RepoDocumentos = {
      ...f.repo,
      faxina: (sinal) => {
        sinalDaFaxina = sinal
        return new Promise(() => {})
      },
    }
    const inicio = Date.now()
    const r = await drenarDocumentos({ ...orcamentoQueCabe, fatiaPara: () => 150 }, deps(f, { repo }))
    expect(Date.now() - inicio).toBeLessThan(1_000)
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(sinalDaFaxina?.aborted).toBe(true)
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('[base-documentos]'), expect.anything())
    aviso.mockRestore()
  })

  it('reivindicação lenta: o braço volta dentro da fatia, sem lançar, e aborta a consulta', async () => {
    const f = repoFalso()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let sinalDaReivindicacao: AbortSignal | undefined
    const repo: RepoDocumentos = {
      ...f.repo,
      reivindicar: (_reserva, sinal) => {
        sinalDaReivindicacao = sinal
        return new Promise(() => {})
      },
    }
    const inicio = Date.now()
    const r = await drenarDocumentos({ ...orcamentoQueCabe, fatiaPara: () => 150 }, deps(f, { repo }))
    expect(Date.now() - inicio).toBeLessThan(1_000)
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(sinalDaReivindicacao?.aborted).toBe(true)
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
    // O braço não ficou preso: a próxima batida reivindica normalmente.
    expect((await drenarDocumentos(orcamentoQueCabe, deps(f))).iniciou).toBe(true)
  })

  it('reivindicação que lança vira aviso, não exceção', async () => {
    const f = repoFalso()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo: RepoDocumentos = { ...f.repo, reivindicar: async () => Promise.reject(new Error('banco fora')) }
    const r = await drenarDocumentos(orcamentoQueCabe, deps(f, { repo }))
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('faxina que gasta a fatia inteira: pula a reivindicação nesta batida', async () => {
    const f = repoFalso()
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo: RepoDocumentos = { ...f.repo, faxina: () => new Promise(() => {}) }
    const r = await drenarDocumentos({ ...orcamentoQueCabe, fatiaPara: () => 0 }, deps(f, { repo }))
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(f.reivindicacoes).toBe(0)
    aviso.mockRestore()
  })

  it('sem orçamento não faz nada', async () => {
    const f = repoFalso({ faxina: ['w/d/v.pdf'] })
    const faxina = vi.spyOn(f.repo, 'faxina')
    const r = await drenarDocumentos({ ...orcamentoQueCabe, cabe: () => false }, deps(f))
    expect(r).toEqual({ iniciou: false, emAndamento: false, limpos: 0 })
    expect(faxina).not.toHaveBeenCalled()
    expect(f.reivindicacoes).toBe(0)
  })
})
