'use server'

import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { criarClienteServidor } from '@/server/supabase-session'
import { ehDonoDoDeploy } from '@/server/auth/dono-deploy'
import { exigirEngineLiberado } from '@/server/license/exigir'
import { TIPOS, CAMPOS, ehTipoConhecido, type TipoModelo } from '@/lib/email/tipos'
import { PADROES } from '@/lib/email/padroes'
import { valoresDeTeste } from '@/lib/email/valores-teste'
import { lerModelo, gravarModelo } from '@/server/email/modelos'
import { enfileirar } from '@/server/email/fila'
import { configAtual } from '@/server/email/enviar'

export interface ItemModelo {
  tipo: TipoModelo
  assunto: string
  html: string
  campos: readonly string[]
  ehPadrao: boolean
}

export interface VistaModelos {
  smtpConfigurado: boolean
  faltando: string[]
  itens: ItemModelo[]
}

// Só o dono do servidor mexe nos modelos, e eles vivem no espaço de trabalho ativo dele —
// não há tela de troca de workspace aqui, é sempre o mesmo que `resolverWorkspaceAtivo`
// resolve para a sessão atual (o cookie, ou o primeiro workspace de que ele é membro).
async function workspaceDoDono(): Promise<string | null> {
  if (!(await ehDonoDoDeploy())) return null
  const cliente = await criarClienteServidor()
  return resolverWorkspaceAtivo({ cliente })
}

export async function lerModelosEmail(): Promise<VistaModelos | { erro: string }> {
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }

  const leitura = configAtual()
  const itens: ItemModelo[] = []
  for (const tipo of TIPOS) {
    const modelo = await lerModelo(ws, tipo)
    itens.push({
      tipo,
      assunto: modelo.assunto,
      html: modelo.html,
      campos: CAMPOS[tipo],
      ehPadrao: modelo.assunto === PADROES[tipo].assunto && modelo.html === PADROES[tipo].html,
    })
  }

  return {
    smtpConfigurado: leitura.ok,
    faltando: leitura.ok ? [] : leitura.faltando,
    itens,
  }
}

export async function salvarModeloEmail(
  tipo: string,
  assunto: string,
  html: string,
): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }
  if (!ehTipoConhecido(tipo)) return { erro: 'tipo_desconhecido' }
  if (assunto.trim() === '' || html.trim() === '') return { erro: 'campos_obrigatorios' }

  await gravarModelo(ws, tipo, { assunto, html })
  return { ok: true }
}

export async function enviarTeste(tipo: string): Promise<{ ok: true } | { erro: string }> {
  await exigirEngineLiberado()
  const ws = await workspaceDoDono()
  if (!ws) return { erro: 'nao_autorizado' }
  if (!ehTipoConhecido(tipo)) return { erro: 'tipo_desconhecido' }

  const cliente = await criarClienteServidor()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user?.email) return { erro: 'sem_email' }

  return enfileirar({
    workspaceId: ws,
    tipo,
    para: user.email,
    valores: valoresDeTeste(tipo, user.email),
  })
}
