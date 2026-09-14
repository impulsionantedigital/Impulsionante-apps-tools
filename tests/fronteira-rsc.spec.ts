import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Guarda da fronteira servidor→cliente (RSC).
 *
 * 🔴 O QUE ESTE TESTE IMPEDE: em 14/09/2026 a calculadora devolvia 500 em produção — `/novo` e
 * `/[id]` — porque a página do servidor passava o objeto `motor` (que tem o método `calcular`)
 * como prop para a `Calculadora`, que é `'use client'`. O React recusa a prop inteira ao
 * serializar:
 *
 *     Functions cannot be passed directly to Client Components unless you explicitly expose it
 *     by marking it with "use server".
 *
 * Nem o TypeScript nem o `pnpm build` pegavam: o tipo da prop era legítimo, e as duas páginas são
 * dinâmicas, então o erro só nascia a cada REQUISIÇÃO. Daí a guarda ser estática e viver aqui.
 *
 * A regra em uma linha: **o que atravessa para um componente de cliente tem de ser serializável**
 * — dado, nunca função. Cliente→cliente pode tudo, porque aí não há serialização.
 */

const RAIZ = resolve(__dirname, '..', 'src')

function arquivos(dir: string, ext: string[]): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, ext))
    else if (ext.some((e) => nome.endsWith(e))) saida.push(caminho)
  }
  return saida
}

const relativo = (f: string) => f.slice(resolve(RAIZ, '..').length + 1)

/** `'use client'` só vale na primeira instrução do módulo. */
const ehCliente = (f: string) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8').slice(0, 200))

/** Tipos declarados no projeto que carregam método ou propriedade de função. */
function tiposComFuncao(): Set<string> {
  const nomes = new Set<string>()
  for (const f of arquivos(RAIZ, ['.ts', '.tsx'])) {
    const txt = readFileSync(f, 'utf8')
    const re = /export (?:type|interface) (\w+)[^=|{]*[={]\s*\{([\s\S]*?)\n\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(txt))) {
      const [, nome, corpo] = m
      // `calcular(entrada): Resultado` ou `aoMudar: (x) => void`
      if (/^\s*\w+\s*\([^)]*\)\s*:/m.test(corpo) || /:\s*\([^)]*\)\s*=>/m.test(corpo)) nomes.add(nome)
    }
  }
  return nomes
}

/** Imports default relativos do arquivo: nome do componente → caminho do módulo. */
function importesRelativos(f: string, txt: string): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const l of txt.split('\n')) {
    const m = /^import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]/.exec(l)
    if (!m) continue
    for (const ext of ['.tsx', '/index.tsx']) {
      const alvo = resolve(dirname(f), m[2] + ext)
      try { statSync(alvo); mapa.set(m[1], alvo); break } catch { /* tenta a próxima */ }
    }
  }
  return mapa
}

describe('fronteira servidor→cliente', () => {
  it('nenhum componente de SERVIDOR passa, a um cliente, prop de tipo que carrega função', () => {
    const comFuncao = tiposComFuncao()
    // Se esta lista esvaziar, o teste vira decorativo — e é justamente `MotorDecreto` o caso real.
    expect(comFuncao.has('MotorDecreto')).toBe(true)

    // Componentes de cliente que declaram alguma prop de tipo com função. Ter a prop não é
    // defeito nenhum: `BarraSalvar` recebe o motor da `Calculadora`, e cliente→cliente não
    // serializa. Vira defeito só quando quem passa é o servidor, que é o que se verifica abaixo.
    const suspeitos = new Map<string, string[]>()
    for (const f of arquivos(RAIZ, ['.tsx'])) {
      if (!ehCliente(f)) continue
      const txt = readFileSync(f, 'utf8')
      const props: string[] = []
      for (const tipo of comFuncao) {
        const re = new RegExp(`^\\s*(?:readonly\\s+)?(\\w+)\\??:\\s*(?:readonly\\s+)?${tipo}\\b`, 'm')
        const m = re.exec(txt)
        if (m) props.push(m[1])
      }
      if (props.length) suspeitos.set(f, props)
    }
    expect([...suspeitos.keys()].length, 'nenhum cliente com prop de função: guarda cega').toBeGreaterThan(0)

    const culpados: string[] = []
    for (const f of arquivos(RAIZ, ['.tsx'])) {
      if (ehCliente(f)) continue
      const txt = readFileSync(f, 'utf8')
      for (const [nome, alvo] of importesRelativos(f, txt)) {
        const props = suspeitos.get(alvo)
        if (!props) continue
        for (const prop of props) {
          // A prop precisa aparecer DENTRO da abertura desta tag, não em qualquer lugar do arquivo.
          const re = new RegExp(`<${nome}\\b[^>]{0,400}?\\b${prop}=\\{`, 's')
          if (re.test(txt)) culpados.push(`${relativo(f)} → <${nome}> (cliente) recebe "${prop}"`)
        }
      }
    }
    expect(culpados).toEqual([])
  })

  it('nenhum componente de servidor passa função inline para um componente de cliente', () => {
    const culpados: string[] = []
    for (const f of arquivos(RAIZ, ['.tsx'])) {
      if (ehCliente(f)) continue // cliente→cliente não serializa: pode passar função à vontade
      const linhas = readFileSync(f, 'utf8').split('\n')
      // De quem o arquivo importa, para saber se o destino da prop é cliente.
      const importados = importesRelativos(f, linhas.join('\n'))
      let atual: string | null = null
      linhas.forEach((l, i) => {
        const abre = /<([A-Z]\w*)/.exec(l)
        if (abre) atual = abre[1]
        const temFuncao = /\w+=\{\s*(?:async\s*)?\(?[\w\s,]*\)?\s*=>/.test(l) || /\w+=\{\s*(?:async\s+)?function\b/.test(l)
        if (!temFuncao || !atual) return
        const destino = importados.get(atual)
        if (destino && ehCliente(destino)) {
          culpados.push(`${relativo(f)}:${i + 1} → <${atual}> (cliente) recebe função inline`)
        }
      })
    }
    expect(culpados).toEqual([])
  })

  it('a Calculadora resolve o motor pelo registro, e as páginas passam só o id', () => {
    const calc = readFileSync(resolve(RAIZ, 'app/(app)/ferramentas/cic-2025/Calculadora.tsx'), 'utf8')
    expect(calc).toMatch(/^\s*['"]use client['"]/m)
    expect(calc).toContain("from '@/lib/indulto-comutacao/registro'")
    expect(calc).toMatch(/decretoId: string/)
    expect(calc).not.toMatch(/^\s*motor: MotorDecreto/m)

    for (const pagina of ['novo/page.tsx', '[id]/page.tsx']) {
      const txt = readFileSync(resolve(RAIZ, 'app/(app)/ferramentas/cic-2025', pagina), 'utf8')
      expect(txt, pagina).toMatch(/<Calculadora[\s\S]{0,120}decretoId=\{motor\.id\}/)
      expect(txt, pagina).not.toMatch(/<Calculadora[\s\S]{0,120}motor=\{motor\}/)
    }
  })
})
