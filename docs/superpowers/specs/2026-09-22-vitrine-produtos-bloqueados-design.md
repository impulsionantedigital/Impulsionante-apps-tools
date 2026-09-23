# Vitrine de produtos bloqueados — design

**Data:** 2026-09-22
**Estado:** aprovado, aguardando plano de implementação

## O problema

O sistema tem uma regra escrita: *"Não existe vitrine do que o membro não tem (§9.2)."* A página
`/ferramentas` e o `Rail` filtram fora todo produto no estado `nunca`, e a página do produto
redireciona para `/ferramentas` quem nunca teve acesso.

A consequência é que **quem compra um produto e entra no CRM não descobre que os outros existem**.
Quem compra só um produto externo (curso, produto físico — assunto da spec seguinte) entra numa
tela que diz "Nenhuma ferramenta liberada" e não tem nada para fazer.

A regra é invertida aqui de propósito: o catálogo passa a ser sempre visível, e o que muda com o
acesso é o que a pessoa **pode fazer**, não o que ela **vê**.

## O que muda para o membro

Todo produto interno aparece sempre — na vitrine `/ferramentas` e no menu lateral. Produto sem
acesso aparece com cadeado. Clicar abre a página do produto em leitura: sem botão de criar, sem
editar nada, com o aviso explicando a situação e convidando à compra.

O convite é diferente conforme a história da pessoa:

| Situação | Cadeado | Botão |
|---|---|---|
| Acesso ativo (comprado) | não | nenhum |
| Acesso ativo (degustação) | não | nenhum — o convite já fica dentro da página |
| Encerrado, nunca degustou | sim | **Renovar acesso** |
| Encerrado, já degustou | sim | **Assinar agora** |
| Nunca teve acesso | sim | **Assinar agora** |

A distinção entre "renovar" e "assinar" não é cosmética: quem só experimentou nunca pagou, e
mandar essa pessoa "renovar" descreve errado a relação dela com o produto. A informação já existe
em `detalhe.degustou`, então a distinção não custa consulta nenhuma.

O botão some quando o produto não tem `CHECKOUT_URL_<SLUG>` no ambiente — regra que já existe hoje
no `AvisoAcesso`: sem endereço de venda, melhor nenhum botão do que um botão para lugar nenhum. O
cadeado continua, porque ele descreve o acesso, não a oferta.

## Arquitetura

A regra é do domínio e mora em funções puras; as telas só desenham o que elas decidem. É a decisão
que `src/lib/vendas/aviso-acesso.ts` já tomou, e este trabalho a estende em vez de abrir uma
segunda forma de decidir.

### `src/lib/vendas/aviso-acesso.ts`

**`cartaoDaVitrine({ estado, detalhe, checkout })` — nova.** Devolve o que o card mostra:
se está bloqueado, o rótulo do botão e o endereço dele (`null` quando não há checkout
configurado, e aí o card sai só com cadeado). É a tabela acima, num lugar só, consumida pela
vitrine e pelo Rail.

**`AvisoAcesso` — ganha o caso `nuncaTeve`.** Hoje os tipos são
`nada | vencendo | trial | expirado | trialExpirado`. Falta o sexto porque ele era impossível: a
página redirecionava antes. `textoDoAviso` ganha o texto correspondente, com a ação
"Assinar agora".

### Telas

**`/ferramentas`** — remove o filtro `estado !== 'nunca'`. Cada card ganha cadeado e botão segundo
`cartaoDaVitrine`. O `EstadoVazio` "Nenhuma ferramenta liberada" sai: com o catálogo sempre
visível, ele vira inalcançável.

**`Rail`** — remove o mesmo filtro. Item sem acesso ganha cadeado, **sem** botão: o menu é estreito
e o convite mora na vitrine e na página do produto. A regra de o comprador só ver Ferramentas
continua como está.

**Página do produto (CIC, `[calculadora]/page.tsx`)** — sai o `redirect('/ferramentas')` do estado
`nunca`. A página abre em leitura: `ativo` já controla o botão "Novo cálculo", a lista de cálculos
vem vazia por construção (quem nunca teve acesso nunca criou nada), e o `AvisoAcesso` passa a ter
o que dizer.

**Página do produto (Detração)** — hoje ela **não tem gate nenhum e não mostra aviso**: exibe
"Novo Cálculo" para qualquer membro. Isso fica escondido porque o menu esconde o produto de quem
não tem acesso; a escrita em si já está protegida (`/novo` redireciona, `exigirEscrita` recusa na
server action). Com a vitrine, a página passa a ser alcançável por clique, e a inconsistência
apareceria como um botão que leva a um redirecionamento. Ela entra em paridade: lê
`estadoDoProduto`, esconde o botão fora do ativo e mostra o aviso.

**`AvisoAcesso` (componente)** — sobe da pasta do CIC para `src/components/`, recebendo o produto
por parâmetro, para as duas páginas usarem o mesmo. A alternativa seria duplicá-lo na pasta da
detração, e aí a regra de qual botão aparece passaria a existir em dois lugares.

## O que NÃO muda

**Nenhuma migration.** Tudo é leitura do que já existe: `vendas_periodos` via
`estadoEDetalheDoProduto`, e o checkout via ambiente.

**Nenhum gate de segurança.** `/novo` e `/[id]` já redirecionam fora do estado ativo, e
`exigirEscrita` recusa na server action com service-role. Abrir a tela de lista não abre buraco:
o gate de verdade nunca foi o esconder, e é isso que torna esta mudança segura de fazer só na
camada de desenho.

**O aviso de vencimento continua sem botão.** Quem ainda tem acesso renova na Hotmart, e um botão
ali competiria com o trabalho da pessoa.

## Testes

TDD, no padrão da suíte: a regra é fixada em `tests/vendas/aviso-acesso.spec.ts`, sem renderizar
tela.

**Novos:**
- `cartaoDaVitrine` nos cinco casos da tabela, mais checkout ausente → cadeado sem botão.
- `avisoDeAcesso('nunca')` → `{ tipo: 'nuncaTeve' }`, e `textoDoAviso` para ele.

**Um teste existente muda de propósito:**

```ts
it('sem acesso nenhum: não há o que avisar (a tela nem é alcançada)', () => {
  expect(aviso('nunca')).toEqual({ tipo: 'nada' })
})
```

A premissa "a tela nem é alcançada" deixa de valer — é justamente o que esta feature muda. Ele
passa a esperar `nuncaTeve`, com o comentário reescrito. Não é teste quebrado: é regra revista, e
a spec registra isso para ninguém "consertar" de volta.

**Conferir também:** `tests/vendas/acesso.spec.ts` e
`tests/detracao/recolhimento-noturno/contrato.spec.ts`, caso afirmem algo sobre o produto sumir
da vitrine.

**Verificação no navegador** (Playwright já configurado): membro sem acesso nenhum vê os produtos
com cadeado na vitrine e no menu, e a página do produto abre sem "Novo cálculo".

**Antes de commitar:** `pnpm build` e `pnpm run test` verdes (AGENTS.md, regra 2 — nunca `npm`).

## Próximo passo, fora desta spec

**Produtos externos.** Cadastro dinâmico de produtos que o CRM não entrega (cursos de outra área
de membros, produtos físicos), para poder vender um curso e dar calculadora de brinde na mesma
oferta. Já decidido no brainstorm de 2026-09-22, para a spec seguinte:

- O produto externo é só `{ nome, ativo }`. Preço e código continuam sendo fato da oferta e da
  venda — não se duplica o que a Hotmart já manda.
- Ele **gera período** normalmente, pela duração da oferta, mesmo sem ninguém consultar acesso: é
  o período que responde "esta venda está vigente?", e é dele que sai o dashboard futuro de
  renovação e churn.
- Ele **não** entra na vitrine nem no menu: não tem rota, tela nem entrega.
- Nasce um modelo de e-mail novo, **`degustacao_liberada`**, editável no card de modelos, com
  prazo próprio. Ele não pode ser o `entrega_produto`: aquele manda um único `EXPIRES_AT`, o
  vencimento mais tardio, e numa oferta mista o brinde de 7 dias morreria anunciado como se
  vencesse junto com a assinatura anual.
- Todo comprador continua recebendo conta e senha, mesmo comprando só produto externo — é esta
  vitrine que dá o que ele vê ao entrar.
