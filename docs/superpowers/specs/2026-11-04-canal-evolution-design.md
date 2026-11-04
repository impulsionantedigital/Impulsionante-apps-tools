# Canal WhatsApp pela Evolution API — design

Data: 2026-11-04 · Status: aguardando aprovação

## Por quê

O CRM só conecta WhatsApp não-oficial pela **uazapi**. O dono da instalação já roda uma
**Evolution API** própria (`https://evolution.impulsionante.com.br`, versão **2.3.7**) e tentou
usá-la na aba da uazapi. O resultado foi `HTTP 404 Cannot POST /instance/init`, porque os dois
servidores falam protocolos diferentes.

O objetivo é ter a Evolution como **opção extra**, ao lado da uazapi, sem mexer no comportamento
da uazapi.

## Objetivos

- Uma aba nova, **"WhatsApp (Evolution)"**, em Configurações → Canais, ao lado das três que já
  existem.
- Conectar um número: criar a instância na Evolution, mostrar o QR, conferir o estado e marcar o
  canal como conectado.
- **Receber** texto, imagem, áudio, vídeo e documento. As mensagens seguem o mesmo caminho das
  que chegam pela uazapi: conversa, contato, download do anexo dentro da cota de 500 MB e agente
  de IA.
- **Responder com texto**, pela mesma fila de envio que a uazapi usa.
- Excluir o canal apaga a instância na Evolution.

## Fora do escopo

- **Enviar anexo.** Hoje nenhum canal envia anexo; a uazapi também só responde com texto. O envio
  de anexo vai ser um projeto separado, feito para os dois canais de uma vez.
- Marcar como lida (`markRead`), chamadas, status/stories e grupos além do que a uazapi já trata.
- Migrar canais existentes da uazapi para a Evolution.
- Suporte à Evolution v1. O alvo é só a v2, cujo formato de resposta é diferente.

## Anti-objetivos (o que tornaria isto um fracasso mesmo funcionando)

- Qualquer mudança de comportamento nos canais uazapi, Cloud ou Instagram.
- Afrouxar a conferência de identidade do webhook para a Evolution caber nela.
- Uma migration que não aguente rodar duas vezes, que impeça o boot ou que derrube uma `check`
  do comprador.
- A chave global ou a chave da instância aparecendo em tela, log ou mensagem de erro.

## Decisões do usuário

1. Na aba, o usuário cola o **endereço do servidor Evolution** e a **chave global**
   (`AUTHENTICATION_API_KEY`).
2. O estado da conexão é conferido em `GET /instance/connectionState/{instanceName}`.
3. A Evolution recebe texto e mídia e **responde só com texto**.

## Como funciona

### Identificador e banco

- Slug novo: `evolution`. Ele entra em `SLUGS` ([types.ts](../../../src/server/canais/types.ts)),
  em `ADAPTERS` ([registry.ts](../../../src/server/canais/registry.ts)) e em
  [origem-do-canal.ts](../../../src/server/canais/origem-do-canal.ts), mapeado para `'whatsapp'`.
- Migration nova `supabase/migrations/0079_evolution.sql`, que alarga a `check` de
  `canais.provider` para `('uazapi', 'simulador', 'whatsapp_cloud', 'instagram', 'evolution')`.
  **Copie o bloco da [0037_instagram.sql](../../../supabase/migrations/0037_instagram.sql)**: ele
  já derruba só a `check` que é do produto (por nome **e** por conjunto de valores), avisa no log
  quando reconhece só metade e aguenta rodar duas vezes. Acrescente o domínio da 0037 à lista
  `dominios` e troque o prefixo dos avisos para `[0079]`.
  - ⚠️ A 0077 e a 0078 já são do assistente (commitadas pelo Codex em paralelo).
    Antes de criar a 0079, confirme que o número continua livre.
  - ⚠️ Confira se outra coluna ou tabela também restringe o provider (por exemplo, `conversas`
    ou a origem). A 0037 é a referência do que precisou mudar quando o Instagram entrou.

### Credenciais e segredos

- `CredsEvolution = { tipo: 'evolution', serverUrl, instancia, apiKey }`. A `apiKey` é a chave
  **da instância** (o `hash` que a Evolution devolve no `create`), não a global.
- A chave da instância e o segredo do webhook são gravados nas mesmas chaves já usadas por canal:
  `chaveToken(id)` e `chaveWebhook(id)` em
  [segredos.ts](../../../src/server/canais/segredos.ts). Assim, `lerCredenciais`,
  `apagarSegredosDoCanal` e o envio funcionam sem caminho novo. *(Decisão do Claude: o prefixo
  `uazapi_` no nome dessas chaves é histórico e fica como está.)*
- `formaDeCredencial` ganha o caso `evolution`: precisa de `serverUrl` (de `config.server_url`) e
  de `externalId` (o nome da instância).
- `segredosDe` passa a redigir `[apiKey, serverUrl]`.
- **Chave global:** um segredo novo, válido para o servidor inteiro, `CHAVE_EVOLUTION_GLOBAL =
  'evolution_global_key'`, guardado criptografado do mesmo jeito que `CHAVE_ADMIN`.
  *(Decisão do Claude:)* ela é pedida na aba Evolution e, depois de salva, o campo mostra
  "Configurado — cole outra pra trocar", como o token de administrador da uazapi. Quem pode
  salvar é o mesmo papel que hoje salva o `CHAVE_ADMIN`. Ela só é usada para **criar** instâncias.

### Chamadas à Evolution v2

Toda chamada leva o cabeçalho `apikey`. Use o `chamarProvider` que já existe em
[conexao.ts](../../../src/server/canais/conexao.ts) (que já redige os segredos), aceitando
cabeçalho e método por parâmetro.

| Ação | Chamada | Chave |
|---|---|---|
| Criar | `POST /instance/create` `{ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }` | global |
| Webhook | `POST /webhook/set/{instance}` `{ webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"] } }` | instância |
| QR | `GET /instance/connect/{instance}`, que devolve `base64` (imagem) e `code` | instância |
| Estado | `GET /instance/connectionState/{instance}`, que devolve `instance.state`: `open` / `connecting` / `close` | instância |
| Enviar texto | `POST /message/sendText/{instance}` `{ number, text }`, que devolve `key.id` | instância |
| Baixar mídia | `POST /chat/getBase64FromMediaMessage/{instance}` `{ message: { key: { id } }, convertToMp4: false }`, que devolve `base64` e `mimetype` | instância |
| Apagar | `DELETE /instance/logout/{instance}` (pode falhar sem problema) e depois `DELETE /instance/delete/{instance}` | instância |

- ⚠️ Na v2, o `create` devolve `hash` como **string**. Em algumas versões ele veio como
  `{ apikey }`. Aceite as duas formas. Sem chave na resposta, desfaça o canal, como o fluxo da
  uazapi já faz quando falta `token`.
- A URL do webhook é `urlDoWebhook(urlPublica, 'evolution', canalId, segredoWebhook)`. A rota
  [`/api/canais/[provider]/webhook/...`](../../../src/app/api/canais/[provider]/webhook/[[...caminho]]/route.ts)
  já é genérica por provider.
- A Evolution v2 aceita `webhook` dentro do próprio `create`. Mesmo assim, use `webhook/set`
  separado, porque o mesmo passo serve para o "Religar recebimento" que a tela já tem.

### Conexão (server actions)

Em [conexao.ts](../../../src/server/canais/conexao.ts), seguindo `criarCanal` / `reconectarCanal`
/ `registrarWebhookDoCanal` / `excluirCanal`:

- `criarCanalEvolution(workspaceId, { nome, serverUrl })`: as mesmas guardas de `criarCanal`
  (engine liberado, owner, nome único). Grava a linha com `provider: 'evolution'`,
  `external_id = instanceName`, `config.server_url`. Chama `create`, grava os segredos e registra
  o webhook. Se qualquer passo falhar, chama `desfazerCanal`.
  *(Decisão do Claude:)* o `instanceName` é o nome que o usuário deu, normalizado do mesmo jeito
  que a uazapi faz.
- **Reconectar / Gerar código:** chama `connect` e devolve `{ qr }` no mesmo formato que a tela
  já entende. Marca o canal como `pareando`.
- **Estado (nova):** `estadoEvolution(workspaceId, canalId)` chama `connectionState`. Se vier
  `open`, grava `status_conexao = 'conectado'`; se vier `close`, grava `'desconectado'`.
  *(Decisão do Claude:)* enquanto o QR estiver aberto na tela, ela chama essa action a cada
  ~3 s, por no máximo ~2 min, e para quando chega `open`. O evento `connection.update` do webhook
  também atualiza o estado; os dois caminhos convivem.
- **Excluir:** `logout` e depois `delete` na Evolution, mantendo o resto de `excluirCanal`.
- Onde hoje um ramo pergunta `provider === 'uazapi'` ou usa os caminhos da uazapi no fluxo
  pareado, crie um ramo por provider. Não reaproveite rota da uazapi.

### Adapter `providers/evolution.ts`

Implementa `CanalAdapter`. *(Decisões do Claude sobre as capabilities:)* `enviaMidia: false`,
`markRead: false`, `conexaoPareada: true`, `precisaCredencial: true`, `janela24h: false`,
`identidadePorTelefone: true`, `sintaxeWhatsapp: true`, `recebePorWebhook: true`,
`ecoaEnvioProprio: true` (a Evolution reenvia como `messages.upsert` com `fromMe` o que foi
mandado pela API). Confirme este último num teste real antes de fechar.

Formato do envelope v2:

```json
{ "event": "messages.upsert", "instance": "<nome>", "apikey": "<chave da instância>",
  "data": { "key": { "remoteJid": "5511...@s.whatsapp.net", "fromMe": false, "id": "...", "participant": "..." },
            "pushName": "...", "messageType": "imageMessage", "messageTimestamp": 1730000000,
            "message": { "imageMessage": { "caption": "...", "mimetype": "image/jpeg" } } } }
```

- `messages.upsert` vira `mensagem`. O texto vem de `conversation`,
  `extendedTextMessage.text` ou da legenda da mídia. A mídia sai de
  `imageMessage` / `audioMessage` / `videoMessage` / `documentMessage` / `stickerMessage`
  (tratar como imagem ou ignorar, seguindo o que a uazapi faz). `refExterna` é o **`key.id`**,
  não uma URL. `tipoChat` vem do sufixo do JID (`@g.us` é grupo, `@broadcast` é broadcast).
  `origem` é `aparelho` quando `fromMe`. Siga o
  [uazapi.ts](../../../src/server/canais/providers/uazapi.ts) para remetente, timestamp e corte
  por idade.
- `messages.update` vira `status`, mapeando `SERVER_ACK` / `DELIVERY_ACK` / `READ` / `PLAYED`
  para os `StatusEntregaProvider` que a uazapi já usa.
- `connection.update` vira `conexao`, com `conectado: data.state === 'open'`.
- Qualquer outro evento devolve `[]`.
- `enviarTexto` faz `POST /message/sendText/{instancia}` e devolve `externalId = key.id`. Os
  erros seguem o formato de `EnvioResultado` da uazapi (HTTP e redação de segredos).

### Conferência de identidade do webhook

Hoje, `verificarEvento` → [identidade-do-envelope.ts](../../../src/lib/canais/identidade-do-envelope.ts)
lê a instância em `instance.name` / `instanceName` e o token em `token`. **Na Evolution, a
instância vem como string em `instance` e a chave vem em `apikey`.** Com o código de hoje,
`nomeDaInstancia` devolveria `null` e todo evento seria recusado como `instancia_diferente`.

- Faça a leitura variar por provider. Por exemplo: `nomeDaInstancia(envelope, provider)` /
  `tokenDeclarado(envelope, provider)`, ou um hook opcional no adapter.
- A uazapi tem que continuar lendo **exatamente** os campos de hoje. Não acrescente `apikey` nem
  `instance` string como alternativa genérica, porque isso abriria uma forma nova de
  envelope passar na conferência da uazapi.
- A segurança continua em três camadas: segredo na URL (`verificarRequest`), nome da instância
  igual ao `external_id`, e `apikey` igual à chave da instância (comparação timing-safe).

### Download de mídia

[midia-tick.ts](../../../src/server/canais/midia-tick.ts) hoje valida `refExterna` como URL do
próprio servidor e baixa com `baixarMidia`. Na Evolution, isso não serve: a URL aponta para a CDN
do WhatsApp e o arquivo vem criptografado.

- Para canal `evolution`, ramifique: leia as credenciais do canal (o embed precisa trazer
  `provider`, `id` e `external_id`), chame `getBase64FromMediaMessage` com o `key.id`, decodifique
  e siga o mesmo caminho de gravação e cota.
- Mantenha as mesmas proteções: `TIMEOUT_MS`, `TETO_BYTES` (confira o tamanho **antes** de
  decodificar, pelo comprimento do base64), folga de cota, tentativas e `semCota`.
- O endereço chamado é o `serverUrl` do canal, então a proteção contra destino arbitrário fica
  igual à de hoje.

### Tela

Em [CanaisWhatsApp.tsx](../../../src/app/(app)/config/canais/CanaisWhatsApp.tsx), crie uma aba
nova **"WhatsApp (Evolution)"**, depois de "WhatsApp (código de pareamento)":

- Campos: nome do canal, endereço do servidor Evolution e chave global (este último fica como
  "Configurado — cole outra pra trocar" quando já existir). Botão "Conectar".
- Texto de apoio: "Isso cria uma instância no seu servidor Evolution."
- Na lista de canais conectados, um canal Evolution usa os mesmos botões ("Gerar código",
  "Religar recebimento", excluir). O QR aparece como na uazapi e dispara a consulta de estado
  descrita acima.
- Se o servidor recusar, mostre a mensagem do servidor redigida, como a tela já faz. Para 401,
  mostre: "A Evolution recusou a chave global — confira a AUTHENTICATION_API_KEY."
- [painel.ts](../../../src/server/canais/painel.ts) já lista por `provider`. Confira se ele
  mostra o canal Evolution e seu estado corretamente.

## Testes

Use a suíte que já existe (`pnpm run test`), no mesmo estilo dos testes da uazapi:

- `parse` do adapter para cada tipo de mensagem, ack, conexão, `fromMe`, grupo e evento
  desconhecido.
- `enviarTexto` com `fetchFn` falso, tanto no sucesso quanto no erro com segredo redigido.
- Identidade: um envelope Evolution válido passa; um com instância trocada ou `apikey` errada é
  recusado; **um envelope uazapi com só `apikey`/`instance` string continua recusado**.
- `lerCredenciais` para `evolution`.
- Download de mídia: o ramo Evolution respeita o teto de bytes e a cota.
- Migration: aplicada duas vezes sem erro (se a suíte tiver esse teste para a 0037, copie).

Rode `pnpm build` antes de commitar.

## Validação ao vivo (depois do deploy)

1. Criar o canal com o servidor `evolution.impulsionante.com.br`.
2. Parear pelo QR e ver o estado passar para conectado.
3. Receber texto, foto, áudio e documento.
4. Responder com texto.
5. Excluir o canal e conferir que a instância sumiu do manager da Evolution.

## Fica a critério de quem constrói

- Se o QR é mostrado a partir de `base64` ou gerado a partir de `code`.
- A normalização exata do `instanceName`.
- Os nomes internos das funções e onde o `chamarProvider` ganha o parâmetro de cabeçalho.
