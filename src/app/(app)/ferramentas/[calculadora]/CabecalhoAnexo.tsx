'use client'

import { useEffect, useState } from 'react'
import { todasAsRespostas } from '@/lib/indulto-comutacao/respostas-anexo'
import { formatarDataHora } from '@/lib/data-hora'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import estilos from './resultado.module.css'

/**
 * O que só existe no PAPEL: identifica o caso e mostra as premissas do cálculo.
 *
 * 🔴 Não aparece na tela (`display: none` fora de `@media print`). Na tela o advogado tem o
 * questionário ao lado, preenchido por ele; repetir tudo ali seria ruído. No papel o
 * questionário não vai — e sem isto o anexo chegava ao juiz sem número de execução, sem data e
 * sem dizer de onde saíram os números.
 *
 * 🔴 A data é fixada num efeito, não no corpo do componente. `new Date()` durante a renderização
 * daria um valor no servidor e outro no navegador, e o React acusaria divergência de hidratação.
 */
export default function CabecalhoAnexo({
  motor,
  entrada,
  titulo,
}: {
  motor: MotorDecreto
  entrada: Entrada
  titulo: string
}) {
  const [impressoEm, setImpressoEm] = useState<string | null>(null)
  useEffect(() => setImpressoEm(formatarDataHora(new Date())), [])

  const respostas = todasAsRespostas(motor, entrada)

  return (
    <section className={estilos.anexo} aria-hidden="true">
      <h1 className={estilos.anexoTitulo}>Cálculo de indulto e comutação</h1>
      {/* 🔴 O TÍTULO do cálculo salvo NÃO vai para o papel, a pedido do dono do produto —
         era o nome que o membro dá ao registro, e não tem valor para o juiz. Fica a data de
         impressão, que situa o anexo.

         A prop `titulo` continua sendo recebida e usada: quem manda no que sai é o CSS
         (`.soNaTela`), não um `if` no JSX — a `Calculadora` também depende dela para a
         `BarraSalvar`, e tirar a prop daqui quebraria a assinatura sem necessidade. */}
      <p className={estilos.anexoMeta}>
        <span className={estilos.soNaTela}>{titulo.trim() || 'Cálculo sem identificação'}</span>
        {impressoEm ? `impresso em ${impressoEm}` : ''}
      </p>

      <h2 className={estilos.anexoSecao}>Respostas informadas</h2>
      <dl className={estilos.anexoLista}>
        {respostas.map((r) => (
          <div key={`${r.secao}-${r.rotulo}`} className={estilos.anexoLinha}>
            <dt className={estilos.anexoRotulo}>{r.rotulo}</dt>
            <dd className={estilos.anexoValor}>{r.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
