# A fronteira servidor→cliente (RSC) — o defeito que derrubou a calculadora

**Data:** 14/09/2026 · **Estado:** corrigido no código, **ainda não publicado** · **Gravidade:** crítica

> Leia isto antes de mexer em qualquer componente da calculadora, ou em qualquer página que
> renderize um componente `'use client'`. A regra vale para o produto inteiro.

## 1. O sintoma

`/ferramentas/indulto-comutacao/novo` e `/ferramentas/indulto-comutacao/[id]` devolviam **HTTP 500**
em produção. A tela do navegador dizia apenas *"This page couldn't load — A server error occurred."*

Quer dizer: o comprador pagava, recebia a senha, entrava, via a ferramenta na lista — e ao clicar
para criar um cálculo batia num erro. **A ferramenta inteira era inalcançável.** Nada além dessas
duas rotas era afetado: login, e-mails, vendas e webhook sempre funcionaram.

## 2. A causa

`novo/page.tsx` e `[id]/page.tsx` são componentes de **servidor**. Os dois faziam:

```tsx
const motor = motorPadrao()          // objeto do registro de decretos
return <Calculadora motor={motor} /> // Calculadora é 'use client'
```

`MotorDecreto` (`src/lib/indulto-comutacao/tipos.ts`) não é só dado — ele declara um **método**:

```ts
export type MotorDecreto = {
  id: string
  questionario: Secao[]
  // ...
  calcular(entrada: Entrada): Resultado   // ← aqui
}
```

Tudo o que um componente de servidor passa como prop para um componente de cliente é
**serializado** no payload RSC. Função não serializa. O React aborta a requisição inteira:

```
Error: Functions cannot be passed directly to Client Components unless you explicitly
expose it by marking it with "use server". Or maybe you meant to call this function
rather than return it.
  {id: ..., ano: 2025, rotulo: ..., questionario: ..., calcular: function calcular}
                                                               ^^^^^^^^^^^^^^^^^
```

## 3. Por que ninguém pegou antes

Três redes falharam ao mesmo tempo, e é isso que torna o caso didático:

| Rede | Por que deixou passar |
|---|---|
| **TypeScript** | A prop era `motor: MotorDecreto` e o valor era um `MotorDecreto`. Tipo perfeito. O TS não tem noção de "serializável através da fronteira RSC" — isso não existe no sistema de tipos. |
| **`pnpm build`** | As duas páginas são **dinâmicas** (`estadoDoProduto` lê cookie). Página dinâmica não é pré-renderizada no build, então o erro não nasce ali — nasce **a cada requisição**. Uma página estática com o mesmo defeito faz o build falhar. |
| **Os 1529 testes** | Todos são de unidade, em Node, sem renderizar árvore React. O motor tinha cobertura excelente; a *fronteira* não tinha nenhuma. |

Ou seja: o defeito só aparecia executando a página com um usuário de verdade.

## 4. A correção

A `Calculadora` passou a receber **o id do decreto** e a resolver o motor ela mesma, pelo registro:

```tsx
// Calculadora.tsx ('use client')
const motor = useMemo(() => motorPorId(decretoId), [decretoId])
```

E as páginas passam só o id:

```tsx
<Calculadora decretoId={motor.id} />
```

Com isso o motor é importado pelo **bundle do cliente** — que é, aliás, o que o cálculo ao vivo
sempre exigiu. Nada além disso mudou: o questionário, o resultado e o motor são os mesmos.

## 5. Onde o cálculo roda, afinal — e o que se ganha e se perde

Roda **nos dois lados**, com papéis diferentes. Isto é desenho, não acidente:

- **No navegador**, a cada tecla, para a prévia. `calcular` é função pura e barata; não há rede.
- **No servidor**, ao salvar, `preparar()` (`preparar.ts`) **recalcula a partir da entrada** e grava
  o resultado dele. O cliente manda a entrada, **nunca o resultado**. Um cliente adulterado não
  consegue gravar um número inventado com aparência de auditoria.

**Ganhos:** resposta instantânea enquanto o advogado mexe nos campos; nenhum dado do sentenciado
sai do navegador até ele decidir salvar (minimização, LGPD — a própria tela promete isso); zero
custo de servidor por tecla.

**Perdas:** o código do motor vai no pacote JavaScript e pode ser lido por qualquer um que abra o
navegador. Como ele implementa um decreto público, o que se expõe é a *interpretação*, não um
segredo comercial. E quem está com o acesso vencido continua conseguindo **calcular** pelo console
— mas **não gravar**, porque a server action recusa (ver §9 do spec de vendas).

Antes da correção não havia escolha nenhuma: o motor não ia ao navegador **e** a página não abria.

## 6. A regra, em uma linha

> **O que atravessa de um componente de servidor para um `'use client'` tem de ser serializável:
> dado, nunca função.** Cliente→cliente pode tudo, porque aí não há serialização.

Por isso `BarraSalvar` e `Resultado` podem continuar recebendo `motor: MotorDecreto` — quem os
renderiza é a `Calculadora`, que já é cliente.

Se precisar mesmo passar comportamento para o cliente, o caminho é uma **server action**
(`'use server'`), que atravessa como referência, não como função.

## 7. A guarda que impede a volta

`tests/fronteira-rsc.spec.ts`, três verificações estáticas:

1. Nenhum componente de **servidor** passa, a um cliente, prop cujo tipo carregue função.
2. Nenhum componente de **servidor** passa função inline (`prop={() => ...}`) a um cliente.
3. A `Calculadora` resolve o motor pelo registro, e as duas páginas passam `decretoId={motor.id}`.

Cada uma foi provada por inversão: reintroduzindo o defeito, o teste falha; desfazendo, passa.

**Varredura do resto do código:** os 71 arquivos `.tsx` de servidor foram examinados. Os únicos
outros casos de função em prop são `AbasConfig.tsx:13` e `agentes/page.tsx:61`, e ambos passam para
`BarraDeAbas`, que é componente de **servidor** — não há fronteira, não há defeito. A calculadora
era o único caso real.

## 8. Como foi verificado

1. Reprodução isolada: rota descartável passando o motor real a um cliente → o mesmo erro, no build
   (estática) e por requisição (dinâmica, `HTTP 500`).
2. Depois da correção, a mesma rota → `HTTP 200`, sem erro no log.
3. Navegador de verdade contra o servidor local ligado ao banco de produção:
   - login com senha temporária → troca obrigatória → login com a senha nova;
   - `/ferramentas/indulto-comutacao/novo` abriu (antes: 500);
   - 6 anos de pena sem violência digitados → resumo recalculou **na hora, sem rede**
     (2160 dias; frações 432 / 540 / 720 / 1080);
   - "Salvar cálculo" gravou e abriu `/[id]`, a outra página que tinha o mesmo defeito;
   - a linha em `indulto_comutacao_calculos` trouxe `entrada.penaSemViolencia = 6 anos` e o
     `resultado.resumo` recalculado **pelo servidor**.
4. Console do navegador: zero erros.

## 9. O que falta

- **Publicar.** Em produção as duas rotas seguem devolvendo 500 até o merge no `main`.
- Reconferir `/novo` no domínio real depois do deploy.
