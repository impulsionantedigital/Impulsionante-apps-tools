


const PORT = process.env.PORT || 80
// 🔴 15s, e não 30s. Dois motivos, os dois de 2026-09-23:
//
// 1. ESPAÇAMENTO ENTRE E-MAILS. Os e-mails de um mesmo evento saem em instantes diferentes
//    (`agendado_para`). Com batida de 30s, o segundo e-mail podia esperar até 30s A MAIS que o
//    previsto — o espaçamento virava imprevisível, e a fila parecia travada para quem olhasse.
// 2. FIDELIDADE DE ENTREGA. Um e-mail logo após a compra é o que dá a senha ao comprador; esperar
//    até 30s a mais para ele sair é tempo que o cliente passa olhando uma caixa vazia.
//
// O piso de 5s e a guarda de reentrância abaixo impedem empilhamento: uma batida que ainda esteja
// rodando é pulada, então baixar o intervalo não multiplica trabalho — só reduz o atraso médio.
// Continua ajustável por HEARTBEAT_INTERVAL_MS, para quem preferir mais folga.
const INTERVALO = Math.max(5000, Number(process.env.HEARTBEAT_INTERVAL_MS) || 15000)
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
