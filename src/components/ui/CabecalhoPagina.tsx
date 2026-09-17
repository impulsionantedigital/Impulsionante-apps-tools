import estilos from './CabecalhoPagina.module.css'


export default function CabecalhoPagina({
  titulo, subtitulo, acoes, acima, className,
}: {
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
  acima?: React.ReactNode
  /** Classe extra do CHAMADOR, para a tela ajustar o cabeçalho sem mexer neste kit.
   *
   * Existe por causa da calculadora de indulto, que precisa (a) esconder o título do
   * cálculo na IMPRESSÃO — é o nome que o membro deu ao registro, não informação do
   * caso — e (b) igualar o corpo do subtítulo ao do título. As duas coisas são decisão
   * daQUELA tela; no kit, seriam decisão de TODAS, e nenhuma outra tela as pediu.
   *
   * Opcional e no fim da lista: nenhuma chamada existente muda. */
  className?: string
}) {
  return (
    <header className={`${estilos.cabecalho}${className ? ` ${className}` : ''}`}>
      {acima}
      <div className={estilos.linha}>
        <div className={estilos.textos}>
          <h1 className={estilos.titulo}>{titulo}</h1>
          {subtitulo ? <p className={estilos.sub}>{subtitulo}</p> : null}
        </div>
        {acoes ? <div className={estilos.acoes}>{acoes}</div> : null}
      </div>
    </header>
  )
}
