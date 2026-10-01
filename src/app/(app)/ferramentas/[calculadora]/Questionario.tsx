'use client'

// Renderiza as seções do questionário de um motor — QUALQUER motor. Nada do
// Decreto 12.970/2025 pode estar escrito aqui: rótulo, ajuda e opções vêm do
// `campo` de cada decreto (ver a mesma regra no topo de Resultado.tsx).
//
// 🔴 As opções de `selecao` são renderizadas exatamente como vieram de
// `campo.opcoes` — sem trim, sem troca de caixa. O motor compara essas strings
// por igualdade; uma opção reescrita aqui cai na faixa errada sem erro nenhum.
//
// Reaproveita o vocabulário de formulário do produto (`@/components/ui/Campo`)
// em vez de reinventar `.input`/`.select`/`.rotulo` — é o mesmo `Entrada`/
// `Selecao` que o resto do CRM usa, com o mesmo anel de foco e o mesmo token
// de borda. Os nomes colidem com os tipos do domínio (`Campo`, `Entrada`), daí
// os apelidos abaixo.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Campo as CampoUI, Entrada as EntradaControle, Selecao as SelecaoControle } from '@/components/ui/Campo'
import type { Campo as CampoDado, Entrada as EntradaDados, Secao, Tempo } from '@/lib/indulto-comutacao/tipos'
import estilos from './calculadora.module.css'

function ehTempo(v: unknown): v is Tempo {
  return typeof v === 'object' && v !== null && 'anos' in v
}

/**
 * Quais seções nascem abertas: só a PRIMEIRA.
 *
 * Exportada para ser testada sem renderizar — ela é a regra inteira, e uma regra que só
 * existe dentro do corpo de um componente só se testa por meio do React, o que amarra o
 * teste ao framework. Aqui ela é uma função pura sobre a lista de seções.
 */
export function secoesIniciaisAbertas(secoes: Secao[]): Set<string> {
  return new Set(secoes[0] ? [secoes[0].id] : [])
}

/**
 * O que acontece ao clicar no cabeçalho de `id`: se está aberta, FECHA; se está fechada,
 * ABRE — e, 🔴 em nenhum dos dois casos, mexe em qualquer outra seção.
 *
 * É esta função que torna o questionário "não um acordeão". A regra antiga devolvia
 * `new Set([id])` ao abrir, o que fechava todas as outras; trocá-la por um `add` sobre uma
 * cópia do conjunto é o que permite duas seções abertas ao mesmo tempo.
 *
 * Pura e exportada pelo mesmo motivo de `secoesIniciaisAbertas`: o teste chama ESTA função,
 * a mesma que o componente usa, em vez de reescrever a regra numa cópia paralela que poderia
 * passar mesmo com o defeito de volta no componente.
 */
export function alternarSecao(abertas: ReadonlySet<string>, id: string): Set<string> {
  const proximo = new Set(abertas)
  if (proximo.has(id)) proximo.delete(id)
  else proximo.add(id)
  return proximo
}

export default function Questionario({
  secoes,
  entrada,
  aoMudar,
  desabilitado = false,
}: {
  secoes: Secao[]
  entrada: EntradaDados
  aoMudar: (chave: string, valor: EntradaDados[string]) => void
  /** Acesso encerrado: o `disabled` do fieldset desliga todos os controles de dentro. */
  desabilitado?: boolean
}) {
  // 🔴 NÃO é mais acordeão. Cada seção abre e fecha por conta própria, e abrir uma não fecha as
  // outras: quem preenche o formulário costuma voltar a uma seção de cima para conferir um valor
  // sem perder a de baixo, e o fechamento automático obrigava a reencontrá-la e reabri-la toda vez.
  //
  // O que a regra antiga (uma só aberta) existia para garantir continua garantido: as seções
  // nascem FECHADAS, menos a primeira. Com 12 seções abertas de saída, o questionário empurrava o
  // `Resultado` para fora da tela, e o advogado não via o veredito mudar enquanto respondia — que
  // é a única razão de a calculadora calcular ao vivo. A diferença é que agora é a pessoa que
  // decide o que fica aberto, em vez de o formulário fechar o que ela abriu.
  //
  // `Set` e não `string[]`: `has` na renderização de cada seção é consulta, não varredura, e um
  // `array.includes` aqui percorreria a lista uma vez por seção a cada tecla (a tela recalcula a
  // cada resposta) — mesmo custo pequeno, mas é o tipo errado para "pertence a".
  const [abertas, setAbertas] = useState<Set<string>>(() => secoesIniciaisAbertas(secoes))

  function alternar(id: string) {
    setAbertas((atual) => alternarSecao(atual, id))
  }

  return (
    <div className={estilos.questionario}>
      {secoes.map((secao) => {
        const expandida = abertas.has(secao.id)
        const idConteudo = `secao-${secao.id}-conteudo`
        const idTitulo = `secao-${secao.id}-titulo`

        return (
          <section
            key={secao.id}
            className={`${estilos.secao} ${expandida ? estilos.secaoAberta : ''}`}
          >
            {/* O título é um `button`, e não um `div` com onClick: só assim ele recebe
                foco por teclado e é anunciado como controle expansível. `aria-expanded`
                é o que diz a um leitor de tela se o painel está aberto. */}
            <h2 className={estilos.cabecalhoSecao}>
              <button
                type="button"
                id={idTitulo}
                className={estilos.botaoSecao}
                aria-expanded={expandida}
                aria-controls={idConteudo}
                onClick={() => alternar(secao.id)}
              >
                <span className={estilos.tituloSecao}>{secao.titulo}</span>
                <ChevronDown
                  className={`${estilos.chevron} ${expandida ? estilos.chevronAberto : ''}`}
                  aria-hidden="true"
                />
              </button>
            </h2>

            {/* 🔴 Só o painel ABERTO é montado. Manter os fechados no DOM com
                `display: none` manteria 60+ controles vivos e a matriz de tabulação
                cheia de paradas invisíveis; `hidden` no atributo resolve o foco, mas
                ainda paga o custo de montar tudo a cada tecla que recalcula a tela. */}
            {expandida && (
              <div
                id={idConteudo}
                role="region"
                aria-labelledby={idTitulo}
                className={estilos.corpoSecao}
              >
                {secao.aviso && <p className={estilos.aviso}>{secao.aviso}</p>}
                {secao.descricao && <p className={estilos.descricao}>{secao.descricao}</p>}
                <fieldset className={estilos.campos} disabled={desabilitado}>
                  {secao.campos.map((campo) => (
                    <CampoUnico
                      key={campo.chave}
                      campo={campo}
                      valor={entrada[campo.chave]}
                      aoMudar={aoMudar}
                    />
                  ))}
                </fieldset>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CampoUnico({
  campo,
  valor,
  aoMudar,
}: {
  campo: CampoDado
  valor: EntradaDados[string]
  aoMudar: (chave: string, valor: EntradaDados[string]) => void
}) {
  const id = `campo-${campo.chave}`

  if (campo.tipo === 'tempo') {
    const t = ehTempo(valor) ? valor : { anos: 0, meses: 0, dias: 0 }
    const idRotulo = `${id}-rotulo`
    const mudarParte = (parte: keyof Tempo, bruto: string) =>
      aoMudar(campo.chave, { ...t, [parte]: Number(bruto) || 0 })

    return (
      <div className={estilos.campoTempo}>
        <span className={estilos.rotuloGrupo} id={idRotulo}>
          {campo.rotulo}
        </span>
        {campo.ajuda && <span className={estilos.ajudaGrupo}>{campo.ajuda}</span>}
        <div className={estilos.tempo} role="group" aria-labelledby={idRotulo}>
          <CampoUI id={`${id}-anos`} rotulo="anos">
            <EntradaControle
              type="number"
              min={0}
              value={t.anos ?? 0}
              onChange={(e) => mudarParte('anos', e.target.value)}
            />
          </CampoUI>
          <CampoUI id={`${id}-meses`} rotulo="meses">
            <EntradaControle
              type="number"
              min={0}
              value={t.meses ?? 0}
              onChange={(e) => mudarParte('meses', e.target.value)}
            />
          </CampoUI>
          <CampoUI id={`${id}-dias`} rotulo="dias">
            <EntradaControle
              type="number"
              min={0}
              value={t.dias ?? 0}
              onChange={(e) => mudarParte('dias', e.target.value)}
            />
          </CampoUI>
        </div>
      </div>
    )
  }

  if (campo.tipo === 'selecao') {
    return (
      <CampoUI id={id} rotulo={campo.rotulo} ajuda={campo.ajuda}>
        <SelecaoControle value={typeof valor === 'string' ? valor : ''} onChange={(e) => aoMudar(campo.chave, e.target.value)}>
          {campo.opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SelecaoControle>
      </CampoUI>
    )
  }

  const tipoHtml = campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'
  return (
    <CampoUI id={id} rotulo={campo.rotulo} ajuda={campo.ajuda}>
      <EntradaControle
        type={tipoHtml}
        value={typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''}
        onChange={(e) => aoMudar(campo.chave, campo.tipo === 'numero' ? Number(e.target.value) || 0 : e.target.value)}
      />
    </CampoUI>
  )
}
