import type { TipoModelo } from '@/lib/email/tipos'

export interface Modelo {
  assunto: string
  html: string
}

function moldura(miolo: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;max-width:560px">',
    miolo,
    '<p style="color:#7b8794;font-size:13px">Esta mensagem foi enviada automaticamente. Não responda a este endereço.</p>',
    '</div>',
  ].join('')
}

function botao(url: string, rotulo: string): string {
  return `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1f2933;color:#ffffff;text-decoration:none;border-radius:6px">${rotulo}</a></p>`
}

export const PADROES: Record<TipoModelo, Modelo> = {
  boas_vindas: {
    assunto: 'Seu acesso está pronto, [MEMBER_NAME]',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua conta foi criada. Entre com o e-mail <strong>[MEMBER_EMAIL]</strong> e a senha temporária abaixo:</p>' +
        '<p style="font-size:20px;font-weight:600;letter-spacing:1px">[TEMP_PASSWORD]</p>' +
        '<p>Ela vale por 7 dias, e o sistema pedirá que você defina uma senha sua no primeiro acesso.</p>' +
        botao('[LOGIN_URL]', 'Entrar'),
    ),
  },
  recuperacao_senha: {
    assunto: 'Sua senha temporária',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Você pediu para recuperar o acesso. Use a senha temporária abaixo:</p>' +
        '<p style="font-size:20px;font-weight:600;letter-spacing:1px">[TEMP_PASSWORD]</p>' +
        '<p>Ela vale por 7 dias. Sua senha anterior continua funcionando, caso você se lembre dela.</p>' +
        botao('[LOGIN_URL]', 'Entrar'),
    ),
  },
  entrega_produto: {
    assunto: '[PRODUCT_NAME] liberado para você',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua compra de <strong>[OFFER_NAME]</strong> foi confirmada e <strong>[PRODUCT_NAME]</strong> já está liberado na sua conta.</p>' +
        '<p>Seu acesso vale até <strong>[EXPIRES_AT]</strong>.</p>' +
        botao('[TOOL_URL]', 'Abrir a ferramenta'),
    ),
  },
  pagamento_recebido: {
    assunto: 'Recebemos seu pagamento',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Recebemos o pagamento de <strong>[OFFER_NAME]</strong> no valor de <strong>[VALUE]</strong>.</p>' +
        '<p>Seu acesso a <strong>[PRODUCT_NAME]</strong> segue ativo até <strong>[EXPIRES_AT]</strong>.</p>' +
        '<p style="color:#7b8794;font-size:13px">Transação [TRANSACTION]</p>' +
        botao('[LOGIN_URL]', 'Acessar minha conta'),
    ),
  },
  degustacao_liberada: {
    assunto: 'Você ganhou [PRODUCT_NAME] de bônus',
    html: moldura(
      '<p>Olá [MEMBER_NAME],</p>' +
        '<p>Sua compra de <strong>[OFFER_NAME]</strong> liberou <strong>[PRODUCT_NAME]</strong> como bônus na sua conta.</p>' +
        '<p>Este acesso de degustação vale até <strong>[EXPIRES_AT]</strong>, e é independente dos outros produtos que você tenha.</p>' +
        botao('[TOOL_URL]', 'Abrir a ferramenta'),
    ),
  },
}
