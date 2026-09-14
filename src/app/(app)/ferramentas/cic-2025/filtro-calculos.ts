import type { CalculoResumo } from './calculos'

function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filtra os cálculos pelo termo digitado, comparando com o título do cálculo, o nome do
 * sentenciado e o número de execução — os três atributos que já chegam prontos no resumo da
 * listagem (ver `calculos.ts`). Sem acento e sem caixa: comparação "contém", não igualdade. Roda
 * inteiro no navegador — não há busca no servidor.
 */
export function filtrarCalculos(calculos: CalculoResumo[], termo: string): CalculoResumo[] {
  const alvo = normalizar(termo)
  if (alvo === '') return calculos
  return calculos.filter((c) => {
    const campos = [c.titulo, c.sentenciado ?? '', c.execucao ?? '']
    return campos.some((campo) => normalizar(campo).includes(alvo))
  })
}
