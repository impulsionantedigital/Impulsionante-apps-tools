export function reordenarLista<T>(itens: readonly T[], deIndice: number, paraIndice: number): T[] {
  if (deIndice < 0 || deIndice >= itens.length || paraIndice < 0 || paraIndice >= itens.length) {
    return [...itens]
  }
  const copia = [...itens]
  const [movido] = copia.splice(deIndice, 1)
  copia.splice(paraIndice, 0, movido)
  return copia
}
