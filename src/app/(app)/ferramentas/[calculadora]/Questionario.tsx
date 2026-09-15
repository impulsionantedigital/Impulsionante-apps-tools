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
import { Campo as CampoUI, Entrada as EntradaControle, Selecao as SelecaoControle } from '@/components/ui/Campo'
import type { Campo as CampoDado, Entrada as EntradaDados, Secao, Tempo } from '@/lib/indulto-comutacao/tipos'
import estilos from './calculadora.module.css'

function ehTempo(v: unknown): v is Tempo {
  return typeof v === 'object' && v !== null && 'anos' in v
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
  return (
    <div className={estilos.questionario}>
      {secoes.map((secao) => (
        <fieldset key={secao.id} className={estilos.secao} disabled={desabilitado}>
          <legend className={estilos.tituloSecao}>{secao.titulo}</legend>
          {secao.aviso && <p className={estilos.aviso}>{secao.aviso}</p>}
          {secao.descricao && <p className={estilos.descricao}>{secao.descricao}</p>}
          <div className={estilos.campos}>
            {secao.campos.map((campo) => (
              <CampoUnico key={campo.chave} campo={campo} valor={entrada[campo.chave]} aoMudar={aoMudar} />
            ))}
          </div>
        </fieldset>
      ))}
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
