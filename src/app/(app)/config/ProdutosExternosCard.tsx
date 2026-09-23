'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Botao from '@/components/ui/Botao'
import { Entrada } from '@/components/ui/Campo'
import {
  alternarProdutoExterno,
  excluirProdutoExterno,
  salvarProdutoExterno,
  type ProdutoExternoItem,
} from './acoes-produtos-externos'
import estilos from './config.module.css'

type Resposta = { ok: true; detalhe?: string } | { erro: string }

/**
 * O cadastro dos produtos que este CRM NÃO entrega — um curso na área de membros da Hotmart, um
 * produto físico.
 *
 * Fica ACIMA do card de ofertas de propósito: o produto é cadastrado antes de ser ofertado.
 *
 * 🔴 Desativar não recusa venda. Quando o webhook chega, a Hotmart já cobrou: recusar aqui não
 * estorna nada e ainda perde o registro de um dinheiro que entrou. Desativar é arquivamento do
 * catálogo ("não ofereça mais este produto ao montar uma oferta nova").
 */
export default function ProdutosExternosCard({
  produtos,
  executar,
  pendente,
}: {
  produtos: ProdutoExternoItem[]
  executar: (acao: () => Promise<Resposta>, sucesso: string) => void
  pendente: boolean
}) {
  const [novo, setNovo] = useState('')
  /* Qual produto está esperando o SEGUNDO clique. Guarda o id, e não um booleano: com um booleano,
     abrir a confirmação numa linha e clicar em `Excluir` de OUTRA excluiria a outra. */
  const [confirmando, setConfirmando] = useState<string | null>(null)

  function adicionar() {
    const nome = novo.trim()
    if (!nome) return
    executar(() => salvarProdutoExterno({ nome }), 'Produto externo cadastrado.')
    setNovo('')
  }

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Produtos externos</h2>
        <span className={estilos.blocoMeta}>Vale para este espaço de trabalho</span>
      </div>
      <p className={estilos.ajuda}>
        Coisas que você vende mas que este CRM <strong>não entrega</strong> — um curso na área de
        membros da Hotmart, um produto físico. Elas entram nas suas ofertas, ao lado das
        calculadoras, para você vender um curso e dar uma calculadora de brinde na mesma compra. O
        histórico financeiro de tudo o que se vende fica num lugar só.
      </p>

      <div className={estilos.linhaForm}>
        <Entrada
          value={novo}
          placeholder="Nome do produto (ex.: Curso de Execução Penal)"
          aria-label="Nome do novo produto externo"
          onChange={(e) => setNovo(e.target.value)}
          disabled={pendente}
          onKeyDown={(e) => {
            if (e.key === 'Enter') adicionar()
          }}
        />
        <Botao variante="primario" tamanho="pequeno" carregando={pendente} onClick={adicionar}>
          Adicionar
        </Botao>
      </div>

      {produtos.length === 0 ? (
        <p className={estilos.vazio}>Nenhum produto externo cadastrado.</p>
      ) : (
        <ul className={estilos.lista}>
          {produtos.map((p) => (
            <li key={p.id} className={estilos.item}>
              <label className={estilos.toggle}>
                <input
                  type="checkbox"
                  checked={p.ativo}
                  disabled={pendente}
                  onChange={(e) => executar(() => alternarProdutoExterno(p.id, e.target.checked), 'Produto externo atualizado.')}
                />
                <span className={estilos.itemRotulo}>{p.nome}</span>
              </label>
              <span className={estilos.itemInfo}>
                {p.ofertas > 0 ? (
                  <span className={`${estilos.selo} ${estilos.selo_neutro}`}>{p.ofertas} oferta(s)</span>
                ) : null}
                {!p.ativo && <span className={`${estilos.selo} ${estilos.selo_neutro}`}>desativado</span>}
              </span>
              <span className={estilos.acoes}>
                {/* O botão está SEMPRE visível — desabilitado quando há oferta ou venda, com o
                    motivo no `title`. Esconder deixaria a pessoa sem saber que a ação existe;
                    desabilitado com explicação ensina a regra. É a mesma receita da lista de
                    ofertas.
                    🔴 Aqui não há FK a recorrer: `ofertas_produtos.produto_id` e `vendas.produtos`
                    são colunas de texto que guardam id de código E id de banco — por isso a 0072
                    não cria a FK. A conferência é nossa, na ação. */}
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  tom="erro"
                  carregando={pendente}
                  desabilitado={p.ofertas > 0}
                  title={
                    p.ofertas > 0
                      ? `Usado por ${p.ofertas} oferta(s) — desative para parar de oferecê-lo em ofertas novas.`
                      : 'Excluir este produto externo'
                  }
                  onClick={() => {
                    // Primeiro clique arma; o segundo executa.
                    if (confirmando !== p.id) {
                      setConfirmando(p.id)
                      return
                    }
                    setConfirmando(null)
                    executar(() => excluirProdutoExterno(p.id), 'Produto externo excluído.')
                  }}
                >
                  {confirmando === p.id ? 'Confirmar exclusão?' : 'Excluir'}
                </Botao>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
