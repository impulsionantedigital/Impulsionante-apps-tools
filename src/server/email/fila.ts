import 'server-only'
import { criarOrcamento, type Orcamento } from '@/lib/orcamento-tick'
import { admin } from '@/server/supabase'
import { backoff, deveDesistir } from '@/lib/retentativa'
import { montarEnvelope, htmlParaTexto } from '@/lib/email/envelope'
import type { TipoModelo } from '@/lib/email/tipos'
import { lerModelo } from '@/server/email/modelos'
import { configAtual, enviarEnvelope } from '@/server/email/enviar'

const LIMITE_POR_TICK = 20

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
}): Promise<{ ok: true } | { erro: string }> {
  const leitura = configAtual()
  if (!leitura.ok) return { erro: 'smtp_nao_configurado' }

  const modelo = await lerModelo(args.workspaceId, args.tipo)
  const envelope = montarEnvelope(leitura.config, args.para, modelo, args.valores)

  const { error } = await admin().from('emails_fila').insert({
    workspace_id: args.workspaceId,
    destinatario: envelope.para,
    assunto: envelope.assunto,
    html: envelope.html,
  })
  if (error) return { erro: 'falha_enfileirar' }
  return { ok: true }
}

export async function drenarEmail(
  orcamento: Orcamento = criarOrcamento(Date.now()),
): Promise<{ enviados: number; falhas: number; pulados: number }> {
  if (!orcamento.cabe('email')) return { enviados: 0, falhas: 0, pulados: 0 }

  const leitura = configAtual()
  if (!leitura.ok) return { enviados: 0, falhas: 0, pulados: 0 }

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
      await cli
        .from('emails_fila')
        .update({ enviado_em: new Date().toISOString(), ultimo_erro: null })
        .eq('id', linha.id)
      enviados++
      continue
    }

    const tentativas = linha.tentativas + 1
    const desiste = deveDesistir(tentativas, new Date(linha.criado_em).getTime(), Date.now())
    await cli
      .from('emails_fila')
      .update({
        tentativas,
        ultimo_erro: resultado.erro,
        proxima_tentativa: new Date(Date.now() + backoff(tentativas)).toISOString(),
        desistido_em: desiste ? new Date().toISOString() : null,
      })
      .eq('id', linha.id)
    falhas++
  }

  return { enviados, falhas, pulados }
}
