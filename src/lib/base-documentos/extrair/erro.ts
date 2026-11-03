/** Falha ao extrair um arquivo; a mensagem é o motivo em português, mostrado na tela. */
export class ErroDeExtracao extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroDeExtracao'
  }
}
