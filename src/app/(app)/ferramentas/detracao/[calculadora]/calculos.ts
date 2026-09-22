// src/app/(app)/ferramentas/detracao/[calculadora]/calculos.ts
import 'server-only'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { codigoDeBanco } from '@/lib/erro-de-banco'
import { detalheSeguro } from '@/lib/sanitizar-erro'
import type { EntradaCalculo, ResultadoCalculo } from '@/lib/detracao/recolhimento-noturno/versoes/rn-2-2/tipos'

export type CalculoSalvo = {
  id: string
  calculo_tipo: string
  algoritmo_versao: string
  titulo: string
  entrada: EntradaCalculo
  resultado: ResultadoCalculo
  criado_em: string
  atualizado_em: string
}

export type CalculoResumo = {
  id: string
  calculo_tipo: string
  algoritmo_versao: string
  titulo: string
  criado_em: string
  atualizado_em: string
}

const COLUNAS = 'id, calculo_tipo, algoritmo_versao, titulo, entrada, resultado, criado_em, atualizado_em'
const COLUNAS_RESUMO = 'id, calculo_tipo, algoritmo_versao, titulo, criado_em, atualizado_em'

const ERRO_LEITURA = 'Não consegui carregar os seus cálculos agora. Tente de novo em alguns instantes.'

/** Os cálculos do membro logado, no workspace ATIVO e NAQUELE TIPO — mesma regra da
 *  `indulto-comutacao/calculos.ts`: a RLS restringe ao dono, e `.eq('workspace_id', ws)`
 *  restringe ao workspace ativo (sem isso, quem pertence a dois veria os cálculos do outro). */
export async function listarCalculos(calculoTipo: string): Promise<CalculoResumo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data, error } = await cliente
    .from('detracao_calculos')
    .select(COLUNAS_RESUMO)
    .eq('workspace_id', ws)
    .eq('calculo_tipo', calculoTipo)
    .order('atualizado_em', { ascending: false })

  if (error) {
    console.error('[detracao] listarCalculos', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }
  return (data ?? []) as CalculoResumo[]
}

export async function lerCalculo(id: string): Promise<CalculoSalvo | null> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return null

  const { data, error } = await cliente
    .from('detracao_calculos')
    .select(COLUNAS)
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle()

  if (error) {
    if (codigoDeBanco(error) === '22P02') return null
    console.error('[detracao] lerCalculo', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }
  // 🔴 NÃO se converte a entrada. Cada versão tem o seu próprio formulário e motor congelados, e
  // quem escolhe qual usar é a versão gravada (`algoritmo_versao`) — ver `versoes/registro.ts`.
  // Converter aqui era o caminho antigo, e ele PERDIA o documento: o número que aparecia passava a
  // ser o da fórmula nova, e o antigo só sobrevivia como JSON, sem como ser reconstruído.
  return (data as CalculoSalvo | null) ?? null
}
