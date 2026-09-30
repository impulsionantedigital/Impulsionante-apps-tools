/**
 * O intervalo entre os e-mails de UM MESMO evento.
 *
 * 🔴 POR QUE ISTO EXISTE: uma compra que concede brinde enfileirava três e-mails no mesmo segundo,
 * do mesmo remetente, para o mesmo endereço. O Gmail classificou os últimos como rajada e os mandou
 * para o SPAM — inclusive o do brinde. "Aceito pelo servidor" não quer dizer "entregue na caixa".
 *
 * 90 segundos é folgado o bastante para o provedor não ler rajada, e curto o bastante para o
 * comprador não estranhar a demora do segundo e-mail. O valor é o MESMO para todos os casos: a
 * ordem em que os e-mails entram na fila é a ordem de chegada (a RPC ordena por `agendado_para`).
 */
export const INTERVALO_ENTRE_EMAILS_MS = 90_000

/**
 * Em que instante o enésimo e-mail (base zero) do evento deve sair.
 *
 * 🔴 Um e-mail só NÃO é espaçado: ele sai assim que o relógio bater, como sempre saiu. O atraso
 * existe para desfazer a rajada, e não para tornar todo e-mail lento.
 */
export function instanteDoEmail(indice: number, agoraMs: number): Date {
  return new Date(agoraMs + Math.max(0, indice) * INTERVALO_ENTRE_EMAILS_MS)
}
