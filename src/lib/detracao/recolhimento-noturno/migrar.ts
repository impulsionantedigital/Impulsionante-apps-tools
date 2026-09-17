// src/lib/detracao/recolhimento-noturno/migrar.ts
//
// 🔴 Cálculos gravados ANTES da RN-2.0 têm outro formato de entrada, e o motor novo não os lê.
//
// Até a RN-1.1 o segmento guardava uma JANELA DE INSTANTES (`inicio`/`fim`, ISO com hora), com o
// fim EXCLUSIVO e esticado até o fim do turno do último dia. Da RN-2.0 em diante o segmento guarda
// um par de DATAS DE CALENDÁRIO (`dataInicio`/`dataFim`), inclusivas.
//
// Sem esta conversão, reabrir um cálculo antigo quebrava a tela com erro 500: a página do servidor
// chama `calcular(calculo.entrada)` para conferir se o número mudou, o motor lê `s.dataInicio` do
// objeto antigo, recebe `undefined`, e `validarData` lança. O membro via "This page couldn't load"
// e perdia acesso ao próprio histórico — inclusive a cálculos que podem ter virado petição.
//
// ⚠️ A conversão NÃO tenta reconstruir o que o membro digitou: `inicio`/`fim` não guardam a data
// original, só o resultado dela. O que se recupera é a data de cada PONTA da janela, que é o que o
// formato novo precisa — e é suficiente, porque as duas representam o mesmo período.

import type { EntradaCalculo, SegmentoRegra } from './tipos'

/** Um segmento no formato antigo (RN-1.1 e anteriores), como está no `jsonb` do banco. */
type SegmentoAntigo = Partial<SegmentoRegra> & {
  inicio?: string
  fim?: string
  dataInicio?: string
  dataFim?: string
  intervalosAdicionais?: unknown
  intervalosExcluidos?: unknown
}

/** `AAAA-MM-DD` de um instante ISO. Textual, sem `Date` — não há fuso para errar aqui. */
function dataDe(instanteISO: string): string {
  return instanteISO.slice(0, 10)
}

/** A data do último dia DENTRO da janela `[inicio, fim)`.
 *
 *  🔴 Não basta pegar a data de `fim`: o fim é EXCLUSIVO e, quando o último dia tem turno noturno,
 *  foi esticado até o **fim desse turno** — "até 31/12/2025" com turno 22:00→06:00 virou
 *  `2026-01-01T06:00:00`, dia 01/01 do ano seguinte. Pegar a data de `fim` literalmente acrescenta
 *  um dia que o membro nunca informou.
 *
 *  ⚠️ Recuar um segundo NÃO resolve: `2026-01-01T06:00 − 1s` ainda é 01/01, e o teste que esperava
 *  31/12 pegava justamente esse erro. O que distingue as duas situações é o HORÁRIO do fim:
 *
 *    - fim à MEIA-NOITE (`...T00:00`) → é a fronteira do dia o último dia é o ANTERIOR.
 *    - fim em horário de MADRUGADA (`...T06:00`, o turno esticado) → o dia do `fim` é o dia
 *      SEGUINTE ao último, e é ele quem precisa recuar.
 *
 *  `horaFimNoturno` é o que separa os dois casos, e vem do próprio segmento — não é um limiar
 *  arbitrário. Um turno que termina às 06:00 produz fim em `T06:00`; a janela sem turno produz
 *  `T00:00`, que é sempre MAIOR que o horário de término de qualquer turno real do dia. */
function ultimaDataDaJanela(fimISO: string, horaFimNoturno: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(fimISO)
  if (!m) return dataDe(fimISO)

  const minutosDoFim = Number(m[4]) * 60 + Number(m[5])
  const [hf, mf] = horaFimNoturno.split(':').map(Number)
  const minutosDoTurno = hf * 60 + mf
  // Fim à meia-noite (`00:00`) é a fronteira do dia — o último dia é o anterior, sempre.
  // Fim em horário dentro do turno (madrugada) é a extensão, e também recua um dia.
  if (minutosDoFim === 0 || minutosDoFim <= minutosDoTurno) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 86_400_000
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  }
  return dataDe(fimISO)
}

function migrarSegmento(s: SegmentoAntigo): SegmentoRegra {
  // Já está no formato novo: nada a fazer. (Cálculos gravados depois da RN-2.0 caem aqui.)
  const dataInicio = s.dataInicio ?? (s.inicio ? dataDe(s.inicio) : '')
  const horaFimNoturno = s.horaFimNoturno ?? '06:00'
  const dataFim = s.dataFim ?? (s.fim ? ultimaDataDaJanela(s.fim, horaFimNoturno) : '')

  return {
    dataInicio,
    dataFim,
    horaInicioNoturno: s.horaInicioNoturno ?? '22:00',
    horaFimNoturno,
    diasSemanaNoturno: s.diasSemanaNoturno ?? [],
    diasFolgaIntegral: s.diasFolgaIntegral ?? [],
    feriadosIntegral: s.feriadosIntegral ?? [],
    // Campo que só existe a partir da RN-2.0: cálculo antigo não o tem, e o padrão é desmarcado.
    incluirFeriadosUteis: s.incluirFeriadosUteis ?? false,
    // `intervalosAdicionais`/`intervalosExcluidos` são DESCARTADOS em silêncio, e é o correto: a
    // funcionalidade foi removida, e eles não teriam onde entrar na conta por dia. O `resultado`
    // gravado continua no banco — é ele que o aviso de divergência compara.
  }
}

/** Traz uma entrada antiga para o formato atual. Idempotente: o que já está no formato novo passa
 *  intacto, então pode rodar em toda leitura sem separar "antigo" de "novo". */
export function migrarEntrada(bruta: unknown): EntradaCalculo {
  const e = (bruta ?? {}) as Partial<EntradaCalculo> & { segmentos?: SegmentoAntigo[] }
  return {
    timezone: e.timezone ?? 'America/Sao_Paulo',
    observacoes: e.observacoes,
    monitoramentoEletronico: e.monitoramentoEletronico,
    segmentos: (e.segmentos ?? []).map(migrarSegmento),
  }
}
