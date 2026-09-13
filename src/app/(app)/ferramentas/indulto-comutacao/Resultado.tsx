// Componente puro: recebe o motor de um decreto e o resultado do cálculo dele e
// desenha, dispositivo por dispositivo, se o sentenciado preenche os requisitos.
// Sem estado e sem acesso a dados — a tela de cálculo novo e a de cálculo salvo o
// reaproveitam do mesmo jeito.
//
// 🔴 Serve a TODOS os decretos. Nada do Decreto 12.970/2025 pode estar escrito
// aqui: data-base, número de artigo ou parágrafo de regra especial são decisão
// de CADA decreto, e chegam pelo `motor` (rótulo, descrição do inciso, avisos)
// ou pelo `resultado`. Com o motor de 2026 no registro, uma data ou um "Art. 9º"
// fixos aqui fariam a tela mentir sobre o decreto errado.
import type { MotorDecreto, Resultado as ResultadoCalculo, Veredito } from '@/lib/indulto-comutacao/tipos'
import { VEREDITOS } from '@/lib/indulto-comutacao/tipos'
import { fmtDias } from '@/lib/indulto-comutacao/tempo'
import estilos from './resultado.module.css'

const TOM: Record<Veredito, string> = {
  preenche: estilos.preenche,
  nao_preenche: estilos.naoPreenche,
  a_analisar: estilos.aAnalisar,
  sem_previsao: estilos.semPrevisao,
}

/**
 * Rótulo + veredito.
 *
 * "Sem previsão no Decreto" usa o tom NEUTRO (`semPrevisao`), nunca o vermelho de
 * "não preenche": são informações jurídicas diferentes — a primeira diz que o
 * decreto não previu regra especial para aquele dispositivo, a segunda que o
 * sentenciado não atende à regra que existe. Confundir as duas na cor apagaria a
 * distinção que o motor foi desenhado para preservar.
 */
function Selo({ rotulo, veredito }: { rotulo: string; veredito: Veredito }) {
  return (
    <span className={`${estilos.selo} ${TOM[veredito]}`}>
      <b>{rotulo}</b> {VEREDITOS[veredito]}
    </span>
  )
}

export default function Resultado({
  motor,
  resultado,
}: {
  motor: MotorDecreto
  resultado: ResultadoCalculo
}) {
  const porId = new Map(resultado.incisos.map((i) => [i.id, i]))

  return (
    <div className={estilos.resultado}>
      <section className={estilos.resumo} aria-label="Resumo de tempos">
        <div><span>Total de penas impostas</span><b>{fmtDias(resultado.resumo.totalImposto)}</b></div>
        <div><span>Total de pena cumprida</span><b>{fmtDias(resultado.resumo.totalCumprido)}</b></div>
        <div><span>Cumprido computável nos impeditivos</span><b>{fmtDias(resultado.resumo.penaCumpridaImpeditivos)}</b></div>
        <div><span>Pena remanescente</span><b>{fmtDias(resultado.resumo.remanescente)}</b></div>
        <div><span>2/3 dos impeditivos</span><b>{fmtDias(resultado.resumo.fracoes.doisTercosImpeditivos)}</b></div>
        <div><span>1/5 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umQuinto)}</b></div>
        <div><span>1/4 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umQuarto)}</b></div>
        <div><span>1/3 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.umTerco)}</b></div>
        <div><span>1/2 da pena não impeditiva</span><b>{fmtDias(resultado.resumo.fracoes.metade)}</b></div>
      </section>

      {/* Só "Indulto" e "Comutação": são os dois grupos do CONTRATO
         (`motor.incisos.indulto`/`.comutacao`), não um artigo do decreto de 2025.
         Em que artigo cada dispositivo vive é o que `meta.rotulo` e
         `meta.descricao` já dizem, por decreto. */}
      <h2 className={estilos.titulo}>Indulto</h2>
      <div className={estilos.cartoes}>
        {motor.incisos.indulto.map((meta) => {
          const r = porId.get(meta.id)
          if (!r) return null
          return (
            <article key={meta.id} className={estilos.cartao}>
              <h3>{meta.rotulo}</h3>
              <p>{meta.descricao}</p>
              <Selo rotulo="Regra geral" veredito={r.geral} />
              <Selo rotulo="Regra especial" veredito={r.especial} />
            </article>
          )
        })}
      </div>

      <h2 className={estilos.titulo}>Comutação</h2>
      <div className={estilos.cartoes}>
        {motor.incisos.comutacao.map((meta) => {
          const r = porId.get(meta.id)
          if (!r) return null
          return (
            <article key={meta.id} className={estilos.cartao}>
              <h3>{meta.rotulo}</h3>
              <p>{meta.descricao}</p>
              {/* Comutação não tem regra especial: o motor devolve `especial:
                 'sem_previsao'` nos 5 dispositivos, mas nunca houve selo pra ela
                 na POC. Só "Situação" (= `r.geral`). */}
              <Selo rotulo="Situação" veredito={r.geral} />
              {r.geral === 'preenche' && (
                <dl className={estilos.quantum}>
                  <dt>Quantum da comutação</dt>
                  <dd>{fmtDias(r.quantum ?? null)}</dd>
                  <dt>Pena total após a comutação</dt>
                  <dd>{fmtDias(r.penaApos ?? null)}</dd>
                </dl>
              )}
            </article>
          )
        })}
      </div>

      {/* Sempre visível, com TODAS as entradas — são interpretações da planilha
         que o advogado precisa conhecer antes de assinar a petição. Nada de
         esconder, resumir ou truncar. */}
      <section className={estilos.validar} aria-label="Pontos a validar juridicamente">
        <h2>Pontos a validar juridicamente</h2>
        <ul>
          {motor.avisos.validarJuridicamente.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      <section className={estilos.notas} aria-label="Notas">
        {/* Só `avisos.fixos` aqui. `resultado.avisos` (as duas ambiguidades
           literais do engine.js original) NÃO entra: seu conteúdo já está, em
           versão revisada, dentro de `validarJuridicamente` — as duas primeiras
           entradas são idênticas caractere por caractere às de `resultado.avisos`.
           Somar as duas listas duplicaria as mesmas frases na tela. Isto é
           deliberado — não "conserte" a omissão. */}
        <ul>
          {motor.avisos.fixos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      <p className={estilos.proveniencia}>
        Calculado com {motor.rotulo} — motor versão {motor.versao}. Data-base:{' '}
        {motor.dataBase.split('-').reverse().join('/')}.
      </p>
    </div>
  )
}
