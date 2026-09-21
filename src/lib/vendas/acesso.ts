export type EstadoAcesso = 'ativo' | 'encerrado' | 'nunca'

/**
 * De onde o acesso nasceu. `degustacao` é o brinde concedido por uma oferta filha.
 *
 * 🔴 É um dado do PERÍODO, não da oferta: editar a oferta depois não reescreve o que já foi
 * concedido (§7.4), e é por isso que a pergunta "este acesso é trial?" não vai à oferta.
 */
export type OrigemAcesso = 'venda' | 'degustacao'

export interface PeriodoDoMembro {
  produtoId: string
  iniciaEm: Date
  expiraEm: Date | null
  vendaAtiva: boolean
  origem: OrigemAcesso
}

/**
 * Os três estados da §9.2:
 * - `nunca`: nenhum período daquele produto — a ferramenta nem aparece;
 * - `ativo`: um período de venda ativa cobre este instante;
 * - `encerrado`: já teve, mas nada cobre agora — vê o que produziu, não cria nem edita.
 *
 * Só o DONO DO SERVIDOR passa por cima — nunca o owner de um workspace, que qualquer usuário
 * logado pode criar. O vencimento é fronteira exclusiva.
 */
export function estadoDeAcesso(args: {
  produto: string
  ehDonoDoServidor: boolean
  periodos: readonly PeriodoDoMembro[]
  agora: Date
}): EstadoAcesso {
  if (args.ehDonoDoServidor) return 'ativo'
  const doProduto = args.periodos.filter((p) => p.produtoId === args.produto)
  if (doProduto.length === 0) return 'nunca'
  const t = args.agora.getTime()
  const cobre = doProduto.some(
    (p) => p.vendaAtiva && p.iniciaEm.getTime() <= t && (p.expiraEm === null || p.expiraEm.getTime() > t),
  )
  return cobre ? 'ativo' : 'encerrado'
}

/** O período que está concedendo acesso AGORA — a mesma conta de `estadoDeAcesso`, isolada. */
function cobrindoAgora(periodos: readonly PeriodoDoMembro[], agora: Date): PeriodoDoMembro | null {
  const t = agora.getTime()
  return (
    periodos.find(
      (p) => p.vendaAtiva && p.iniciaEm.getTime() <= t && (p.expiraEm === null || p.expiraEm.getTime() > t),
    ) ?? null
  )
}

/**
 * O detalhe de quem não tem acesso nenhum — e também o do dono do servidor, que passa por cima mas
 * não é degustação de ninguém.
 *
 * 🔴 É uma constante, e não um objeto literal repetido em cada retorno: o `detalheDeAcesso` tem
 * quatro saídas, e um campo novo no tipo passaria a faltar em três delas sem o compilador reclamar
 * de cada uma. Fonte única do "vazio".
 */
export const SEM_DETALHE: DetalheAcesso = { trial: false, degustou: false, expiraEm: null, diasRestantes: null }

/** O que a tela do membro precisa saber sobre o acesso a um produto, além do estado. */
export interface DetalheAcesso {
  /**
   * 🔴 Campo ORTOGONAL ao estado, e não um quarto valor de `EstadoAcesso`. Se `trial` fosse um
   * valor do enum, os seis pontos que hoje perguntam `=== 'ativo'` passariam a recusá-lo, e o
   * membro em degustação não conseguiria criar nem editar cálculo — a tela apareceria, e a
   * gravação seria recusada sem explicação. Estado é permissão; trial é rótulo.
   *
   * Responde sobre o acesso de AGORA: um trial vencido deixa isto em `false`.
   */
  trial: boolean
  /**
   * Se este membro JÁ teve degustação deste produto, vencida ou não. É o que separa "sua
   * degustação acabou" de "seu acesso expirou" — dois recados diferentes, porque também são duas
   * conversões diferentes: quem experimentou e não comprou precisa de um empurrão, quem era pagante
   * precisa de uma renovação.
   */
  degustou: boolean
  /** Vence o acesso vigente agora. Nulo em vitalício, e em `nunca`/`encerrado`. */
  expiraEm: Date | null
  /** Diferença em dias inteiros até o vencimento, arredondada para cima. Nulo quando não há. */
  diasRestantes: number | null
}

/**
 * O detalhe do acesso vigente. Só devolve `trial` quando há um período COBRINDO AGORA: um trial
 * vencido não é mais um trial, é histórico — e quem pergunta "posso mostrar a tela de degustação?"
 * quer a resposta sobre o acesso de agora.
 */
export function detalheDeAcesso(args: {
  produto: string
  ehDonoDoServidor: boolean
  periodos: readonly PeriodoDoMembro[]
  agora: Date
}): DetalheAcesso {
  // O dono do servidor não tem período: ele passa por cima, e não é degustação de ninguém.
  if (args.ehDonoDoServidor) return SEM_DETALHE
  const doProduto = args.periodos.filter((p) => p.produtoId === args.produto)
  // 🔴 Consultado sobre TODOS os períodos do produto, e não só sobre o vigente: a pergunta é "já
  // experimentou?", e a resposta não deixa de ser verdadeira quando o trial vence.
  const degustou = doProduto.some((p) => p.origem === 'degustacao')
  const vigente = cobrindoAgora(doProduto, args.agora)
  if (!vigente) return { ...SEM_DETALHE, degustou }
  const expiraEm = vigente.expiraEm
  return {
    trial: vigente.origem === 'degustacao',
    degustou,
    expiraEm,
    diasRestantes: expiraEm ? Math.max(0, Math.ceil((expiraEm.getTime() - args.agora.getTime()) / 86_400_000)) : null,
  }
}
