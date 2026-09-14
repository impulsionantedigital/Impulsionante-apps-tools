'use client'

import { useMemo, useState } from 'react'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import { padraoDoCampo } from '@/lib/indulto-comutacao/padrao'
import { motorPorId } from '@/lib/indulto-comutacao/registro'
import Questionario from './Questionario'
import Resultado from './Resultado'
import BarraSalvar from './BarraSalvar'
import BotaoImprimir from './BotaoImprimir'
import estilos from './calculadora.module.css'

/**
 * A entrada em branco de um motor: os campos de seleção que declaram `padrao`
 * já nascem preenchidos.
 *
 * 🔴 É daqui que vêm os dois SIM dos requisitos da data do fato. Sem eles, todo
 * cálculo começaria vetado e o advogado não teria como saber por quê.
 */
export function entradaInicial(motor: MotorDecreto): Entrada {
  const entrada: Entrada = {}
  for (const secao of motor.questionario) {
    for (const campo of secao.campos) {
      if (campo.tipo === 'selecao') entrada[campo.chave] = padraoDoCampo(campo)
      else if (campo.tipo === 'tempo') entrada[campo.chave] = { anos: 0, meses: 0, dias: 0 }
    }
  }
  return entrada
}

// 🔴 Serve a TODOS os decretos, como o Resultado que compõe: nada de
// `motores/2025/` importado aqui. Quem decide o questionário é o `motor`.
//
// 🔴 RECEBE O `decretoId`, NUNCA O MOTOR. Parece um rodeio — a página do
// servidor já tem o motor na mão — mas não é: `MotorDecreto` carrega o método
// `calcular`, e função não atravessa a fronteira servidor→cliente. O React
// recusa a prop inteira ao serializar e a página devolve 500:
//
//     Functions cannot be passed directly to Client Components
//     {id: ..., questionario: ..., calcular: function calcular}
//
// Foi exatamente esse o defeito que derrubou `/novo` e `/[id]` em produção
// (ver `docs/calculadora-indulto-comutacao/fronteira-rsc.md`). Resolvendo o id aqui, o motor é
// importado pelo BUNDLE DO CLIENTE, que é o que o cálculo ao vivo exige de
// qualquer forma.
export default function Calculadora({
  decretoId,
  inicial,
  calculoId,
  tituloInicial,
  somenteLeitura = false,
}: {
  /** Id do decreto no registro (`motor.id`), não o motor. Ver o comentário acima. */
  decretoId: string
  inicial?: Entrada
  calculoId?: string
  tituloInicial?: string
  /** Acesso encerrado: vê o cálculo, não salva. A ação no servidor recusa de qualquer forma. */
  somenteLeitura?: boolean
}) {
  // O registro é o mesmo dos dois lados; quem chega aqui já teve o id validado
  // pela página do servidor, que devolve 404 para decreto desconhecido.
  const motor: MotorDecreto | null = useMemo(() => motorPorId(decretoId), [decretoId])

  const [entrada, setEntrada] = useState<Entrada>(() =>
    inicial ?? (motor ? entradaInicial(motor) : {}),
  )

  // `calcular` é função pura e barata: roda no navegador a cada tecla, sem rede.
  // Nada sai daqui até o membro salvar.
  const resultado = useMemo(() => (motor ? motor.calcular(entrada) : null), [motor, entrada])

  const aoMudar = (chave: string, valor: Entrada[string]) => {
    if (somenteLeitura) return
    setEntrada((atual) => ({ ...atual, [chave]: valor }))
  }

  // Depois dos hooks, sempre — a ordem deles não pode depender do motor.
  if (!motor || !resultado) {
    return (
      <div className={estilos.avisoVersao} role="alert">
        <b>Decreto indisponível.</b> Esta calculadora não conhece o decreto <code>{decretoId}</code>.
      </div>
    )
  }

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <Questionario secoes={motor.questionario} entrada={entrada} aoMudar={aoMudar} desabilitado={somenteLeitura} />
      </div>
      <div className={estilos.coluna}>
        {somenteLeitura ? (
          <div className={estilos.avisoVersao} role="status">
            <b>Acesso encerrado.</b> Você pode consultar e excluir os seus cálculos, mas criar e
            editar exige renovar o acesso.
          </div>
        ) : (
          <BarraSalvar
            motor={motor}
            entrada={entrada}
            calculoId={calculoId}
            tituloInicial={tituloInicial}
          />
        )}
        {/* Depois da barra e antes do resultado: é o resultado que vai para o papel. Vale
            também com o acesso encerrado — por isso não depende de `somenteLeitura`. */}
        <BotaoImprimir />
        <Resultado motor={motor} resultado={resultado} />
      </div>
    </div>
  )
}
