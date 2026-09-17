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
  // 🔴 «Indultos aplicáveis», no PLURAL, e não «Indulto aplicáveis». O rótulo conta
  // DISPOSITIVOS (o Art. 9º, I; o Art. 9º, II…), não o grupo — e a concordância com a
  // contagem fica certa nos dois sentidos: «Indultos aplicáveis (2)» e
  // «Indultos não aplicáveis (16)». «Indulto aplicáveis» misturava número (singular) com
  // pessoa (plural) na mesma frase.
  //
  // Já «Comutação» é nome de processo, e é SINGULAR — «Comutação aplicável» e «Comutação não
  // aplicável», no singular nos dois. O «s» que aqui faltava estava colado no adjetivo e não
  // no sujeito: «Comutação não aplicáveis (4)» concordava o adjetivo com a CONTAGEM em vez de
  // com o nome.
  //
  // 🔴 SEMPRE NO PLURAL, independentemente da contagem — decidido pelo dono do produto, que
  // já pediu isso para as duas listas.
  //
  // O caminho até aqui está registrado porque cada passo foi um erro meu, na tentativa de
  // "acertar a concordância" que ninguém tinha pedido:
  //   1. «Indulto aplicáveis (2)»   — substantivo singular, adjetivo plural;
  //   2. «Indultos aplicável (1)»   — passei a flexionar pela contagem, e o adjetivo caiu no
  //      singular enquanto o substantivo ficava no plural;
  //   3. «Indulto não aplicável (5)» na Comutação — o substantivo saiu da função errada.
  //
  // 🔴 NÃO reintroduza condicional de quantidade aqui. O rótulo NOMEIA A LISTA (o conjunto
  // «Indultos aplicáveis», «Comutações não aplicáveis»), não conta itens — o número entre
  // parênteses é quem informa a contagem, e ele fica no fim. Flexionar o nome pela contagem
  // foi uma regra que eu inventei e que o usuário não pediu.
  const substantivo = grupo === 'indulto' ? 'Indultos' : 'Comutações'

  return (
    <section className={estilos.grupo} aria-label={titulo}>
      <h2 className={estilos.titulo}>{titulo}</h2>

      {aplicaveis.length > 0 && (
        <>
          {/* Rótulo do CONJUNTO, sempre no plural: «Indultos aplicáveis (2)»,
             «Comutações aplicáveis (1)». A contagem vai entre parênteses e não flexiona o
             nome — ver a nota na declaração de `substantivo`. */}
          <h3 className={estilos.subtitulo}>
            {substantivo} aplicáveis ({aplicaveis.length})
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
          {substantivo} não aplicáveis ({naoAplicaveis.length})
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
        {/* O total IMPEDITIVO — a fatia do card anterior que veio de crime impeditivo.
           Fica logo abaixo dele de propósito: é a decomposição do primeiro, e separá-los
           faria o advogado procurar o que compõe o total.

           🔴 NÃO confundir com "Cumprido computável nos impeditivos" (mais abaixo): este é
           o que foi IMPOSTO pela sentença; aquele, o que já foi CUMPRIDO e conta contra
           este (e é limitado aos 2/3 do impeditivo). Com 6 anos impostos e 8 cumpridos, o
           primeiro mostra 6 e o segundo 4 — números diferentes, de grandezas diferentes. */}
        <div><span>Total de penas impeditivas</span><b>{fmtDias(resultado.resumo.totalImpeditivo)}</b></div>
        {/* A outra metade da decomposição do card 1 — a soma dos dois campos de pena NÃO
           impeditiva (com violência + sem violência). Junto com o card acima, fecha o total
           imposto: `totalImpeditivo + totalPermissivo == totalImposto`, e há teste para isso. */}
        <div><span>Total de penas permissivas</span><b>{fmtDias(resultado.resumo.totalPermissivo)}</b></div>
        <div><span>Total de pena cumprida</span><b>{fmtDias(resultado.resumo.totalCumprido)}</b></div>
        {/* 🔴 O `(2/3)` do título NÃO é enfeite: é o que explica por que este número é MENOR que
           o "Total de pena cumprida" acima. O valor é `min(cumprido, 2/3 do impeditivo)` — um
           TETO. Sem a fração no rótulo, o advogado vê 6 onde o cumprido diz 8 e conclui que a
           ferramenta errou; com ela, vê que 6 são os 2/3 de uma pena impeditiva de 9 anos. */}
        <div><span>Cumprida computável nos impeditivos (2/3)</span><b>{fmtDias(resultado.resumo.penaCumpridaImpeditivos)}</b></div>
        {/* O par do card acima: o cumprido que sobra depois de atribuir a parte dos
           impeditivos. Fica ao lado dele porque só faz sentido lido junto — e o par se
           relaciona com o "Total de pena cumprida" (acima): os dois somam o total.

           🔴 Este é o único card do painel cuja regra é uma DIFERENÇA ENTRE CARDS, e não uma
           soma de campos do formulário. Se `penaCumpridaImpeditivos` mudar de fórmula, este
           muda junto sem que ninguém o tenha tocado. */}
        <div><span>Cumprida computável nos permissivos</span><b>{fmtDias(resultado.resumo.penaCumpridaPermissivos)}</b></div>
        <div><span>Pena remanescente</span><b>{fmtDias(resultado.resumo.remanescente)}</b></div>
        {/* 🔴 POSIÇÃO A CONFIRMAR. O pedido não disse onde este card entra, e ele é IMPEDITIVO —
           lê os cards 2 e 5, que estão no alto da lista. Posto no fim porque foi pedido como
           "card 8", na sequência do 7. Se a intenção for lê-lo junto dos outros dois
           impeditivos (perto do 2), mover este bloco é o único ajuste necessário. */}
        <div><span>Remanescente dos impeditivos (2/3)</span><b>{fmtDias(resultado.resumo.remanescenteImpeditivo)}</b></div>
        {/* O par do card acima, e o último derivado do painel: o que falta da parte NÃO
           impeditiva, por diferença entre os cards 7 e 8.

           🔴 Ele pode PARECER o "Total de pena cumprida" (card 4) — no cenário do relato, 8
           nos dois. É coincidência aritmética, não identidade: com pena impeditiva pequena
           dá 7 contra 5, e sem nada cumprido dá 10 contra 0. Não troque um pelo outro. */}
        <div><span>Remanescente dos permissivos</span><b>{fmtDias(resultado.resumo.remanescentePermissivo)}</b></div>
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
