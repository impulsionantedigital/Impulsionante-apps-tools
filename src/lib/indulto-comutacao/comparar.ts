// Compara dois resultados por ESTRUTURA, não por texto.
//
// 🔴 `calculo.resultado` vem de uma coluna `jsonb`. O Postgres NÃO preserva a
// ordem das chaves de um objeto em `jsonb` — ele guarda as chaves na ordem dele
// (as mais curtas primeiro), e é nessa ordem que voltam pela API. Um resultado
// recém-calculado pelo motor, por outro lado, tem as chaves na ordem em que o
// código as escreveu (`{ incisos, resumo, avisos }`). `JSON.stringify` compara
// TEXTO, então as duas ordens diferentes produzem strings diferentes mesmo
// quando os valores são idênticos — um alarme falso de "este cálculo mudou"
// bem no aviso criado para evitar erro em petição.
//
// Serve a TODOS os decretos: não há nada aqui específico de 2025.

/**
 * Normaliza um valor para comparação: faz o round-trip por JSON (o mesmo que
 * acontece ao gravar em `jsonb` — uma chave com valor `undefined` simplesmente
 * deixa de existir) e depois ordena as chaves de todo objeto, recursivamente.
 *
 * Arrays NÃO são reordenados: a ordem de `incisos`, por exemplo, tem
 * significado (é a ordem em que o motor os produz) e precisa continuar
 * contando na comparação.
 */
function normalizar(valor: unknown): unknown {
  // O round-trip por JSON descarta `undefined`, funções e símbolos do mesmo
  // jeito que gravar em `jsonb` descartaria — é a normalização que faz os dois
  // lados (o objeto do motor e o que veio do banco) partirem do mesmo formato.
  const semUndefined = JSON.parse(JSON.stringify(valor)) as unknown
  return ordenarChaves(semUndefined)
}

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves)
  if (valor !== null && typeof valor === 'object') {
    const chaves = Object.keys(valor as Record<string, unknown>).sort()
    const ordenado: Record<string, unknown> = {}
    for (const chave of chaves) {
      ordenado[chave] = ordenarChaves((valor as Record<string, unknown>)[chave])
    }
    return ordenado
  }
  return valor
}

/**
 * `true` quando os dois resultados são estruturalmente iguais — mesmas chaves,
 * mesmos valores, em qualquer profundidade, independentemente da ordem em que
 * as chaves de cada objeto vieram. A ordem dos ARRAYS continua importando.
 */
export function mesmoResultado(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}
