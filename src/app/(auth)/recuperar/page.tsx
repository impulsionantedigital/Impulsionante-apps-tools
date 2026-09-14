import Link from 'next/link'
import { redirect } from 'next/navigation'
import MarcaLockup from '@/components/MarcaLockup'
import { lerMarca, tituloDaPagina } from '@/server/marca'
import { recuperarSenha } from '@/server/auth/temporaria'
import Botao from '@/components/ui/Botao'
import { Campo, Entrada } from '@/components/ui/Campo'
import SeletorTema from '@/components/ui/SeletorTema'
import { temaDaRequisicao } from '@/server/tema'
import estilos from '../auth.module.css'
import mov from '@/app/movimento.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Recuperar acesso') }
}

async function acaoRecuperar(formData: FormData): Promise<void> {
  'use server'
  await recuperarSenha(String(formData.get('email') ?? ''))
  // 🔴 Sempre a mesma resposta, exista a conta ou não: senão a tela diz quem é cliente.
  redirect('/recuperar?enviado=1')
}

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>
}) {
  const { enviado } = await searchParams
  const marca = await lerMarca()
  const tema = await temaDaRequisicao()

  return (
    <div className={estilos.tela}>
      <div className={`${estilos.card} ${mov.entra}`}>
        <div className={estilos.marca}>
          <MarcaLockup
            logo={marca.logo}
            nome={marca.nome}
            classeTile={estilos.tile}
            classeLogo={estilos.logo}
            tamanhoGlifo={20}
          />
          <b>{marca.nome}</b>
        </div>

        <h1 className={estilos.titulo}>Recuperar acesso</h1>

        {enviado ? (
          <p className={estilos.sub}>
            Se houver uma conta com esse e-mail, enviamos uma senha temporária. Ela vale 7 dias, e a
            sua senha atual continua funcionando.
          </p>
        ) : (
          <>
            <p className={estilos.sub}>Informe o e-mail da sua conta e enviamos uma senha temporária.</p>
            <form className={estilos.form} action={acaoRecuperar}>
              <Campo id="email" rotulo="E-mail">
                <Entrada name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" required />
              </Campo>
              <Botao variante="primario" larguraTotal type="submit" className={estilos.enviar}>
                Enviar senha temporária
              </Botao>
            </form>
          </>
        )}

        <p className={estilos.rodape}>
          <Link className={estilos.link} href="/entrar">
            Voltar para entrar
          </Link>
        </p>
      </div>

      <SeletorTema tema={tema} />
    </div>
  )
}
