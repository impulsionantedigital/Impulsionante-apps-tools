'use client'

import { useState, useTransition } from 'react'
import { Copy, Check } from 'lucide-react'
import { gerarConvite, cancelarConvite, corrigirDocumento, type VistaEquipe } from './acoes-equipe'
import { formatar } from '@/lib/documento'
import Botao from '@/components/ui/Botao'
import { Entrada, Selecao } from '@/components/ui/Campo'
import estilos from './config.module.css'


export default function EquipeCard({ inicial }: { inicial: VistaEquipe }) {
  const [vista, setVista] = useState(inicial)
  const [papel, setPapel] = useState<'owner' | 'membro'>('membro')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [docMembro, setDocMembro] = useState('')
  const [docValor, setDocValor] = useState('')

  function aplicar(r: { ok: true; vista: VistaEquipe } | { erro: string }) {
    if ('erro' in r) {
      setErro(
        r.erro === 'nao_autorizado' ? 'Só quem é dono deste espaço de trabalho pode convidar.'
        : r.erro === 'sem_workspace' ? 'Escolha um espaço de trabalho primeiro.'
        : r.erro === 'papel_invalido' ? 'Escolha um tipo de acesso válido.'
        : r.erro === 'documento_invalido' ? 'Informe um CPF ou CNPJ válido.'
        : r.erro === 'documento_em_uso' ? 'Este documento já pertence a outro membro.'
        : r.erro === 'falha_documento' ? 'Não foi possível salvar o documento.'
        : 'Não consegui. Tente de novo.',
      )
      return
    }
    setErro(null)
    setEmail('')
    setVista(r.vista)
  }

  async function copiar(link: string) {
    
    
    
    const completo = `${window.location.origin}${link}`
    try {
      await navigator.clipboard.writeText(completo)
      setCopiado(link)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      
      
      setErro(completo)
    }
  }

  return (
    <section className={estilos.bloco}>
      {}
      <div className={estilos.blocoCab}>
        <h2 className={estilos.blocoTitulo}>Pessoas</h2>
        <span className={estilos.blocoMeta}>
          Quem tem acesso a este espaço de trabalho
        </span>
      </div>

      <ul className={estilos.lista}>
        {vista.membros.map((m) => (
          <li key={m.id} className={estilos.item}>
            <span className={estilos.itemInfo}>
              <span className={estilos.itemRotulo}>{m.nome ?? m.email ?? 'conta sem e-mail'}</span>
              {m.nome && m.email ? <span className={estilos.ajuda}>{m.email}</span> : null}
              <span className={estilos.ajuda}>{m.cpfCnpj ? formatar(m.cpfCnpj) : 'sem CPF/CNPJ'}</span>
            </span>
            {}
            <span className={`${estilos.selo} ${estilos.selo_neutro}`}>
              {m.papel === 'owner' ? 'dono' : 'membro'}
            </span>
          </li>
        ))}
      </ul>

      {vista.souOwner && vista.membros.length > 0 ? (
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="doc-membro">CPF ou CNPJ de um membro</label>
          <div className={estilos.linhaForm}>
            <Selecao
              id="doc-membro"
              value={docMembro}
              onChange={(e) => setDocMembro(e.target.value)}
              disabled={pendente}
              aria-label="Membro"
            >
              <option value="">Escolha o membro</option>
              {vista.membros.map((m) => (
                <option key={m.id} value={m.id}>{m.nome ?? m.email ?? 'conta sem e-mail'}</option>
              ))}
            </Selecao>
            <Entrada
              id="doc-valor"
              value={docValor}
              onChange={(e) => setDocValor(e.target.value)}
              placeholder="000.000.000-00"
              autoComplete="off"
              disabled={pendente}
            />
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() => {
                if (!docMembro) return
                iniciar(async () => {
                  const r = await corrigirDocumento(docMembro, docValor)
                  aplicar(r)
                  if ('ok' in r) setDocValor('')
                })
              }}
            >
              Salvar documento
            </Botao>
          </div>
          <p className={estilos.ajuda}>
            É por este documento que as compras da Hotmart encontram a pessoa. Deixe em branco para
            apagar. Só o dono do espaço de trabalho corrige.
          </p>
        </div>
      ) : null}

      {vista.souOwner ? (
        <>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="convite-email">Convidar alguém</label>
            <div className={estilos.linhaForm}>
              <Entrada
                id="convite-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail da pessoa (opcional)"
                autoComplete="off"
                disabled={pendente}
              />
              <Selecao
                
                value={papel}
                onChange={(e) => setPapel(e.target.value as 'owner' | 'membro')}
                disabled={pendente}
                aria-label="Tipo de acesso"
              >
                <option value="membro">Membro</option>
                <option value="owner">Dono</option>
              </Selecao>
              <Botao variante="primario"
                carregando={pendente}
                onClick={() => iniciar(async () => aplicar(await gerarConvite(papel, email)))}
              >
                Gerar link
              </Botao>
            </div>
          </div>
          <p className={estilos.ajuda}>
            O e-mail é só para você lembrar de quem é o convite — nada é enviado por você
            daqui. Você copia o link e manda por onde preferir. <strong>Dono</strong> pode
            convidar e cancelar um convite que ainda não foi usado; <strong>membro</strong>
            não. Tirar deste espaço quem já entrou ainda não dá para fazer por aqui.
          </p>

          {vista.convitesAbertos.length > 0 ? (
            <>
              <p className={estilos.rotulo}>Convites em aberto</p>
              <ul className={estilos.lista}>
                {vista.convitesAbertos.map((c) => (
                  <li key={c.link} className={estilos.item}>
                    <span>
                      {c.email ?? 'sem e-mail'}{' '}
                      <span className={`${estilos.selo} ${estilos.selo_neutro}`}>
                        {c.papel === 'owner' ? 'dono' : 'membro'}
                      </span>
                    </span>
                    <span className={estilos.acoes}>
                      <Botao variante="fantasma" tamanho="pequeno" carregando={pendente} onClick={() => copiar(c.link)}>
                        {copiado === c.link ? (
                          <><Check size={14} strokeWidth={1.75} /> copiado</>
                        ) : (
                          <><Copy size={14} strokeWidth={1.75} /> copiar link</>
                        )}
                      </Botao>
                      <Botao variante="fantasma" tamanho="pequeno" tom="erro"
                        carregando={pendente}
                        onClick={() =>
                          iniciar(async () =>
                            aplicar(await cancelarConvite(c.link.replace('/convite/', ''))),
                          )
                        }
                      >
                        Cancelar
                      </Botao>
                    </span>
                  </li>
                ))}
              </ul>
              <p className={estilos.ajuda}>
                <strong>Trate o link como uma senha.</strong> Quem tiver ele entra neste
                espaço de trabalho. Ele vale por 7 dias, e some depois de usado — se mandou
                para a pessoa errada, cancele aqui.
              </p>
            </>
          ) : null}
        </>
      ) : null}

      {erro ? <p className={estilos.erro} role="alert">{erro}</p> : null}
    </section>
  )
}
