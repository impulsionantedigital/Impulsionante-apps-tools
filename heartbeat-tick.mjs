


const PORT = process.env.PORT || 80
const INTERVALO = Math.max(5000, Number(process.env.HEARTBEAT_INTERVAL_MS) || 30000)
const SECRET = process.env.TICK_SECRET || ''























let rodando = false

async function tick() {
  if (rodando) {
    console.warn('[heartbeat] tick anterior ainda rodando — pulando esta batida')
    return
  }
  rodando = true
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/interno/tick`, {
      method: 'POST', headers: { authorization: SECRET },
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) console.warn('[heartbeat] tick não-ok:', r.status)
  } catch (err) {
    console.warn('[heartbeat] tick falhou:', err?.message ?? err)
  } finally {
    rodando = false
  }
}

console.log(`[heartbeat] ligado (intervalo ${INTERVALO}ms, porta ${PORT})`)
setInterval(tick, INTERVALO)
