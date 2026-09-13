'use client'

import { useMemo, useState } from 'react'
import type { Entrada, MotorDecreto } from '@/lib/indulto-comutacao/tipos'
import { padraoDoCampo } from '@/lib/indulto-comutacao/padrao'
import Questionario from './Questionario'
import Resultado from './Resultado'
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
export default function Calculadora({
  motor,
  inicial,
}: {
  motor: MotorDecreto
  inicial?: Entrada
}) {
  const [entrada, setEntrada] = useState<Entrada>(() => inicial ?? entradaInicial(motor))

  // `calcular` é função pura e barata: roda no navegador a cada tecla, sem rede.
  // Nada sai daqui até o membro salvar.
  const resultado = useMemo(() => motor.calcular(entrada), [motor, entrada])

  const aoMudar = (chave: string, valor: Entrada[string]) =>
    setEntrada((atual) => ({ ...atual, [chave]: valor }))

  return (
    <div className={estilos.layout}>
      <div className={estilos.coluna}>
        <Questionario secoes={motor.questionario} entrada={entrada} aoMudar={aoMudar} />
      </div>
      <div className={estilos.coluna}>
        <Resultado motor={motor} resultado={resultado} />
      </div>
    </div>
  )
}
