const DEGRAUS_MIN = [1, 5, 15, 30, 60, 120, 360, 720]

export const MAX_TENTATIVAS = 8

export const IDADE_MAX_MS = 7 * 24 * 60 * 60 * 1000

export function backoff(tentativas: number): number {
  const i = Math.min(Math.max(tentativas, 0), DEGRAUS_MIN.length - 1)
  return DEGRAUS_MIN[i] * 60_000
}

export function deveDesistir(tentativas: number, criadoEmMs: number, agoraMs: number): boolean {
  if (tentativas >= MAX_TENTATIVAS) return true
  return agoraMs - criadoEmMs > IDADE_MAX_MS
}
