// src/lib/detracao/recolhimento-noturno/intervalos.ts
//
// Funções puras sobre o eixo do tempo. Nada aqui sabe o que é "noite" ou "folga integral" — isso
// é do `motor.ts`. `Faixa` trabalha em milissegundos (eixo "ingênuo", sem fuso: ver Global
// Constraints do plano) para que a aritmética de sobreposição seja trivial e exata.

export type Faixa = { inicio: number; fim: number }

export function paraInstante(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso)
  if (!m) throw new Error(`data/hora inválida: ${iso}`)
  const [, ano, mes, dia, h, min, s] = m
  return Date.UTC(Number(ano), Number(mes) - 1, Number(dia), Number(h), Number(min), Number(s ?? 0))
}

export function paraInstanteDeData(dataISO: string, hora: string): number {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  const mh = /^(\d{2}):(\d{2})$/.exec(hora)
  if (!md || !mh) throw new Error(`data ou hora inválida: ${dataISO} ${hora}`)
  return Date.UTC(Number(md[1]), Number(md[2]) - 1, Number(md[3]), Number(mh[1]), Number(mh[2]), 0)
}

export function somarDias(instanteMs: number, dias: number): number {
  return instanteMs + dias * 86_400_000
}

export function proximoDia(dataISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  if (!m) throw new Error(`data inválida: ${dataISO}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

export function formatarInstante(instanteMs: number): string {
  const d = new Date(instanteMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** `null` quando as duas faixas não se tocam — fiel ao `[início, fim)` semiaberto: fronteiras
 *  encostadas (`a.fim === b.inicio`) não geram interseção. */
export function intersectar(a: Faixa, b: Faixa): Faixa | null {
  const inicio = Math.max(a.inicio, b.inicio)
  const fim = Math.min(a.fim, b.fim)
  return fim > inicio ? { inicio, fim } : null
}

function ordenarPorInicio(faixas: Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => a.inicio - b.inicio)
}

/** `mergeIntervals` do §5.3 do plano, ao pé da letra: sem isto, "sexta 22h–sábado 6h" +
 *  "sábado integral" contaria as 6 primeiras horas de sábado duas vezes. */
export function mergeIntervalos(faixas: Faixa[]): Faixa[] {
  const ordenadas = ordenarPorInicio(faixas)
  const unidas: Faixa[] = []
  for (const atual of ordenadas) {
    const ultima = unidas[unidas.length - 1]
    if (!ultima || atual.inicio > ultima.fim) {
      unidas.push({ ...atual })
    } else if (atual.fim > ultima.fim) {
      ultima.fim = atual.fim
    }
  }
  return unidas
}

/** Recorta `excluidas` de `faixas`, inclusive quando a exclusão cai no meio de uma faixa (parte
 *  em dois pedaços) ou cruza a borda dela (corta só o pedaço que sobrepõe). */
export function subtrairIntervalos(faixas: Faixa[], excluidas: Faixa[]): Faixa[] {
  if (excluidas.length === 0) return faixas
  const excluidasUnidas = mergeIntervalos(excluidas)
  let resultado = faixas
  for (const exclusao of excluidasUnidas) {
    const proximo: Faixa[] = []
    for (const faixa of resultado) {
      if (exclusao.fim <= faixa.inicio || exclusao.inicio >= faixa.fim) {
        proximo.push(faixa)
        continue
      }
      if (exclusao.inicio > faixa.inicio) {
        proximo.push({ inicio: faixa.inicio, fim: Math.min(exclusao.inicio, faixa.fim) })
      }
      if (exclusao.fim < faixa.fim) {
        proximo.push({ inicio: Math.max(exclusao.fim, faixa.inicio), fim: faixa.fim })
      }
    }
    resultado = proximo
  }
  return resultado
}

/** Sempre inteiro: as faixas vêm de horas `HH:MM` (sem segundos), então o total em ms é sempre
 *  múltiplo de 60 000 — o `floor` aqui é exatidão, não arredondamento. */
export function duracaoMinutos(faixas: Faixa[]): number {
  const totalMs = faixas.reduce((soma, f) => soma + (f.fim - f.inicio), 0)
  return Math.floor(totalMs / 60_000)
}
