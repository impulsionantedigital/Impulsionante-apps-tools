'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import estilos from './Rail.module.css'


export default function ItemNav({ href, rotulo, descricao, children, aviso, indentado }: {
  href: string
  rotulo: string
  // Segunda linha, menor e apagada — o item vira um cartão de duas linhas (título + descrição)
  // em vez do rótulo único de sempre. Usado pelas ferramentas individuais em Rail.tsx.
  descricao?: string
  children?: React.ReactNode
  aviso?: boolean
  // Recua o item sem ícone sob o rótulo de um grupo estático acima dele (ver `.navGrupo` em
  // Rail.tsx) — a indentação é o que diz "isto pertence ao grupo de cima".
  indentado?: boolean
}) {
  const pathname = usePathname()
  const exato = pathname === href
  const ativo = exato || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      className={`${estilos.nav} ${indentado ? estilos.navIndentado : ''} ${ativo ? estilos.ativo : ''}`}
      aria-current={exato ? 'page' : ativo ? 'true' : undefined}
    >
      {children}
      {descricao ? (
        <span className={estilos.navTextos}>
          <span>{rotulo}</span>
          <span className={estilos.navDescricao}>{descricao}</span>
        </span>
      ) : (
        <span>{rotulo}</span>
      )}
      {aviso ? (
        <span className={estilos.aviso} role="status" aria-label="Atualização disponível" title="Atualização disponível" />
      ) : null}
    </Link>
  )
}
