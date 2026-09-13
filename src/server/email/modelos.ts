import 'server-only'
import { admin } from '@/server/supabase'
import { PADROES, type Modelo } from '@/lib/email/padroes'
import type { TipoModelo } from '@/lib/email/tipos'

export async function lerModelo(workspaceId: string, tipo: TipoModelo): Promise<Modelo> {
  const { data } = await admin()
    .from('modelos_email')
    .select('assunto, html, ativo')
    .eq('workspace_id', workspaceId)
    .eq('tipo', tipo)
    .maybeSingle()

  const linha = data as { assunto: string; html: string; ativo: boolean } | null
  if (!linha || !linha.ativo) return PADROES[tipo]
  return { assunto: linha.assunto, html: linha.html }
}

export async function gravarModelo(
  workspaceId: string,
  tipo: TipoModelo,
  modelo: Modelo,
): Promise<void> {
  const { error } = await admin()
    .from('modelos_email')
    .upsert(
      {
        workspace_id: workspaceId,
        tipo,
        assunto: modelo.assunto,
        html: modelo.html,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,tipo' },
    )
  if (error) throw error
}
