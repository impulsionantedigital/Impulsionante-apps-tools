// scripts/verify-caminhos-aposentados.mjs
//
// 🔴 Barreira contra a RESSURREIÇÃO de caminhos que já foram substituídos.
//
// POR QUE ISTO EXE: durante a migração do recolhimento noturno para o modelo de VERSÕES
// (`src/lib/detracao/recolhimento-noturno/versoes/`), a estrutura antiga continuou no disco — fora
// do git, sem aparecer no `git status` comum. Quando alguém rodou `git add -A`, ela entrou num
// commit junto com uma correção de CSS: 2037 linhas de código morto, incluindo um SEGUNDO motor de
// cálculo do mesmo produto.
//
// O risco não é o espaço em disco, é a AMBIGUIDADE: dois motores de recolhimento noturno no
// repositório fazem quem for mexer depois escolher o errado — e o errado calcula diferente.
//
// Um `rm` não é garantia: foi exatamente o que se fez antes, e os arquivos voltaram (o ambiente de
// desenvolvimento mantém cópias, e um `git add -A` os traz de volta sem aviso). Esta barreira falha
// no lugar onde a decisão é tomada, que é o build.
//
// Uso: `node scripts/verify-caminhos-aposentados.mjs` — e vale acrescentá-lo ao `build`.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Caminho aposentado → por que ele não pode voltar. */
const APOSENTADOS = [
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/motor.ts',
    motivo:
      'O motor antigo (sem versões). O vivo é `versoes/rn-X-Y/motor.ts`, escolhido pelo rótulo gravado em cada cálculo.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/tipos.ts',
    motivo: 'Tipos do motor antigo. Os vivos são de cada versão, em `versoes/rn-X-Y/tipos.ts`.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/formulario.ts',
    motivo:
      'Formulário do motor antigo. Cada versão tem o SEU, congelado — é o que permite abrir um cálculo salvo com os campos que ele tinha.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/feriados.ts',
    motivo:
      'Lista de feriados do motor antigo. Hoje ela é DADO de cada versão (`versoes/rn-X-Y/dados/feriados.json` + transcrição).',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/peticao.ts',
    motivo: 'Texto de petição do motor antigo. O vivo é de cada versão.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/comparar.ts',
    motivo: 'Comparação de resultados do motor antigo. A viva é de cada versão.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/intervalos.ts',
    motivo:
      'Funções de faixa de tempo — removidas junto com as faixas. O cálculo hoje é contagem de dias.',
  },
  {
    caminho: 'src/lib/detracao/recolhimento-noturno/resumo.ts',
    motivo: 'Resumo recalculado na tela — removido. O motor já entrega a composição pronta.',
  },
  {
    caminho: 'src/app/(app)/ferramentas/indulto-comutacao',
    motivo:
      'Tela antiga e paralela do CIC, sem rota que a sirva. A viva é `ferramentas/[calculadora]/`, que atende os três produtos.',
  },
]

const raiz = resolve(process.cwd())
const encontrados = APOSENTADOS.filter(({ caminho }) => existsSync(resolve(raiz, caminho)))

if (encontrados.length > 0) {
  console.error('\n[caminhos-aposentados] 🔴 Caminho aposentado ressuscitou:\n')
  for (const { caminho, motivo } of encontrados) {
    console.error(`  • ${caminho}`)
    console.error(`    ${motivo}\n`)
  }
  console.error(
    'Estes arquivos não pertencem mais à árvore. Apague-os (o `git add -A` os arrasta para o commit\n' +
      'sem avisar) e, se algum deles tiver conteúdo que ainda importa, ele está no histórico:\n' +
      '`git log --all --diff-filter=D -- <caminho>`.\n',
  )
  process.exit(1)
}

console.log(`[caminhos-aposentados] ok — ${APOSENTADOS.length} caminhos verificados, nenhum presente.`)
