import 'server-only'
import { criarOrcamento, type Orcamento } from '@/lib/orcamento-tick'
import { admin } from '@/server/supabase'
import { backoff, deveDesistir, IDADE_MAX_MS } from '@/lib/retentativa'
import { htmlParaTexto } from '@/lib/email/envelope'
import { renderizarHtml, renderizarTexto } from '@/lib/email/merge'
import type { Modelo } from '@/lib/email/padroes'
import type { TipoModelo } from '@/lib/email/tipos'
import { lerModelo } from '@/server/email/modelos'
import { configAtual, enviarEnvelope } from '@/server/email/enviar'

const LIMITE_POR_TICK = 20

// Função pura: renderiza o que vai para a fila sem depender de configuração de SMTP.
// enfileirar() não pode falhar por falta de config — o remetente só é lido de novo, na hora
// do envio, dentro de drenarEmail.
export function renderizarParaFila(
  modelo: Modelo,
  valores: Record<string, string>,
): { assunto: string; html: string } {
  return {
    assunto: renderizarTexto(modelo.assunto, valores),
    html: renderizarHtml(modelo.html, valores),
  }
}

type LinhaFila = {
  id: string
  workspace_id: string
  destinatario: string
  assunto: string
  html: string
  criado_em: string
  tentativas: number
}

export async function enfileirar(args: {
  workspaceId: string
  tipo: TipoModelo
  para: string
  valores: Record<string, string>
  /** Idempotência: com a mesma chave, só o primeiro enfileiramento vale (emails_fila_chave_evento_key). */
  chave?: string
}): Promise<{ ok: true } | { erro: string }> {
  const modelo = await lerModelo(args.workspaceId, args.tipo)
  const { assunto, html } = renderizarParaFila(modelo, args.valores)

  const { error } = await admin().from('emails_fila').insert({
    workspace_id: args.workspaceId,
    destinatario: args.para,
    assunto,
    html,
    chave_evento: args.chave ?? null,
  })
  // Chave repetida: este e-mail já está na fila, ou já saiu. Reprocessar não pode duplicá-lo.
  if (error && args.chave && error.code === '23505') return { ok: true }
  if (error) return { erro: 'falha_enfileirar' }
  return { ok: true }
}

// Quando falta configuração de SMTP, a fila não pode simplesmente parar de envelhecer: sem
// isto, as linhas pendentes ficam à espera para sempre, e se o dono ligar o SMTP meses depois
// a fila despeja de uma vez o acumulado — inclusive senhas temporárias havia muito expiradas.
// Aqui não há reserva de RPC nem envio: só desistir do que já passou da idade máxima.
async function desistirAntigosSemSmtp(): Promise<void> {
  const limite = new Date(Date.now() - IDADE_MAX_MS).toISOString()
  const { error } = await admin()
    .from('emails_fila')
    .update({
      desistido_em: new Date().toISOString(),
      // Desistir também apaga o corpo: ele pode levar a senha temporária em texto claro.
      html: '',
      ultimo_erro: 'smtp_nao_configurado',
    })
    .is('enviado_em', null)
    .is('desistido_em', null)
    .lt('criado_em', limite)
  if (error) {
    console.warn('[email/fila] falha ao desistir e-mails antigos sem SMTP configurado', error)
  }
}

export async function drenarEmail(
  orcamento: Orcamento = criarOrcamento(Date.now()),
): Promise<{ enviados: number; falhas: number; pulados: number }> {
  if (!orcamento.cabe('email')) return { enviados: 0, falhas: 0, pulados: 0 }

  const leitura = configAtual()
  if (!leitura.ok) {
    await desistirAntigosSemSmtp()
    return { enviados: 0, falhas: 0, pulados: 0 }
  }

  const cli = admin()
  const { data, error } = await cli.rpc('reservar_emails', { p_limite: LIMITE_POR_TICK })
  if (error) throw error
  const linhas = (data ?? []) as LinhaFila[]

  let enviados = 0
  let falhas = 0
  let pulados = 0

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (!orcamento.cabe('email')) {
      pulados += linhas.length - i
      break
    }

    const resultado = await enviarEnvelope(
      {
        de: leitura.config.remetente,
        para: linha.destinatario,
        assunto: linha.assunto,
        html: linha.html,
        texto: htmlParaTexto(linha.html),
      },
      leitura.config,
    )

    if ('ok' in resultado) {
      // Limpa o html depois de enviado: o banco não guarda para sempre o corpo renderizado,
      // que em dois dos quatro modelos embute [TEMP_PASSWORD] em texto claro. O assunto fica —
      // é o que torna a linha legível na auditoria, e nenhum padrão vaza senha nele.
      const { error: erroEnvio } = await cli
        .from('emails_fila')
        .update({ enviado_em: new Date().toISOString(), ultimo_erro: null, html: '' })
        .eq('id', linha.id)
      if (erroEnvio) {
        console.warn('[email/fila] falha ao marcar e-mail como enviado', erroEnvio)
      }
      enviados++
      continue
    }

    const tentativas = linha.tentativas + 1
    const desiste = deveDesistir(tentativas, new Date(linha.criado_em).getTime(), Date.now())
    const { error: erroFalha } = await cli
      .from('emails_fila')
      .update({
        tentativas,
        ultimo_erro: resultado.erro,
        proxima_tentativa: new Date(Date.now() + backoff(tentativas)).toISOString(),
        desistido_em: desiste ? new Date().toISOString() : null,
        ...(desiste ? { html: '' } : {}),
      })
      .eq('id', linha.id)
    if (erroFalha) {
      console.warn('[email/fila] falha ao atualizar tentativa de envio', erroFalha)
    }
    falhas++
  }

  return { enviados, falhas, pulados }
}
