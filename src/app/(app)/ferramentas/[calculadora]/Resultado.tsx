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
import { enquadramentosDe } from '@/lib/indulto-comutacao/enquadramentos'
import type { EnquadramentoResolvido } from '@/lib/indulto-comutacao/enquadramentos'
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

/**
 * "Aplicável" = o sentenciado preenche a REGRA GERAL do dispositivo (`geral === 'preenche'`).
 *
 * É o mesmo critério de `temAplicavel`/`primeiroAplicavel` (`enquadramentos.ts`), que são
 * quem decide o que vai para a petição — usar outro aqui faria a tela separar diferente do
 * que o botão "Petição" entrega. Os demais vereditos (`nao_preenche`, `a_analisar`,
 * `sem_previsao`) caem em "não aplicáveis": a lista de cima é a que o advogado assina.
 */
const ehAplicavel = (e: EnquadramentoResolvido) => e.geral === 'preenche'

/**
 * O corpo dos cartões de um grupo, já dividido em aplicáveis e não aplicáveis.
 *
 * Nas DUAS listas a ordem é a do decreto (`enquadramentosDe` já a preserva) — o que muda
 * entre elas é só o veredito. Reordenar por veredito dentro do grupo faria o advogado
 * procurar o Art. 9º, IV fora do lugar; o número do artigo é a chave de leitura dele.
 */
function Cartoes({
  enquadramentos,
  tipo,
}: {
  enquadramentos: EnquadramentoResolvido[]
  tipo: 'indulto' | 'comutacao'
}) {
  return (
    <div className={estilos.cartoes}>
      {enquadramentos.map((e) => (
        <article key={e.id} className={estilos.cartao}>
          <h4>{e.rotulo}</h4>
          <p>{e.descricao}</p>
          {tipo === 'indulto' ? (
            <>
              <Selo rotulo="Regra geral" veredito={e.geral} />
              <Selo rotulo="Regra especial" veredito={e.especial} />
            </>
          ) : (
            /* Comutação não tem regra especial: o motor devolve `especial:
               'sem_previsao'` nos 5 dispositivos, mas nunca houve selo pra ela
               na POC. Só "Situação" (= `e.geral`). */
            <Selo rotulo="Situação" veredito={e.geral} />
          )}
          {tipo === 'comutacao' && e.geral === 'preenche' && (
            <dl className={estilos.quantum}>
              <dt>Quantum da comutação</dt>
              <dd>{fmtDias(e.quantum ?? null)}</dd>
              <dt>Pena total após a comutação</dt>
              <dd>{fmtDias(e.penaApos ?? null)}</dd>
            </dl>
          )}
        </article>
      ))}
    </div>
  )
}

/**
 * Um grupo do decreto (Indulto ou Comutação) em duas seções: o que se aplica ao caso
 * primeiro, o que não se aplica depois.
 *
 * 🔴 A seção de baixo fica SEMPRE visível, mesmo vazia ou com todos os dispositivos dentro.
 * Esconder a lista de não aplicáveis quando ela está cheia faria o advogado perder de vista,
 * no meio do preenchimento, justamente os dispositivos que ele ainda pode destravar — que é
 * o motivo de ele preencher o questionário. Já a de cima SOME quando não há nada aplicável:
 * uma caixa "Aplicáveis" vazia só ocuparia a tela sem dizer nada.
 */
function Grupo({
  motor,
  resultado,
  grupo,
  titulo,
}: {
  motor: MotorDecreto
  resultado: ResultadoCalculo
  grupo: 'indulto' | 'comutacao'
  titulo: string
}) {
  const enquadramentos = enquadramentosDe(motor, resultado, grupo)
  const aplicaveis = enquadramentos.filter(ehAplicavel)
  const naoAplicaveis = enquadramentos.filter((e) => !ehAplicavel(e))
  const elemento = grupo === 'indulto' ? 'Indulto' : 'Comutação'

  return (
    <section className={estilos.grupo} aria-label={titulo}>
      <h2 className={estilos.titulo}>{titulo}</h2>

      {aplicaveis.length > 0 && (
        <>
          <h3 className={estilos.subtitulo}>
            {elemento} aplicável{aplicaveis.length > 1 ? 's' : ''} ({aplicaveis.length})
          </h3>
          <Cartoes enquadramentos={aplicaveis} tipo={grupo} />
        </>
      )}

      {/* 🔴 O bloco dos não aplicáveis é `soNaTela`: some na IMPRESSÃO, a pedido do dono do
         produto — o anexo de petição leva só o que se aplica ao caso, e uma lista de
         dispositivos que NÃO se aplicam só daria ao juiz o que contestar sem motivo.

         Na tela ele fica: é de onde os cartões saem conforme o questionário é preenchido.
         Esconder só no CSS (e não com um `if` que dependa de mídia) mantém o React sem
         saber se está imprimindo — não há estado de impressão para dessincronizar. */}
      <div className={estilos.soNaTela}>
        <h3 className={estilos.subtitulo}>
          {elemento} não aplicáve{naoAplicaveis.length === 1 ? 'l' : 'is'} ({naoAplicaveis.length})
        </h3>
        <Cartoes enquadramentos={naoAplicaveis} tipo={grupo} />
      </div>
    </section>
  )
}

export default function Resultado({
  motor,
  resultado,
}: {
  motor: MotorDecreto
  resultado: ResultadoCalculo
}) {
  return (
    <div className={estilos.resultado}>
      {/* 🔴 O resumo mostra os QUATRO totais do caso, e não mais as cinco frações de
         referência (2/3 dos impeditivos, 1/5, 1/4, 1/3 e 1/2 da pena não impeditiva) —
         pedido do dono do produto.

         As frações continuam sendo CALCULADAS pelo motor (`resultado.resumo.fracoes`) e
         continuam nos testes; o que mudou foi só quem as exibe. Não "limpe" o motor
         removendo-as: a régua de 1/5 é a que o Art. 13 exige, e o 2/3 dos impeditivos é
         requisito de outros dispositivos. Apagá-las do motor quebraria teste e a petição,
         sem mudar nada na tela. Para voltar a exibi-las, basta devolver as cinco linhas. */}
      <section className={estilos.resumo} aria-label="Resumo de tempos">
        <div><span>Total de penas impostas</span><b>{fmtDias(resultado.resumo.totalImposto)}</b></div>
        <div><span>Total de pena cumprida</span><b>{fmtDias(resultado.resumo.totalCumprido)}</b></div>
        <div><span>Cumprido computável nos impeditivos</span><b>{fmtDias(resultado.resumo.penaCumpridaImpeditivos)}</b></div>
        <div><span>Pena remanescente</span><b>{fmtDias(resultado.resumo.remanescente)}</b></div>
      </section>

      {/* Só "Indulto" e "Comutação": são os dois grupos do CONTRATO
         (`motor.incisos.indulto`/`.comutacao`), não um artigo do decreto de 2025.
         Em que artigo cada dispositivo vive é o que `meta.rotulo` e
         `meta.descricao` já dizem, por decreto. Cada grupo se desenha em duas
         listas — aplicáveis e não aplicáveis —, e qual é qual o `Grupo` decide. */}
      <Grupo motor={motor} resultado={resultado} grupo="indulto" titulo="Indulto" />
      <Grupo motor={motor} resultado={resultado} grupo="comutacao" titulo="Comutação" />

      {/* 🔴 O bloco "Pontos a validar juridicamente" NÃO é renderizado a pedido do
         dono do produto (o card com as cinco interpretações da planilha saiu da
         tela). O conteúdo continua no motor (`motor.avisos.validarJuridicamente`),
         íntegro e testado — a petição e a auditoria ainda o leem; só a tela não o
         exibe. Para voltar atrás, basta reativar este bloco:

         <section className={estilos.validar} aria-label="Pontos a validar juridicamente">
           <h2>Pontos a validar juridicamente</h2>
           <ul>
             {motor.avisos.validarJuridicamente.map((a) => <li key={a}>{a}</li>)}
           </ul>
         </section> */}

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
