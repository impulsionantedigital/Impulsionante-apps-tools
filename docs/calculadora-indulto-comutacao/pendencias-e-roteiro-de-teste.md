# Pendências para a revisão final da branch

Tudo que ficou deferido ou fora de escopo durante as tarefas, com a origem. A revisão final decide o
que precisa ser corrigido antes do merge. As **decisões do usuário** estão separadas no fim: elas não
são defeito de código e não devem ser "corrigidas" pela revisão.

## Minors deferidos

| Task | Onde | O quê | Por que ficou |
|---|---|---|---|
| 2 | `tipos.ts` | `quantum` e `penaApos` não são co-obrigatórios no tipo; o motor nunca produz um sem o outro | união discriminada seria complicar o contrato antes da UI precisar |
| 2 | `tipos.ts` | reexport de `Tempo` em uma linha em vez de duas | estilístico, documentado |
| 4 | `questionario.ts` | o rótulo de `justicaRestaurativa` é o único do arquivo que não é cópia literal: a cláusula da Res. CNJ 225/2016 foi para `ajuda`. Falta um comentário avisando quem revisar juridicamente | documentação, sem efeito em código |
| 5 | `incisos.ts` | o comentário de topo diz que `temRegraEspecial` é false "onde o engine escreve 'Sem previsão'" — impreciso para os 5 de comutação, onde o engine não escreve nada | cosmético |
| 6 | `tests/indulto-comutacao/_oraculo.ts` + `paridade-engine.spec.ts` | `divergencia()` e as asserções do spec de cenários são duas implementações do mesmo contrato de comparação | equivalentes hoje; ponto latente de divergência futura |

## Observações fora de escopo das revisões

| Task | Onde | O quê |
|---|---|---|
| 6 | `motor.ts` | comentários herdados imprecisos do `engine.js`: Inciso XII diz "1/5/1/4?" (o código é 1/6 / 1/5); Art. 11 III diz "1/2" (é o tamanho da comutação; a fração exigida é 1/5). Preservados de propósito — se corrigir, corrigir nos dois |
| 6 | `paridade-engine.spec.ts` | o `resumo` é comparado já formatado por `fmtDias` (o original só expõe string); diferença menor que o arredondamento passaria. Risco teórico: as expressões são idênticas |
| 7 | `motor-2025.spec.ts` | fora dos cenários de fronteira, a tolerância de 1 dia esconde mudança de regra menor que um dia; inerente ao desenho |
| 10 | `preparar.ts` / `acoes.ts` | o filtro é por chave, não por forma nem tamanho do valor: `observacoes` sem limite de tamanho; array ou objeto sob chave válida é gravado se o motor não lançar; BigInt passa pelo `preparar` e só falha no insert, virando a frase genérica "não consegui concluir" |
| 10 | `src/server/auth/workspace-ativo.ts:28` | `resolverWorkspaceAtivo` lança o erro cru do banco, sem `detalheSeguro`; `lerCalculo` e as actions passam por ele. Helper compartilhado do produto; mesmo padrão de `negocios/actions.ts` |
| 10 | `preparar.ts` | o log do `catch` inclui a pilha do erro do motor; os erros do V8 vistos não carregam o valor digitado, mas nada garante isso para um motor futuro |
| 10 | `tests/indulto-comutacao/preparar.spec.ts` | para um motor sem `validacao/<ano>/cenarios.json`, o bloco (c) cai de 21 cenários para 2 casos (`entradaInicial` e entrada vazia). Ao cadastrar o motor de 2026, os cenários de validação dele precisam entrar junto para manter a força |
| 10 | `acoes.ts` | `NAO_ACHOU` ("não existe ou não está na sua conta") é reaproveitada para input malformado em `atualizarCalculo` — mistura "não achei o registro" com "chamada malformada". Cosmético |
| — | `package.json` | `pnpm check:motor`, `gen:manifest` e `audit:entrega` apontam para scripts ausentes em `scripts/` (pré-existente, do Awave CRM original) |
| — | plano | o CSS das Tasks 9, 11 e 12 no plano ainda usa `var(--borda, #hex)`; a correção foi feita pelos contextos (R26), não no plano. O plano ficou como registro desatualizado |

| 11 | `BarraSalvar.tsx`, `ExcluirCalculo.tsx` | janela de duplo clique antes de `pendente` virar `true` pode dobrar a chamada da action — mesmo padrão de `Board.tsx` e `_crm/BotaoExcluir.tsx`, herdado do produto |
| 11 | `Calculadora.tsx:42`, `BarraSalvar.tsx:34` | `useState` não ressincroniza após `router.refresh`; inofensivo no caminho normal, mas uma chave descartada pelo `preparar` continuaria visível no formulário até recarregar |

| 11 | `src/lib/indulto-comutacao/comparar.ts` | `mesmoResultado(undefined, x)` **lança** (`JSON.parse` de `undefined`) em vez de devolver booleano. Inalcançável hoje (coluna `not null`, motor sempre devolve objeto), mas a função é pública e compartilhada. Guard sugerido: `if (a === undefined \|\| b === undefined) return a === b` |
| 11 | `tests/indulto-comutacao/comparar.spec.ts` | o "caso real" simula a ordem do `jsonb` com `localeCompare`, não com comparação por byte como o Postgres. Coincide para as chaves ASCII atuais; um motor futuro com chaves acentuadas poderia deixar a simulação de gerar ordem diferente (a asserção de sanidade do próprio teste mitiga) |

| 12 | `src/app/(app)/ferramentas/ferramentas.module.css` | terceira cópia declarada do bloco `.destino`/`.destinos` (as outras em `config.module.css` e `agentes.module.css`). Mitigado pelo comentário "mexeu numa, confira as outras duas"; num quarto hub, extrair para componente compartilhado |
| 12 | `ferramentas.module.css` | na cópia, `.destino:focus-visible` ficou logo após `:hover`; na origem está num seletor combinado distante. Sem efeito funcional |

### Observação sobre o produto, fora desta branch

A revisão da Task 11 achou o mesmo padrão de `JSON.stringify` para comparar igualdade com dado que pode vir de
`jsonb`, em código do Awave CRM que **já existia antes desta branch** e não foi tocado:
- `src/app/(app)/_crm/CamposCustomizados.tsx:37` — `JSON.stringify(rascunho) !== JSON.stringify(campos)`: o
  formulário de campos customizados pode se marcar como "com alteração" sem alteração real;
- `src/server/automacao/planejador.ts:183` — `campoMudou`: se o campo customizado for objeto ou array, uma
  automação de "campo mudou" pode disparar sem mudança real.

Não é defeito desta feature. Vai ao usuário como informação sobre o produto.

## Roteiro de teste logado (só com Supabase — nada disto foi executado)

Montado pelas revisões das Tasks 10 e 11. É o que o dono do produto precisa percorrer quando subir o CRM:

1. **Ordem de chaves do `jsonb`:** subir a `versao` do motor **sem mudar fórmula** e abrir um cálculo salvo —
   o aviso "Este cálculo mudou" **não** pode aparecer. (Motivou a correção da comparação estrutural.)
2. Criar cálculo → salvar → a tela vai para `/ferramentas/indulto-comutacao/<id>` com o cálculo certo.
3. Editar cálculo salvo → salvar → título no cabeçalho e formulário batem com o que foi gravado.
4. Excluir → confirmação em duas etapas → volta para a lista → o item não aparece mais.
5. Abrir o `id` de **outro membro** do mesmo workspace e o `id` de **outro workspace** do mesmo usuário →
   404 nos dois casos, sem diferença visível.
6. Com dois membros, conferir que um não vê a lista do outro; com um membro em dois workspaces, conferir que
   cada workspace mostra só os próprios cálculos.
7. Simular falha de banco na leitura → a página cai no limite de erro do Next, **não** numa lista vazia.
8. Conferir visualmente o tema escuro (padrão) e o claro: aviso de versão, mensagens e confirmação de exclusão.
9. Rodar a migration `0062` numa instalação existente e reiniciar o servidor (segunda passada não pode falhar).
10. Com a licença bloqueada, tentar salvar → redireciona para `/licenca`.

## Decisões que são do usuário (não corrigir na revisão)

> **Resolvido em 17/09/2026 — o Art. 13 com `<` estrito saiu desta lista.** Era o item 1; o dono do
> produto decidiu aceitar o cumprimento exato da fração, e o motor passou a `<=` nos dois decretos. O
> item não foi reescrito aqui porque os documentos de decisão são **registro**; o que mudou, o porquê e
> o efeito nos testes estão em
> [`telas-questionario-e-resultado.md`](telas-questionario-e-resultado.md), §5.

1. **Teto dobrado do Inciso VIII** (`Cálculo!R96`): vem da própria planilha. Exibido ao advogado.
2. **"NÃO SE APLICA" à reincidência no Art. 11** satisfaz requisitos opostos. Fiel; exibido.
3. **Bug G149 da planilha em uso**: esconde uma comutação de 2/3 devida quando o Art. 13 não preenche e o §4º preenche — só na igualdade exata, que era justamente o caso do `<` estrito resolvido em 17/09/2026 (item que saiu desta lista). O motor já corrigia; era a planilha em uso que prejudicava o sentenciado.
4. **Justiça restaurativa ausente da calculadora web da POC**: a POC em uso nunca coletava o campo `E51`, negando a regra especial do §2º a quem só se enquadra por ele. O motor novo coleta.
5. **Limite de cálculos gravados por usuário**: não existe.
6. **Cálculos de quem é removido de um workspace**: o membro perde o acesso e não consegue excluí-los; ficam até a conta ou o workspace ser apagado.
7. **Exclusão da conta leva os cálculos junto** (`on delete cascade` de `auth.users`): bom para eliminação sob a LGPD; ruim se o escritório tiver dever de guarda.
