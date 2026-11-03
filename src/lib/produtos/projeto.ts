/**
 * Qual projeto ESTE deploy serve. Um código só atende GPS da Pena e Trilhas de Aruanda; cada deploy
 * declara o seu na variável `PROJETO`, e só os produtos daquele projeto existem nele (ver
 * `produtosDoProjeto` em `catalogo.ts`). Spec: 2026-09-22-repo-unico-e-filtro-por-projeto-design.md.
 *
 * 🔴 A variável identifica o PROJETO, não a marca: nome, logo e cor continuam no banco
 * (Configurações → Servidor → Marca).
 *
 * 🔴 Sem prefixo `NEXT_PUBLIC_`: seria inlinado no build da imagem, e a mesma imagem serve os dois
 * projetos. Lida no servidor, a troca no painel vale com um restart.
 */
export const PROJETOS = ['gpsdapena', 'trilhasdearuanda'] as const
export type Projeto = (typeof PROJETOS)[number]

export function ehProjeto(valor: unknown): valor is Projeto {
  return typeof valor === 'string' && (PROJETOS as readonly string[]).includes(valor)
}

/**
 * O projeto deste deploy.
 *
 * 🔴 LANÇA com a variável ausente ou fora da lista, e não existe padrão. "Mostrar tudo" vazaria o
 * produto de um projeto no outro; "mostrar nada" daria um app vazio sem explicação. O
 * `preflight.mjs` confere a mesma coisa antes do boot, então em produção isto nunca lança: o
 * container já não teria subido.
 */
export function projetoAtual(env: Record<string, string | undefined> = process.env): Projeto {
  const valor = (env.PROJETO ?? '').trim()
  if (!ehProjeto(valor)) {
    throw new Error(`PROJETO inválido ou ausente: "${valor}". Valores aceitos: ${PROJETOS.join(', ')}.`)
  }
  return valor
}
