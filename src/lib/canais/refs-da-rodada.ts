// Referencias curtas (r1, r2, …) no lugar dos ids internos: o modelo nunca ve um uuid, e a
// mesma ref aponta para o mesmo trecho durante a rodada inteira (criada uma vez por rodada em
// `montarFerramentas`). Ref que nao saiu desta rodada → null.
export type RefsDaRodada = { ref(id: string): string; id(ref: string): string | null }

export function criarRefs(): RefsDaRodada {
  const porId = new Map<string, string>()
  const porRef = new Map<string, string>()
  return {
    ref(id: string): string {
      const existente = porId.get(id)
      if (existente) return existente
      const nova = `r${porId.size + 1}`
      porId.set(id, nova)
      porRef.set(nova, id)
      return nova
    },
    id(ref: string): string | null {
      return porRef.get(String(ref ?? '').trim().toLowerCase()) ?? null
    },
  }
}
