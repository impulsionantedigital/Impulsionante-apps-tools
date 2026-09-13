import 'server-only'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import type { Entrada, Resultado } from '@/lib/indulto-comutacao/tipos'

export type CalculoSalvo = {
  id: string
  decreto_id: string
  motor_versao: string
  titulo: string
  entrada: Entrada
  resultado: Resultado
  criado_em: string
  atualizado_em: string
}

const COLUNAS = 'id, decreto_id, motor_versao, titulo, entrada, resultado, criado_em, atualizado_em'

/**
 * Os cálculos do membro logado.
 *
 * A leitura passa pelo cliente de sessão de propósito: a RLS aplica
 * `e_membro(workspace_id) and user_id = auth.uid()` sozinha, então não há filtro
 * de dono para esquecer aqui.
 */
export async function listarCalculos(): Promise<CalculoSalvo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS)
    .order('atualizado_em', { ascending: false })

  return (data ?? []) as CalculoSalvo[]
}

export async function lerCalculo(id: string): Promise<CalculoSalvo | null> {
  const cliente = await criarClienteServidor()
  const { data } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS)
    .eq('id', id)
    .maybeSingle()

  return (data as CalculoSalvo | null) ?? null
}
