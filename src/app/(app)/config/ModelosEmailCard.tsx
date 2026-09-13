'use client'

import { useState, useTransition } from 'react'
import { salvarModeloEmail, enviarTeste, type VistaModelos, type ItemModelo } from './acoes-email'
import Botao from '@/components/ui/Botao'
import { Entrada, AreaTexto } from '@/components/ui/Campo'
import estilos from './config.module.css'

const ROTULO: Record<string, string> = {
  boas_vindas: 'Boas-vindas (cadastro novo)',
  recuperacao_senha: 'Recuperação de senha',
  entrega_produto: 'Produto liberado',
  pagamento_recebido: 'Pagamento recebido',
}

export default function ModelosEmailCard({ vista }: { vista: VistaModelos }) {
  const [abertoEm, setAbertoEm] = useState<string | null>(null)

  const itemAberto = vista.itens.find((item) => item.tipo === abertoEm) ?? null

  return (
    <section className={estilos.bloco}>
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Modelos de e-mail</h2>
        <span className={estilos.blocoMeta}>Vale para este espaço de trabalho</span>
      </div>

      <p className={estilos.ajuda}>
        Personalize o assunto e o corpo dos quatro e-mails que o CRM pode enviar. Os campos
        entre colchetes (ex.: <code className={estilos.campoTag}>[MEMBER_NAME]</code>) são
        trocados pelo dado real na hora do envio.
      </p>

      {!vista.smtpConfigurado && (
        <>
          <p className={estilos.frase}>O CRM ainda não envia e-mail.</p>
          <p className={estilos.ajuda}>
            Falta configurar no servidor: <strong>{vista.faltando.join(', ')}</strong>. Sem
            elas nada quebra — os modelos abaixo continuam editáveis, só o botão de teste fica
            desligado até você configurar.
          </p>
        </>
      )}

      <ul className={estilos.lista}>
        {vista.itens.map((item) => (
          <li key={item.tipo} className={estilos.item}>
            <span className={estilos.itemInfo}>
              <span className={estilos.itemRotulo}>{ROTULO[item.tipo] ?? item.tipo}</span>
              {item.ehPadrao && (
                <span className={`${estilos.selo} ${estilos.selo_neutro}`}>padrão</span>
              )}
            </span>
            <span className={estilos.acoes}>
              <Botao
                variante="fantasma"
                tamanho="pequeno"
                onClick={() => setAbertoEm(abertoEm === item.tipo ? null : item.tipo)}
              >
                {abertoEm === item.tipo ? 'Fechar' : 'Editar'}
              </Botao>
            </span>
          </li>
        ))}
      </ul>

      {itemAberto && (
        <Editor
          key={itemAberto.tipo}
          item={itemAberto}
          podeTestar={vista.smtpConfigurado}
          rotulo={ROTULO[itemAberto.tipo] ?? itemAberto.tipo}
        />
      )}
    </section>
  )
}

function Editor({
  item,
  podeTestar,
  rotulo,
}: {
  item: ItemModelo
  podeTestar: boolean
  rotulo: string
}) {
  const [assunto, setAssunto] = useState(item.assunto)
  const [html, setHtml] = useState(item.html)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pendente, comecar] = useTransition()

  function mensagemDeErro(codigo: string): string {
    return codigo === 'nao_autorizado' ? 'Só o dono deste servidor pode mudar os modelos.'
      : codigo === 'tipo_desconhecido' ? 'Este modelo não existe mais. Recarregue a página.'
      : codigo === 'campos_obrigatorios' ? 'Assunto e corpo não podem ficar em branco.'
      : codigo === 'falha_enfileirar' ? 'Não consegui colocar o teste na fila. Tente de novo.'
      : codigo === 'sem_email' ? 'Sua conta não tem e-mail cadastrado para receber o teste.'
      : 'Não consegui. Tente de novo.'
  }

  function salvar() {
    comecar(async () => {
      const r = await salvarModeloEmail(item.tipo, assunto, html)
      if ('erro' in r) { setOk(null); setErro(mensagemDeErro(r.erro)); return }
      setErro(null)
      setOk('Salvo.')
    })
  }

  function testar() {
    comecar(async () => {
      const r = await enviarTeste(item.tipo)
      if ('erro' in r) { setOk(null); setErro(mensagemDeErro(r.erro)); return }
      setErro(null)
      setOk('Teste na fila. Chega em segundos.')
    })
  }

  return (
    <div className={estilos.modeloEditor}>
      <p className={estilos.rotuloSecao}>Editando: {rotulo}</p>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor={`assunto-${item.tipo}`}>Assunto</label>
        <Entrada
          id={`assunto-${item.tipo}`}
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          disabled={pendente}
        />
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor={`html-${item.tipo}`}>Corpo (HTML)</label>
        <AreaTexto
          id={`html-${item.tipo}`}
          rows={12}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          disabled={pendente}
          spellCheck={false}
        />
      </div>

      <div className={estilos.campo}>
        <p className={estilos.rotulo}>Campos disponíveis neste modelo</p>
        <div className={estilos.camposDisponiveis}>
          {item.campos.map((campo) => (
            <code key={campo} className={estilos.campoTag}>[{campo}]</code>
          ))}
        </div>
      </div>

      <div className={estilos.acoes}>
        <Botao variante="primario" carregando={pendente} onClick={salvar}>
          Salvar
        </Botao>
        <Botao
          variante="secundario"
          carregando={pendente}
          desabilitado={!podeTestar}
          onClick={testar}
        >
          Enviar teste para mim
        </Botao>
      </div>

      {ok ? <p className={estilos.frase} role="status">{ok}</p> : null}
      {erro ? <p className={estilos.erro} role="alert">{erro}</p> : null}
    </div>
  )
}
