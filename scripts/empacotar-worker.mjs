// Empacota o worker de extração da base de conhecimento num ÚNICO `.mjs` autossuficiente.
//
// Por que existe: o Turbopack do Next 16 não resolve `new Worker(new URL('./x.ts', import.meta.url))`
// (medido no spike — ver docs/superpowers/ESTADO-base-conhecimento-arquivos.md), e um `.mjs` cru
// não importa o TypeScript do projeto. Então o worker é escrito em TS e este script o transforma
// em JS antes do `next build` (o `pnpm build` roda os dois). Tudo vai embutido — unpdf, mammoth,
// node-html-parser, papaparse — para o standalone não depender de nada em `node_modules`.
//
// Uso: `node scripts/empacotar-worker.mjs [saida]` ou `empacotarWorker(saida)` (os testes usam).
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ENTRADA_WORKER = path.join(raiz, 'src/server/base-documentos/extrator.worker.ts')
export const SAIDA_WORKER = path.join(raiz, 'src/server/workers/extrator.gen.mjs')

/**
 * Gera o worker empacotado em `saida` (padrão: `src/server/workers/extrator.gen.mjs`).
 * @param {string} [saida]
 * @returns {Promise<string>} o caminho absoluto gerado
 */
export async function empacotarWorker(saida = SAIDA_WORKER) {
  const destino = path.resolve(saida)
  await build({
    entryPoints: [ENTRADA_WORKER],
    outfile: destino,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: { '@': path.join(raiz, 'src') },
    // Dependências CommonJS (mammoth e as dele) chamam `require` para módulos do Node; em ESM essa
    // função não existe, então o banner a recria. `__filename`/`__dirname` idem.
    banner: {
      js: [
        '// GERADO por scripts/empacotar-worker.mjs — não edite; edite src/server/base-documentos/extrator.worker.ts.',
        "import { createRequire as __criarRequire } from 'node:module';",
        "import { fileURLToPath as __paraCaminho } from 'node:url';",
        'const require = __criarRequire(import.meta.url);',
        'const __filename = __paraCaminho(import.meta.url);',
        "const __dirname = __paraCaminho(new URL('.', import.meta.url));",
      ].join('\n'),
    },
    legalComments: 'none',
    logLevel: 'warning',
  })
  return destino
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const gerado = await empacotarWorker(process.argv[2])
  console.log(`worker de extração empacotado em ${path.relative(process.cwd(), gerado)}`)
}
