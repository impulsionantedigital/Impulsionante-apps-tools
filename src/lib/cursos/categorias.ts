export const CATEGORIAS_CURSO = [
  { id: 'curso', rotulo: 'Curso' },
  { id: 'formacao', rotulo: 'Formação' },
] as const

export type CategoriaCurso = (typeof CATEGORIAS_CURSO)[number]['id']

export function ehCategoriaConhecida(id: unknown): id is CategoriaCurso {
  return typeof id === 'string' && CATEGORIAS_CURSO.some((c) => c.id === id)
}

export function rotuloDaCategoria(id: CategoriaCurso): string {
  return CATEGORIAS_CURSO.find((c) => c.id === id)?.rotulo ?? id
}
