import { describe, it, expect } from 'vitest'
import { extensaoDe, caminhoDoObjeto, TIPOS_ACEITOS, BUCKET_ARQUIVOS } from '@/lib/base-documentos/tipos'

describe('tipos de arquivo da base', () => {
  it('extensaoDe reconhece a extensão sem diferenciar maiúscula', () => {
    expect(extensaoDe('Almanaque.MD')).toBe('md')
  })
  it('extensaoDe recusa extensão fora da lista', () => {
    expect(extensaoDe('a.markdown')).toBeNull()
  })
  it('extensaoDe recusa nome sem ponto', () => {
    expect(extensaoDe('semponto')).toBeNull()
  })
  it('extensaoDe usa só a última extensão', () => {
    expect(extensaoDe('x.tar.csv')).toBe('csv')
  })
  it('caminhoDoObjeto monta ws/documento/versao.ext', () => {
    expect(caminhoDoObjeto('w', 'd', 'v', 'pdf')).toBe('w/d/v.pdf')
  })
  it('aceita exatamente os seis tipos', () => {
    expect(Object.keys(TIPOS_ACEITOS).sort()).toEqual(['csv', 'docx', 'json', 'md', 'pdf', 'txt'])
    expect(BUCKET_ARQUIVOS).toBe('base-arquivos')
  })
})
