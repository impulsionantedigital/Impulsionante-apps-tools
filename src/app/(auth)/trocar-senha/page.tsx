import { redirect } from 'next/navigation'
import MarcaLockup from '@/components/MarcaLockup'
import { lerMarca, tituloDaPagina } from '@/server/marca'
import { exigirSessao } from '@/server/auth/sessao'
import { precisaTrocarSenha, trocarSenha } from '@/server/auth/temporaria'
import { SENHA_MINIMA } from '@/lib/auth/credenciais'
import CampoSenha from '../CampoSenha'
import Botao from '@/components/ui/Botao'
import SeletorTema from '@/components/ui/SeletorTema'
import { temaDaRequisicao } from '@/server/tema'
import estilos from '../auth.module.css'
import mov from '@/app/movimento.module.css'

export async function generateMetadata() {
  return { title: await tituloDaPagina('Definir senha') }
}

const MENSAGENS: Record<string, string> = {
  curta: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`,
  longa: 'A senha é longa demais.',
  diferente: 'As duas senhas não são iguais.',
  nao_autorizado: 'Esta troca não está disponível para a sua conta.',
  falha: 'Não foi possível definir a senha. Tente de novo.',
}

async function acaoTrocar(formData: FormData): Promise<void> {
  'use server'
  const r = await trocarSenha(formData.get('senha'), formData.get('confirmacao'))
  if ('erro' in r) redirect('/trocar-senha?erro=' + encodeURIComponent(r.erro))
  // As sessões foram todas encerradas: entra-se de novo, já com a senha nova.
  redirect('/entrar?definida=1')
}

export default async function TrocarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const user = await exigirSessao()
  if (!(await precisaTrocarSenha(user.id))) redirect('/painel')

  const { erro } = await searchParams
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

        <h1 className={estilos.titulo}>Defina a sua senha</h1>
        <p className={estilos.sub}>
          Você entrou com uma senha temporária. Escolha agora a senha que vai usar daqui em diante — depois de salvar, entre de novo com ela.
        </p>

        {erro && <p className={estilos.erro}>{MENSAGENS[erro] ?? MENSAGENS.falha}</p>}

        <form className={estilos.form} action={acaoTrocar}>
          <CampoSenha
            id="senha"
            name="senha"
            rotulo="Nova senha"
            autoComplete="new-password"
            placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
            minLength={SENHA_MINIMA}
            required
          />
          <CampoSenha
            id="confirmacao"
            name="confirmacao"
            rotulo="Repita a nova senha"
            autoComplete="new-password"
            minLength={SENHA_MINIMA}
            required
          />
          <Botao variante="primario" larguraTotal type="submit" className={estilos.enviar}>
            Salvar senha
          </Botao>
        </form>
      </div>

      <SeletorTema tema={tema} />
    </div>
  )
}
