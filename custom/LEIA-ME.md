# `custom/` — a sua zona

Esta pasta é **sua**. Tudo que estiver aqui dentro é **preservado** quando o CRM atualiza:
a atualização substitui os arquivos do produto, mas nunca toca nesta pasta.

O resto da árvore é o contrário: qualquer arquivo do produto que você editar **será
sobrescrito** na próxima atualização, sem aviso. Se você precisa mudar algo, o caminho é
colocar a mudança aqui.

> ⚠️ **Este servidor tem uma exceção aberta e registrada.** Alterações em arquivos do produto
> foram feitas de propósito, com o custo conhecido. Antes de atualizar o CRM, leia
> [Divergências conscientes do produto](#-divergências-conscientes-do-produto-este-servidor)
> no fim deste arquivo — é a lista do que sai na atualização e precisa ser reaplicado.

## O que dá pra fazer aqui

| Pasta | O que você põe | O que acontece | Detalhes |
|---|---|---|---|
| `custom/migrations/` | `.sql` numerado de 9000 pra cima | tabelas suas, criadas no boot | abaixo |
| `custom/paginas/` | uma pasta com `pagina.tsx` | uma tela sua em `/x/<nome>` | [`paginas/LEIA-ME.md`](paginas/LEIA-ME.md) |
| `custom/slots/` | um arquivo por âncora | um bloco seu dentro de uma tela do CRM | [`slots/LEIA-ME.md`](slots/LEIA-ME.md) |
| `custom/api/` | um arquivo por endereço | um endereço em `/api/custom/<nome>` | [`api/LEIA-ME.md`](api/LEIA-ME.md) |
| `custom/tarefas/` | um arquivo por tarefa | código seu rodando de tempos em tempos | [`tarefas/LEIA-ME.md`](tarefas/LEIA-ME.md) |
| `custom/eventos/` | um arquivo com o nome do evento | código seu reagindo ao que acontece | [`eventos/LEIA-ME.md`](eventos/LEIA-ME.md) |
| `custom/menu.ts` | uma lista | suas telas no menu lateral | comentários no arquivo |

**Onde há alguém logado e onde não há.** Em tela (`paginas/`) e em bloco (`slots/`) existe
sessão: use `clienteDaSessao()` e o isolamento entre espaços de trabalho é automático. Em
`api/`, `tarefas/` e `eventos/` **não há ninguém logado** — lá o caminho é
`clienteSemIsolamento()`, e o filtro por espaço de trabalho passa a ser seu (ver o aviso no
fim deste arquivo).

**Três regras valem para as seis últimas:**

1. **Importe só de `@awave/custom`** (a lista completa está mais abaixo). O que está em
   `src/` é interno do produto e muda entre versões — o que você importar de lá funciona hoje
   e quebra depois de uma atualização, sem aviso.
2. **Erro ao RODAR fica contido.** Se a sua tela quebra durante o uso, ela mostra o erro e só
   ela: o resto do CRM, o boot e a atualização em 1 clique seguem funcionando.
   - ⚠️ **Erro de SINTAXE é diferente**, assim como importar um pacote que não existe: os dois
     impedem o servidor de **reconstruir**. O CRM continua no ar na versão que já estava — mas
     a próxima atualização fica parada em "aguardando" até você corrigir. A mensagem sai no log
     de build do painel (EasyPanel → Implantações), com arquivo e linha.
3. **O seu código não é conferido pelo compilador do produto** — erro de tipo aparece só
   quando a tela roda. **Confira antes de subir** e você não cai em nenhum dos dois casos
   acima; este comando lê só esta pasta:

   ```
   pnpm exec tsc -p custom --noEmit
   ```

   Seu editor também entende a pasta sozinho (há um `custom/tsconfig.json` aqui).

## Bibliotecas do npm

Crie um `package.json` **dentro desta pasta**, com as dependências que você usa:

```json
{ "dependencies": { "alguma-lib": "^1.0.0" } }
```

Elas são instaladas isoladamente quando o servidor reconstrói, e **não** mexem no
`package.json` do produto — que continua sendo arquivo que você não deve editar.

## O que você pode importar

```ts
// dado e sessão — em página, bloco e endereço
import { usarSessao, clienteDaSessao } from '@awave/custom'

// componentes visuais, pra sua tela ter a cara do CRM
import { CabecalhoPagina, KpiCard, ListCard, EstadoVazio, Pill, Esqueleto } from '@awave/custom/ui'

// SÓ onde não há ninguém logado (custom/api/, custom/tarefas/, custom/eventos/)
// — ver o aviso no fim deste arquivo
import { clienteSemIsolamento } from '@awave/custom/servidor'
```

Ícones aceitos em `custom/menu.ts`: `Wallet`, `FileText`, `Package`, `Truck`, `Receipt`,
`Users`, `Bot`, `Boxes`, `ClipboardList`, `Landmark`, `Sparkles`, `Puzzle`. Nome fora da
lista vira o ícone padrão, sem erro.

### Os limites do `custom/menu.ts` — e o que acontece quando você passa deles

Um item fora destes limites **é recusado sem erro na tela e sem linha no log**. Se um item seu
não apareceu no menu, **confira esta tabela antes de procurar em qualquer outro lugar**.

| Regra | Passando dela |
|---|---|
| No máximo **10 itens** | do 11º **válido** em diante, o resto **não aparece** (entradas recusadas não gastam a cota) |
| `titulo` até **40 caracteres**, e não vazio | o item **some inteiro** — não é cortado |
| `caminho` até **200 caracteres**, e não vazio | o item **some inteiro** |
| `caminho` na forma `/x/nome` (veja abaixo) | o item **some inteiro** |
| `grupo` até **24 caracteres** | vira **"Personalizado"** (o item continua aparecendo) |
| `icone` da lista acima | vira o **ícone padrão** (o item continua aparecendo) |

As duas últimas linhas **degradam**; as quatro primeiras fazem o item **sumir**. Campo ausente
ou em branco conta como inválido — não é só sobre passar do tamanho.

**A forma do `caminho`** é a mesma que a pasta em `custom/paginas/` aceita:

- começa com `/x/`;
- só **letras minúsculas, números e hífen**, e o hífen nunca na ponta;
- no máximo **3 níveis** depois do `/x/`.

Estes todos são recusados, e é o tropeço mais comum: `/x/Financeiro` (maiúscula),
`/x/relatórios` (acento), `/x/meu_modulo` (sublinhado), `/x/meu modulo` (espaço),
`/x/financeiro-` (hífen na ponta), `/x/a/b/c/d` (fundo demais). O que funciona é
`/x/financeiro`, `/x/nota-fiscal`, `/x/estoque/entradas`.

## `custom/migrations/` — tabelas suas no mesmo banco

Coloque aqui arquivos `.sql` para criar tabelas ou colunas próprias. Eles rodam junto com
as atualizações oficiais do banco, no boot, automaticamente.

**A numeração é obrigatória e começa em 9000.** Nome no formato `9001_o_que_faz.sql`:

```
custom/migrations/9001_tabela_de_contratos.sql
custom/migrations/9002_campo_no_contrato.sql
```

As migrations oficiais do CRM ficam **abaixo** de 9000 e as suas de 9000 pra cima. Os dois
intervalos não se encostam, então uma atualização do produto nunca colide com um número
que você já usou. Um arquivo fora da faixa **impede o boot** com uma mensagem dizendo o
nome do arquivo — de propósito: é melhor não subir do que aplicar na ordem errada.

## ⚠️ Se a sua tabela guarda dado de cliente, ela PRECISA de RLS

O Awave CRM é **multi-inquilino**: um mesmo servidor hospeda vários espaços de trabalho, e
o isolamento entre eles é feito no banco, não no código. Uma tabela criada sem essas três
linhas fica **legível por qualquer espaço de trabalho** — e por qualquer pessoa com a chave
pública do seu Supabase.

Modelo seguro para copiar:

```sql
create table if not exists public.meus_contratos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  titulo text not null,
  criado_em timestamptz not null default now()
);

-- As duas linhas que fazem o isolamento de LEITURA. Não pule.
alter table public.meus_contratos enable row level security;

create policy meus_contratos_sel on public.meus_contratos
  for select to authenticated using (public.e_membro(workspace_id));
```

Sem `workspace_id`, sem `enable row level security` e sem a policy, o dado de um cliente
seu aparece para outro. Não há aviso quando isso acontece.

🔴 **Não crie policy de escrita para `authenticated`** (nada de `for all` nem `for insert` /
`for update` / `for delete` na sua tabela). A partir da tela de Conversas, o CRM traz cliente
Supabase pro NAVEGADOR (Realtime) — e o Postgres não tem como distinguir "o servidor agindo em
nome do usuário" de "o usuário agindo pelo console do navegador direto": é o mesmo JWT. Uma
policy `for all` autoriza as duas, e a segunda pula sua rota, sua validação e qualquer regra
que você tenha escrito em código. Escreva pelas suas rotas em `custom/api/`, que rodam no
servidor e usam `clienteSemIsolamento()` — service-role, que não passa pela RLS e por isso
nunca precisa de policy de escrita.

## ⚠️ `clienteSemIsolamento()` — leia antes de usar

Ele devolve um acesso ao banco que **ignora o isolamento entre espaços de trabalho**. Existe
pelos três lugares onde não há ninguém logado: um endereço em `custom/api/` chamado por um
sistema de fora, e as `custom/tarefas/` e `custom/eventos/`, que rodam no relógio do servidor.
Sem sessão, o banco não tem como saber de quem é o dado.

Sob ele, o filtro é responsabilidade sua:

```ts
const db = clienteSemIsolamento()

// ERRADO — devolve os contratos de TODOS os clientes hospedados neste servidor
await db.from('meus_contratos').select()

// CERTO
await db.from('meus_contratos').select().eq('workspace_id', MEU_WORKSPACE)
```

Em página e em bloco existe sessão, então use `clienteDaSessao()`: lá o isolamento é
automático e você não precisa lembrar de nada. Por isso `clienteSemIsolamento` **nem é
exportado** por `@awave/custom` — só por `@awave/custom/servidor`.

## 🔴 Divergências conscientes do produto (este servidor)

O CRM foi feito para ser **atualizável em 1 clique**: a atualização substitui os arquivos do
produto e preserva esta pasta. As mudanças listadas abaixo **saíram desse contrato de propósito**
— foram edições em arquivos do produto, feitas com o custo conhecido. Leia esta seção antes de
atualizar o CRM.

### O que foi alterado fora de `custom/`

| Arquivo do produto | O que mudou | Por quê |
|---|---|---|
| `supabase/migrations/0069_oferta_degustacao.sql` | coluna `dias_degustacao` em `ofertas` e `vendas` | oferta de degustação: o prazo vem de um número de dias, não de um nome de duração |
| `supabase/migrations/0070_ofertas_filhas_e_origem_do_periodo.sql` | tabela `ofertas_filhas`; coluna `origem` em `vendas_periodos` | vínculo de brinde entre ofertas; e o que permite responder "este acesso é trial?" sem perguntar à oferta |
| `src/lib/vendas/degustacao.ts` | arquivo novo | regra da degustação: prazos fixos (7 e 15), leitura do par do seletor, recusa de valor fora da lista |
| `src/lib/vendas/periodos.ts` | `periodosDeBrinde()`; `Prazo = Duracao \| number`; `origem` no período | o brinde nasce na data da concessão e não empilha |
| `src/lib/vendas/acesso.ts` | `detalheDeAcesso()` — campo `trial` **ao lado** do estado | trial é rótulo, não permissão (ver abaixo) |
| `src/server/vendas/processar.ts` | guarda de oferta de degustação; `concederBrindes()`; `garantirPeriodos` completa o que falta | processar as ofertas filhas e não perder brinde em reenvio |
| `src/server/vendas/acesso.ts` | `estadoEDetalheDoProduto()` | leva o rótulo de trial até a tela do membro |
| `src/app/(app)/config/acoes-comercial.ts` | vínculo de filhas, com as três recusas; gravação do tempo de acesso | é onde a oferta principal escolhe os brindes, e onde a degustação é gravada sem tocar no domínio de `duracao` |
| `src/app/(app)/config/ComercialCard.tsx` | seleção de ofertas filhas; seletor de tempo de acesso | tela do admin |
| `src/app/(app)/ferramentas/page.tsx` | mostra "Degustação — N dia(s) restante(s)" | o membro enxerga que o acesso é trial |
| `src/app/(app)/ferramentas/[calculadora]/AvisoAcesso.tsx` | **arquivo novo** | o aviso de vencimento/degust/a/expirado no topo da tela do produto |
| `src/app/(app)/ferramentas/[calculadora]/Calculadora.tsx` | removido o bloco "Acesso encerrado" | passou a ser o `AvisoAcesso`, que é a versão completa (tem prazo, trial e botão) |
| `src/lib/vendas/aviso-acesso.ts` | **arquivo novo** | qual recado sai em cada situação, e o texto de cada um |
| `src/lib/produtos/catalogo.ts` | `checkoutDoProduto` + `nomeDaVariavelDeCheckout` | o endereço de venda vem do ambiente, por produto |
| `.env.example` | bloco `CHECKOUT_URL_*` | as variáveis que você configura no painel |

### As variáveis de ambiente que este fork acrescentou
Um endereço de venda (checkout) por produto, para o botão do aviso de acesso. **Todas opcionais:**

| Variável | Produto |
|---|---|
| `CHECKOUT_URL_CIC_2025` | Calculadora de Indulto e Comutação — Decreto 12.970/2025 |
| `CHECKOUT_URL_CIC_2024` | Calculadora de Indulto e Comutação — Decreto 12.338/2024 |
| `CHECKOUT_URL_RECOLHIMENTO_NOTURNO` | Detração por Recolhimento Noturno |

A regra do nome: `CHECKOUT_URL_` + o **slug** da rota, em maiúsculas, com o hífen trocado por
sublinhado (nome de variável de ambiente não aceita hífen). Ao criar um produto novo no catálogo,
o nome da variável dele sai daí — e o teste `tests/produtos/checkout.spec.ts` cobra que todo slug
gere um nome válido e único.

🔴 **NÃO use o prefixo `NEXT_PUBLIC_`.** Ele é embutido no bundle em tempo de **build**; como o CRM
roda em Docker, o valor do painel só entraria no bundle se estivesse presente durante o `pnpm build`
dentro da imagem — trocar o link no painel **não** mudaria nada. Sem o prefixo, a variável é lida em
tempo de execução, e trocar o link vale com um restart, sem reconstruir a imagem.

**Se a variável não existe ou está em branco, o botão NÃO aparece** — o aviso sai só com o texto. É
de propósito: melhor não oferecer botão do que mandar o membro a um endereço que não existe.

> ✅ **As três já estão configuradas no EasyPanel.** Como a leitura é em runtime, o que for
trocado lá vale com um **restart do serviço** — sem reconstruir a imagem. E atenção: se o valor for
definido e o container **não** for reiniciado, o botão continua ausente **sem erro nenhum** (é
o mesmo sintoma de "variável não configurada").

### O seletor "Tempo de acesso" da oferta

Na tela **Configurações → Comercial → Ofertas**, o seletor tem estes valores:

```
Semanal · Quinzenal · Mensal · Trimestral · Semestral · Anual · Vitalício
Degustação — 7 dias
Degustação — 15 dias
```

A degustação é uma **oferta marcada com número de dias**, e não um prazo digitado: não existe
campo de texto, e os prazos são uma **lista fechada** (7 e 15 dias), em `PRAZOS_DE_DEGUSTACAO`.
Acrescentar um prazo novo é acrescentar um item naquela lista — o seletor, a gravação e os testes
acompanham sozinhos.

Uma oferta de degustação **nunca recebe venda**: o código dela é escolhido à mão e não existe na
Hotmart. Ela serve para ser **filha** de uma oferta que vende, concedendo os produtos dela como
brinde (ver a seção de regras de negócio).

### As mensagens que o membro vê, e quando

Na tela de cada produto, no topo. A regra vive em `src/lib/vendas/aviso-acesso.ts` e está fixada em
`tests/vendas/aviso-acesso.spec.ts` — 23 testes cobrem as cinco situações.

| Situação | Mensagem | Botão de checkout |
|---|---|---|
| Acesso comprado, faltando mais de 7 dias | **nada** — a tela fica limpa | — |
| Acesso comprado, faltando até 7 dias | Lembrete: cartão ativo / Pix antes do vencimento / renovar na Hotmart | — |
| Acesso em degustação (sempre, desde o 1º dia) | "Você recebeu acesso Bônus… degustação de N dia(s)… escolha um dos planos disponíveis" | **sim** |
| Acesso comprado que expirou | "Seu acesso expirou" + cálculos guardados | **sim** |
| Degustação que expirou | "Sua degustação terminou" + convite a assinar | **sim** |

O limiar de 7 dias (`DIAS_DE_AVISO_DE_VENCIMENTO`) **não se aplica ao trial**, que avisa desde o
primeiro dia: o prazo dele é curto por definição, e "faltam 7 dias" num trial de 3 nunca apareceria.

🔴 **O aviso de vencimento NÃO leva botão**, de propósito: quem ainda tem acesso renova na Hotmart
por conta própria, e um botão ali competiria com o trabalho da pessoa. O botão é para quem **perdeu**
o acesso ou está experimentando — aí é conversão, e não renovação.

### O que isso custa, na prática
- **A atualização em 1 clique passa a avisar divergência** nesses arquivos, e no próximo update
  eles voltam à versão do produto — a mudança some, e sobra só o backup no branch
  `awave-backup/pre-<versão>`.
- **Não é mais customização: é fork.** Atualizar o CRM exige, a partir de agora, reaplicar estas
  mudanças à mão (ou apontar o git para este repositório e assumir a manutenção do merge).
- **As migrations 0069 e 0070 precisam rodar ANTES do código novo.** O insert de `vendas_periodos`
  passou a mandar a coluna `origem`, e o de `ofertas` manda `dias_degustacao`; com o banco antigo e o
  código novo, os dois falham por coluna desconhecida.

> ✅ **Estado verificado neste servidor** (consulta direta ao banco): as migrations **0069 e 0070
> estão aplicadas**, as colunas `dias_degustacao` (em `ofertas` e `vendas`) e `origem` (em
> `vendas_periodos`) existem, e a tabela `ofertas_filhas` existe. Não há pendência de banco.
> Se um dia surgir erro de coluna inexistente (`42703`), o CRM agora diz isso na tela — antes a
> mensagem era genérica e mandava procurar o problema no lugar errado.

### As regras de negócio que não estão em `custom/`

Se algum dia estas mudanças forem promovidas para `custom/`, é isto que precisa sobreviver:

1. **A degustação nunca vende.** O código de uma oferta de degustação é escolhido à mão e **não
   existe na Hotmart**. Se uma compra chegar com ele, ela é recusada (`oferta_de_degustacao_sem_venda`),
   e não vira venda.
2. **Uma transação = uma venda.** As ofertas filhas **não** criam venda própria; elas só
   contribuem com períodos de acesso. Quem manda nisso é o índice único
   `vendas_plataforma_transacao_key`.
3. **O brinde nunca renova nem empilha.** A concessão é por **membro e produto**, não por
   transação: como a Hotmart manda uma transação nova a cada ciclo de assinatura, o filtro por
   transação concederia o brinde de novo a cada pagamento. Quem quiser um segundo período de
   degustação cria **outra** oferta filha.
4. **O brinde nasce na data da concessão**, e não na data da compra. É a única concessão do
   sistema que não é retroativa — as demais nascem na data da venda, "como se o produto sempre
   tivesse feito parte da compra".
5. **`trial` é um campo ao lado do estado, e nunca um valor dentro dele.** Se `'trial'` virasse um
   quarto valor de `EstadoAcesso`, os pontos que hoje perguntam `=== 'ativo'` passariam a recusá-lo,
   e **o membro em degustação não conseguiria criar nem editar cálculo** — a tela apareceria e a
   gravação seria recusada, sem erro visível.
6. **Produto do brinde não pode ser produto que a principal já vende.** As duas linhas brigariam na
   chave `(venda, produto)` e o brinde sumiria em silêncio.
7. **Profundidade de vínculo é 1.** Filha de filha nunca seria percorrida: a concessão lê um nível
   só, e o resto desapareceria sem erro.
8. 🔴 **A degustação NÃO grava `'degustacao'` na coluna `ofertas.duracao`.** Aquela coluna tem o
   CHECK `ofertas_duracao_dominio_check`, que aceita **só os sete nomes** — o banco recusa qualquer
   outro valor com `23514`, e a oferta não salva. Quem identifica a degustação é **`dias_degustacao`,
   e só ele**: `duracao` guarda `'mensal'` (o prazo de reserva, que volta a valer se a degustação for
   desligada), e `duracaoDaOferta` lê os **dias primeiro**. Gravar `'degustacao'` ali, ou procurar a
   degustação no nome, quebra toda oferta de trial com uma mensagem genérica de falha ao salvar.
   > A migration 0069 **não** alarga aquele domínio, de propósito: alargar trocaria uma restrição do
   > produto por uma linha de código, e o produto derruba essa restrição na próxima atualização
   > (com aviso no log). Guardar os dias é suficiente e não depende disso.

### Como diagnosticar um erro neste fork

A mensagem genérica que o CRM mostra em caso de falha **não diz a causa** — o log do container diz.
Os prefixos de log que este fork acrescentou:

| No log | Significa |
|---|---|
| `[comercial] salvar oferta falhou:` | insert/update de oferta recusado pelo banco; o `code` do Postgres vem junto |
| `[comercial] oferta recusada por coluna inexistente:` | `42703` — o banco está sem uma coluna de migration |
| `[comercial] gravar vínculos falhou:` / `limpar vínculos falhou:` | erro em `ofertas_filhas` |
| `[migrate] Aplicando <arquivo>…` | migration aplicada neste boot |
| `[migrate] Nenhuma migration pendente.` | banco em dia |

Códigos do Postgres que valem conhecer, porque cada um tem uma causa diferente:

- **`23505`** — chave duplicada (código de oferta já cadastrado).
- **`23514`** — violou um CHECK. Foi a causa de "não consegui salvar a oferta de trial": a coluna
  `ofertas.duracao` recusa qualquer valor fora dos sete nomes (ver a regra 8 abaixo).
- **`42703`** — coluna inexistente: migration não aplicada.

> **Antes de supor, consulte o banco.** Cinco minutos de consulta direta (`select` nas colunas e nas
> migrations aplicadas) valem mais que qualquer teoria: no defeito da regra 8, três ciclos de deploy
> foram gastos em teorias de banco atrasado quando as migrations **estavam** aplicadas, e a causa real
> era uma restrição que o próprio CRM não conseguia satisfazer.

## O que NÃO fazer aqui
- **Não apague esta pasta.** Sem ela, o CRM ainda sobe, mas você perde a zona protegida.
- **Não coloque segredo em arquivo.** Chaves e senhas ficam nas variáveis de ambiente do
  painel, nunca no repositório.
- **Não use números abaixo de 9000** em `custom/migrations`.
- **Não aponte um item do menu para fora de `/x/`.** Ele é ignorado: o menu do CRM não se
  reorganiza a partir daqui.
