import 'server-only'
import { criarClienteServidor } from '@/server/supabase-session'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { codigoDeBanco } from '@/lib/erro-de-banco'
import { detalheSeguro } from '@/lib/sanitizar-erro'
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

/** A vista de lista: sem o `entrada`/`resultado` INTEIROS — cada um pode chegar a ~1 MB de
 * jsonb. `sentenciado` e `execucao` são as duas únicas chaves extraídas de `entrada`, via `->>`
 * do PostgREST: isso lê só esses dois campos de texto, sem trazer o jsonb completo. */
export type CalculoResumo = {
  id: string
  decreto_id: string
  motor_versao: string
  titulo: string
  criado_em: string
  atualizado_em: string
  sentenciado: string | null
  execucao: string | null
}

const COLUNAS = 'id, decreto_id, motor_versao, titulo, entrada, resultado, criado_em, atualizado_em'
const COLUNAS_RESUMO =
  'id, decreto_id, motor_versao, titulo, criado_em, atualizado_em, sentenciado:entrada->>sentenciado, execucao:entrada->>execucao'

const ERRO_LEITURA = 'Não consegui carregar os seus cálculos agora. Tente de novo em alguns instantes.'

/**
 * Os cálculos do membro logado, no workspace ATIVO e NAQUELE DECRETO — resumo, sem
 * `entrada`/`resultado`.
 *
 * A RLS aplica `e_membro(workspace_id) and user_id = auth.uid()`, mas isso é
 * verdadeiro em TODOS os workspaces de que o usuário é membro — quem pertence a
 * dois veria, dentro de um, os cálculos feitos no outro. O `.eq('workspace_id',
 * ws)` é o que falta para restringir ao espaço de trabalho ativo; a RLS
 * continua sendo o que restringe ao próprio dono.
 *
 * 🔴 `decreto_id` NÃO é refinamento cosmético: cada rota de calculadora é de um
 * decreto só, e um cálculo de outro decreto abriria com o motor errado no cabeçalho.
 */
export async function listarCalculos(decretoId: string): Promise<CalculoResumo[]> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return []

  const { data, error } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS_RESUMO)
    .eq('workspace_id', ws)
    .eq('decreto_id', decretoId)
    .order('atualizado_em', { ascending: false })

  if (error) {
    // Uma falha de banco aqui não pode virar "lista vazia" — isso levaria o
    // advogado a concluir que perdeu os próprios cálculos. Em Server Component,
    // lançar é o certo: a página cai no limite de erro do Next.
    console.error('[indulto-comutacao] listarCalculos', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }

  return (data ?? []) as CalculoResumo[]
}

export async function lerCalculo(id: string): Promise<CalculoSalvo | null> {
  const cliente = await criarClienteServidor()
  const ws = await resolverWorkspaceAtivo({ cliente })
  if (!ws) return null

  const { data, error } = await cliente
    .from('indulto_comutacao_calculos')
    .select(COLUNAS)
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle()

  if (error) {
    // 22P02: formato de uuid inválido — é o que o PostgREST devolve quando `id`
    // não é um uuid (por exemplo, um pedaço de URL forjado). Isso é "não achei",
    // não falha de banco: continua virando `null`, e daí 404 na tela — nunca a
    // tela genérica de erro de servidor.
    if (codigoDeBanco(error) === '22P02') return null
    console.error('[indulto-comutacao] lerCalculo', detalheSeguro(error))
    throw new Error(ERRO_LEITURA)
  }

  return (data as CalculoSalvo | null) ?? null
}
