export type AbaConfig = 'espaco' | 'pessoas' | 'comercial' | 'servidor'


export const ABA_PADRAO: AbaConfig = 'espaco'


export const ROTULO_ABA: Record<AbaConfig, string> = {
  espaco: 'Espaço de trabalho',
  pessoas: 'Pessoas',
  comercial: 'Comercial',
  servidor: 'Servidor',
}


export function abasDisponiveis({
  pessoas,
  servidor,
  comercial = false,
}: {
  pessoas: boolean
  servidor: boolean
  /** Ofertas, vendas e eventos da Hotmart: só o owner do espaço de trabalho. */
  comercial?: boolean
}): AbaConfig[] {
  const abas: AbaConfig[] = [ABA_PADRAO]
  if (pessoas) abas.push('pessoas')
  if (comercial) abas.push('comercial')
  if (servidor) abas.push('servidor')
  return abas
}


export function resolverAba(param: string | undefined, disponiveis: AbaConfig[]): AbaConfig {
  return disponiveis.find((a) => a === param) ?? ABA_PADRAO
}


export function hrefDaAba(aba: AbaConfig): string {
  return aba === ABA_PADRAO ? '/config' : `/config?aba=${aba}`
}
