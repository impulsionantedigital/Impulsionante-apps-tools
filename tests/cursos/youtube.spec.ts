import { describe, it, expect } from 'vitest'
import { extrairIdYoutube } from '@/lib/cursos/youtube'

describe('extrairIdYoutube', () => {
  it('aceita o id puro', () => {
    expect(extrairIdYoutube('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de watch?v=, com ou sem parâmetros extra', () => {
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de youtu.be', () => {
    expect(extrairIdYoutube('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extrai de /embed/', () => {
    expect(extrairIdYoutube('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('ignora espaço em volta', () => {
    expect(extrairIdYoutube('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  it('rejeita entrada vazia, texto solto e outros domínios', () => {
    expect(extrairIdYoutube('')).toBeNull()
    expect(extrairIdYoutube('   ')).toBeNull()
    expect(extrairIdYoutube('não é url')).toBeNull()
    expect(extrairIdYoutube('https://vimeo.com/12345')).toBeNull()
    expect(extrairIdYoutube('https://www.youtube.com/watch?v=curto')).toBeNull()
  })
})
