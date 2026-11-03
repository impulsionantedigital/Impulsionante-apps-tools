import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // O worker de extração da base é carregado por caminho (`new Worker(<cwd>/src/server/workers/…)`),
  // que o rastreador do Next não enxerga. Ele é um arquivo só, com as dependências embutidas
  // (gerado por `scripts/empacotar-worker.mjs` no `pnpm build`), então basta incluí-lo na rota
  // que dispara o processamento.
  outputFileTracingIncludes: {
    '/api/interno/tick': ['./src/server/workers/extrator.gen.mjs'],
  },
}

export default nextConfig
