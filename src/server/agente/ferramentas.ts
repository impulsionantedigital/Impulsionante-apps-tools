





























import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { admin } from '@/server/supabase'
import { buscarVarias, lerSecao, listarPorTermos } from '@/server/agente/busca-base'
import { montarBlocoConhecimento, montarBlocoLista, montarBlocoSecao } from '@/lib/canais/bloco-conhecimento'
import { criarRefs } from '@/lib/canais/refs-da-rodada'
import {
  TETO_ANOTACAO,
  chaveDaAnotacao,
  prefixoDaConversa,
  sanitizarAnotacao,
} from '@/lib/agente/anotacao-do-assistente'
import {
  TETO_CARACTERES_BLOCO,
  TETO_MENSAGENS_HISTORICO,
  cortarBloco,
  neutralizarCerca,
  rotularAutor,
  truncarTexto,
  type AutorDaMensagem,
} from '@/lib/canais/historico-agente'


export interface CtxFerramentas {
  workspaceId: string
  conversaId: string
  contatoId: string | null
  
  assistenteId: string | null
}


export type DefinicaoFerramenta = {
  id: string
  description: string
  inputSchema: z.ZodTypeAny
  execute: (input: unknown) => Promise<unknown>
}


const TETO_NEGOCIOS = 20


const TETO_CONSULTA = 1000


const TETO_ANOTACOES_POR_RODADA = 1


const REF_DESCONHECIDA =
  '[secao] Referencia desconhecida. Use uma referencia devolvida por buscarBase ou listarNaBase.'


const TETO_ANOTACOES_POR_CONVERSA = 20


const SLUG_DO_TIPO = 'resumo_ia'


const SITUACAO: Record<string, string> = {
  aberto: 'em andamento',
  ganho: 'concluido',
  perdido: 'encerrado',
}

export function montarFerramentas(ctx: CtxFerramentas): Record<string, unknown> {
  // Uma tabela de referencias por rodada: o modelo ve r1, r2…, nunca o id do trecho.
  const refs = criarRefs()
  
  let anotacoesNestaRodada = 0

  const ferramentas: Record<string, DefinicaoFerramenta> = {
    fichaDoContato: {
      id: 'fichaDoContato',
      description:
        'Dados de cadastro da pessoa com quem voce esta falando: nome, telefone, e-mail e a empresa dela. Use para se dirigir a ela pelo nome.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.contatoId) return { semContato: true }
        
        
        
        
        const { data, error } = await admin()
          .from('contatos')
          .select('nome, telefone, email, empresas(nome)')
          .eq('workspace_id', ctx.workspaceId)
          .eq('id', ctx.contatoId)
          .maybeSingle()
        
        
        if (error || !data) return { semContato: true }
        const linha = data as { nome?: string; telefone?: string; email?: string; empresas?: unknown }
        const empresa = Array.isArray(linha.empresas) ? linha.empresas[0] : linha.empresas
        
        
        
        
        return {
          nome: neutralizarCerca(linha.nome ?? ''),
          telefone: neutralizarCerca(linha.telefone ?? ''),
          email: neutralizarCerca(linha.email ?? ''),
          empresa: neutralizarCerca((empresa as { nome?: string } | null)?.nome ?? ''),
        }
      },
    },

    negociosDoContato: {
      id: 'negociosDoContato',
      
      
      
      
      
      description:
        'Quantos atendimentos esta pessoa tem com a empresa (`quantidade`, o total) e em que situacao esta cada um dos ate 20 mais recentes (`situacoes`). Use para saber se ja existe algo em andamento com ela. Se vier `naoConsegui`, nao afirme numero nenhum: diga que nao consegue ver isso agora.',
      inputSchema: z.object({}),
      execute: async () => {
        
        
        
        if (!ctx.contatoId) return { naoConsegui: true }
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        const { data, count, error } = await admin()
          .from('negocios')
          .select('status', { count: 'exact' })
          .eq('workspace_id', ctx.workspaceId)
          .eq('contato_id', ctx.contatoId)
          .order('criado_em', { ascending: false })
          .limit(TETO_NEGOCIOS)
        
        
        
        
        if (error || !data || typeof count !== 'number') return { naoConsegui: true }
        const situacoes = (data as Array<{ status?: string }>)
          .map((n) => SITUACAO[n.status ?? ''] ?? 'em andamento')
        return { quantidade: count, situacoes }
      },
    },

    historicoRecente: {
      id: 'historicoRecente',
      
      
      
      description:
        'Trechos de conversas ANTERIORES com esta mesma pessoa (`mensagens`). Use quando ela mencionar algo que ja falou com a empresa antes. Se vier `naoConsegui`, nao afirme que nao ha historico: diga que nao consegue ver isso agora.',
      
      
      
      
      
      
      
      inputSchema: z.object({}),
      execute: async () => {
        
        
        
        if (!ctx.contatoId) return { naoConsegui: true }
        
        
        
        
        
        
        
        
        
        
        
        const { data: conversas, error: erroConversas } = await admin()
          .from('conversas')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('contato_id', ctx.contatoId)
          .order('atualizado_em', { ascending: false })
          .limit(TETO_NEGOCIOS)
        if (erroConversas || !conversas) return { naoConsegui: true }
        
        
        
        const ids = (conversas as Array<{ id: string }>).map((c) => c.id).filter((id) => id !== ctx.conversaId)
        
        
        
        if (ids.length === 0) return { mensagens: [] }

        const { data, error } = await admin()
          .from('mensagens')
          .select('direcao, autor, texto, origem_em')
          .eq('workspace_id', ctx.workspaceId)
          .in('conversa_id', ids)
          
          
          
          .in('status', ['recebida', 'pendente', 'enviada', 'entregue', 'lida'])
          .order('origem_em', { ascending: false })
          .limit(TETO_MENSAGENS_HISTORICO)
        if (error || !data) return { naoConsegui: true }

        const linhas = (data as Array<{ direcao: string; autor: AutorDaMensagem; texto: string }>)
          .filter((m) => (m.texto ?? '').trim())
          .reverse()
          
          
          
          .map((m) => {
            const corpo = neutralizarCerca(truncarTexto(m.texto))
            return m.direcao === 'entrada' ? `[cliente] ${corpo}` : rotularAutor(m.autor, corpo)
          })
        return { mensagens: cortarBloco(linhas, (l) => l.length, TETO_CARACTERES_BLOCO) }
      },
    },

    buscarBase: {
      id: 'buscarBase',
      description:
        'Procura na base de conhecimento (cards e documentos enviados) o que responde uma duvida. Aceita ate 3 consultas de uma vez: quando a pergunta junta assuntos diferentes, mande uma consulta para cada assunto na mesma chamada. Devolve trechos com a fonte e uma referencia (r1, r2…). Use para perguntas pontuais, de conceito e por tema.',
      // `consulta` (texto unico) e o formato antigo: modelo que ainda o mande continua sendo
      // atendido, como `[consulta]`.
      inputSchema: z.object({
        consultas: z.array(z.string().min(1).max(TETO_CONSULTA)).min(1).max(3).optional(),
        consulta: z.string().min(1).max(TETO_CONSULTA).optional(),
      }),
      execute: async (input: unknown) => {
        const bruto = (input ?? {}) as { consultas?: unknown; consulta?: unknown }
        const lista = Array.isArray(bruto.consultas)
          ? bruto.consultas
          : typeof bruto.consulta === 'string'
            ? [bruto.consulta]
            : []
        const consultas = lista
          .filter((c): c is string => typeof c === 'string')
          .map((c) => c.slice(0, TETO_CONSULTA))
          .slice(0, 3)
        const achados = await buscarVarias(ctx.workspaceId, consultas, {
          conversaId: ctx.conversaId,
          assistenteId: ctx.assistenteId,
        })
        return montarBlocoConhecimento(achados === 'indisponivel' ? 'indisponivel' : { achados }, refs)
      },
    },

    listarNaBase: {
      id: 'listarNaBase',
      description:
        'Lista TODAS as secoes da base (cada verbete, capitulo ou topico com titulo proprio) que citam os termos. Cada item e uma secao inteira, mesmo que o termo apareca so numa parte dela; em texto sem titulos, cada item e um ponto do texto onde o termo aparece. Com varios termos, so entram secoes que citam TODOS. Use "tema" para o que nao e uma palavra exata: os itens vem ordenados pelo tema, com o trecho mais ligado a ele. Para grafias diferentes da mesma palavra, use OR dentro do termo: "palavra1 OR palavra2". Informa o total e quantos faltam; peca a proxima pagina se precisar. Para confirmar um item duvidoso, use lerSecao com a referencia dele.',
      inputSchema: z.object({
        termos: z.array(z.string().min(1).max(200)).min(1).max(3),
        tema: z.string().min(1).max(300).optional(),
        pagina: z.number().int().min(1).optional(),
      }),
      execute: async (input: unknown) => {
        const bruto = (input ?? {}) as { termos?: unknown; tema?: unknown; pagina?: unknown }
        const termos = (Array.isArray(bruto.termos) ? bruto.termos : [])
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 3)
        const tema = typeof bruto.tema === 'string' ? bruto.tema.trim().slice(0, 300) : ''
        const pagina = Math.max(1, Math.floor(Number(bruto.pagina)) || 1)
        const rotulo = termos.join(' + ') + (tema ? ` | tema: ${tema}` : '')
        const lista = await listarPorTermos(ctx.workspaceId, termos, {
          assistenteId: ctx.assistenteId,
          pagina,
          tema: tema || undefined,
          conversaId: ctx.conversaId,
        })
        return montarBlocoLista(rotulo, lista === 'indisponivel' ? 'indisponivel' : { ...lista, pagina }, refs)
      },
    },

    lerSecao: {
      id: 'lerSecao',
      description:
        'Le a secao inteira (ou os trechos vizinhos) de onde veio um trecho, pela referencia (r1, r2…). Use quando a resposta parece continuar alem do trecho, por exemplo num verbete longo.',
      inputSchema: z.object({ ref: z.string().min(1).max(20), modo: z.enum(['secao', 'vizinhos']) }),
      execute: async (input: unknown) => {
        const bruto = (input ?? {}) as { ref?: unknown; modo?: unknown }
        const id = typeof bruto.ref === 'string' ? refs.id(bruto.ref) : null
        if (!id) return REF_DESCONHECIDA
        const modo = bruto.modo === 'vizinhos' ? 'vizinhos' : 'secao'
        return montarBlocoSecao(await lerSecao(ctx.workspaceId, id, modo, { assistenteId: ctx.assistenteId }))
      },
    },

    registrarNaFicha: {
      id: 'registrarNaFicha',
      
      
      
      
      
      
      
      
      
      
      
      description:
        'Guarda uma anotacao curta na ficha desta pessoa dentro do CRM da empresa, para a equipe ' +
        'ler depois. Use no MAXIMO uma vez, no fim do atendimento, e so quando houver fato novo ' +
        'que a equipe precise saber: o que a pessoa pediu, um dado que ela informou, ou a duvida ' +
        'que ficou sem resposta. NAO use para saudacao, conversa fiada, nem para repetir o que ' +
        'voce mesmo respondeu. A anotacao e interna: ela nao agenda nada, nao avisa ninguem e o ' +
        'cliente nao a ve — nunca diga a ele que voce registrou, anotou ou encaminhou alguma coisa.',
      
      
      
      inputSchema: z.object({ anotacao: z.string().min(1).max(TETO_ANOTACAO) }),
      execute: async (input: unknown) => {
        
        
        
        
        if (anotacoesNestaRodada >= TETO_ANOTACOES_POR_RODADA) {
          return { naoConsegui: true, motivo: 'voce ja registrou uma anotacao neste atendimento' }
        }
        
        
        
        
        
        if (!ctx.contatoId) {
          return { naoConsegui: true, motivo: 'esta conversa nao esta ligada a nenhuma ficha' }
        }
        
        
        const texto = sanitizarAnotacao((input as { anotacao?: unknown } | null)?.anotacao, TETO_ANOTACAO)
        
        
        
        if (!texto) return { naoConsegui: true, motivo: 'a anotacao ficou vazia' }

        
        
        
        
        const { data: tipo, error: erroTipo } = await admin()
          .from('tipos_atividade')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('slug', SLUG_DO_TIPO)
          .maybeSingle()
        if (erroTipo || !tipo) {
          return { naoConsegui: true, motivo: 'nao consigo registrar agora' }
        }

        
        
        
        
        const { count, error: erroConta } = await admin()
          .from('atividades')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', ctx.workspaceId)
          .like('chave_externa', `${prefixoDaConversa(ctx.conversaId)}%`)
        
        
        
        if (erroConta || typeof count !== 'number') {
          return { naoConsegui: true, motivo: 'nao consigo registrar agora' }
        }
        if (count >= TETO_ANOTACOES_POR_CONVERSA) {
          return { naoConsegui: true, motivo: 'ja ha anotacoes demais nesta ficha' }
        }

        const chave = chaveDaAnotacao(
          ctx.conversaId,
          createHash('sha256').update(texto).digest('hex'),
        )
        
        
        
        
        
        
        
        const { error: erroInsert } = await admin().from('atividades').insert({
          workspace_id: ctx.workspaceId,
          contato_id: ctx.contatoId,
          tipo_id: (tipo as { id: string }).id,
          autor: 'ia',
          conteudo: texto,
          chave_externa: chave,
        })
        if (erroInsert) {
          
          
          
          
          
          const codigo = (erroInsert as { code?: string }).code
          if (codigo === '23505') {
            anotacoesNestaRodada++
            return { jaRegistrado: true }
          }
          return { naoConsegui: true, motivo: 'nao consigo registrar agora' }
        }
        anotacoesNestaRodada++
        
        
        
        return { registrado: true }
      },
    },
  }
  return ferramentas
}
