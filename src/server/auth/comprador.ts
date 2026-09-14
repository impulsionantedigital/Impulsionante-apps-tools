import 'server-only'
import { cache } from 'react'
import { criarClienteServidor } from '@/server/supabase-session'

/**
 * Esta instalação é só de ferramentas: quem é dono de algum espaço de trabalho administra; quem não
 * é, é comprador. Lê só as próprias linhas de `membros` (a RLS da 0065 não deixa ler outras).
 * Uma leitura por requisição.
 */
export const souDonoDeAlgumWorkspace = cache(async (): Promise<boolean> => {
  const cliente = await criarClienteServidor()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user) return false
  const { data, error } = await cliente
    .from('membros')
    .select('id')
    .eq('user_id', user.id)
    .eq('papel', 'owner')
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
})
