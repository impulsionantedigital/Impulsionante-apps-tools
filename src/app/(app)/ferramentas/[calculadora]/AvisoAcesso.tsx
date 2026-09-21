import Botao from '@/components/ui/Botao'
import { avisoDeAcesso, textoDoAviso, type AvisoAcesso } from '@/lib/vendas/aviso-acesso'
import { checkoutDoProduto, type Produto } from '@/lib/produtos/catalogo'
import { estadoEDetalheDoProduto } from '@/server/vendas/acesso'
import estilos from './calculadora.module.css'

/**
 * O recado sobre o acesso, no topo da tela do produto.
 *
 * 🔴 O botão de checkout só aparece para quem PERDEU o acesso ou está em degustação. É a diferença
 * entre conversão e renovação: quem ainda tem acesso e vai renovar na Hotmart não precisa de um
 * botão aqui — ele competiria com o trabalho da pessoa, e o lembrete de vencimento já resolve.
 *
 * 🔴 E o aviso de vencimento é um LEMBRETE, não uma ordem de pagamento: o CRM não cobra e não sabe
 * da assinatura da Hotmart, então o texto manda a ação para a Hotmart em vez de sugerir um botão de
 * pagar que não existe nesta tela.
 */
export default async function AvisoAcesso({ produto }: { produto: Produto }) {
  const { estado, detalhe } = await estadoEDetalheDoProduto(produto.id)
  const aviso = avisoDeAcesso({ estado, detalhe })
  const texto = textoDoAviso(aviso)
  // Nada a dizer: a tela fica limpa, sem bloco vazio.
  if (!texto) return null

  // Lido do ambiente, no servidor: sem a variável (ou vazia), o aviso sai sem botão.
  const checkout = checkoutDoProduto(produto.slug)
  const comBotao = aviso.tipo === 'trial' || aviso.tipo === 'expirado' || aviso.tipo === 'trialExpirado'

  return (
    <div className={`${estilos.avisoVersao} ${classeDoTom(aviso)}`} role="status">
      <b>{texto.titulo}</b> {texto.corpo}
      {comBotao ? (
        checkout ? (
          // Sem "externo": o `Botao` já distingue interno de externo pelo `href` — URL absoluta
          // vira `<a href>` com `target="_blank"`, rota interna vira `<Link>`.
          <Botao href={checkout} variante="primario" tamanho="pequeno" target="_blank" rel="noopener noreferrer">
            {texto.acao}
          </Botao>
        ) : (
          // Sem endereço de venda configurado: o recado vai sem botão, e sem link quebrado.
          <span> {texto.acao}.</span>
        )
      ) : null}
    </div>
  )
}

/** O tom do bloco: o que já perdeu acesso pesa mais que o que ainda tem tempo. */
function classeDoTom(aviso: AvisoAcesso): string {
  return aviso.tipo === 'expirado' || aviso.tipo === 'trialExpirado' ? estilos.avisoForte : ''
}
