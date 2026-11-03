# Estado: base de conhecimento com arquivos

## Spike TUS (envio retomável com token assinado)

Pulado por decisão do usuário (nenhum Supabase tocado). Fica adiado para a Task 12 (prova final).
Cabeçalhos, retomada e limite de 413 continuam **não verificados**.

## Spike do worker no build standalone (Next 16.2.12, `next build` sem flags = Turbopack)

**Variante A falhou**: `new Worker(new URL('./w.worker.ts', import.meta.url))` (e também `.mjs`)
quebra o build do Turbopack com `Module not found: Can't resolve './w.worker.ts'`.

**Variante B funcionou** (build + `node .next/standalone/server.js` + curl na rota):

- Worker em arquivo `.mjs` puro (JS, sem TypeScript): `src/server/workers/w.worker.mjs`,
  que faz `import ... from 'unpdf'` e responde via `parentPort`.
- Carregado por caminho absoluto, sem `import.meta.url`:
  `new Worker(path.join(process.cwd(), 'src', 'server', 'workers', 'w.worker.mjs'), { resourceLimits: { maxOldGenerationSizeMb: 768 } })`
- `next.config.ts` precisa de `outputFileTracingIncludes` para a rota que usa o worker, com a
  pasta do worker **e** o `unpdf` (o worker não é rastreado pelo bundler):
  `{ '/api/<rota>': ['./src/server/workers/**/*', './node_modules/unpdf/**/*'] }`
- Resultado no standalone: o arquivo e `node_modules/unpdf` apareceram em `.next/standalone`, o
  worker importou `unpdf` e respondeu (`typeof extractText === 'function'`). O Dockerfile já copia
  `.next/standalone`, então vale igual em produção.
- `resourceLimits: { maxOldGenerationSizeMb: 768 }` foi aceito sem erro.

Para a Task 6: usar a variante B. O worker tem de ser JS puro (`.mjs`); dependências que ele
importa precisam entrar no `outputFileTracingIncludes` (conferir também as dependências
transitivas do `unpdf`, se alguma for resolvida fora de `node_modules/unpdf`).
