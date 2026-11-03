import { redirect } from 'next/navigation'
import { resolverWorkspaceAtivo } from '@/server/auth/workspace-ativo'
import { ehOwnerDoWorkspace } from '@/server/auth/owner-workspace'

export default async function CursosLayout({ children }: { children: React.ReactNode }) {
  const ws = await resolverWorkspaceAtivo()
  if (!ws || !(await ehOwnerDoWorkspace(ws))) redirect('/painel')
  return <>{children}</>
}
