'use client'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { usePathname } from 'next/navigation'
import estilos from './Rail.module.css'


export default function ItemNav({ href, rotulo, descricao, children, indentado, bloqueado }: {
  href: string
  rotulo: string
  // Segunda linha, menor e apagada — o item vira um cartão de duas linhas (título + descrição)
  // em vez do rótulo único de sempre. Usado pelas ferramentas individuais em Rail.tsx.
  descricao?: string
  children?: React.ReactNode
  // Recua o item sem ícone sob o rótulo de um grupo estático acima dele (ver `.navGrupo` em
  // Rail.tsx) — a indentação é o que diz "isto pertence ao grupo de cima".
  indentado?: boolean
  // Cadeado à direita: o membro vê a ferramenta, e a tela abre, mas em leitura. Sem botão aqui —
  // o menu é estreito, e o convite de compra mora na vitrine e na página do produto.
  bloqueado?: boolean
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
      {bloqueado ? (
        <Lock size={14} strokeWidth={2} className={estilos.navCadeado} aria-label="Sem acesso" />
      ) : null}
    </Link>
  )
}
