# Canal WhatsApp pela Evolution API — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar a Evolution API v2 como um quarto tipo de canal, que recebe texto e mídia e responde com texto, sem mudar o comportamento da uazapi.

**Architecture:** Um slug novo, `evolution`, com adapter próprio (`providers/evolution.ts`) e um cliente HTTP isolado (`evolution-api.ts`). Os fluxos de conexão, a conferência de identidade e o download de mídia ganham ramos por provider. A fila de envio, a rota de webhook e o dispatch já são genéricos e não mudam.

**Tech Stack:** Next.js (server actions), Supabase/Postgres, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-04-canal-evolution-design.md`

## Global Constraints

- Trabalhar só na worktree `../gpsdapena-tools-evolution`, branch `feat/canal-evolution`. Antes de cada commit, rodar `git branch --show-current`.
- Usar `pnpm`, nunca `npm`. A suíte é `pnpm run test`; o build é `pnpm build`.
- Slug: `evolution` (constante `SLUG_EVOLUTION`).
- Migration: `supabase/migrations/0079_evolution.sql`. Antes de criá-la, conferir que o número continua livre no `main`.
- Segredo global: `CHAVE_EVOLUTION_GLOBAL = 'evolution_global_key'`. Por canal, reutilizar `chaveToken(id)` (chave da instância) e `chaveWebhook(id)`.
- Toda chamada à Evolution leva o cabeçalho `apikey` e `AbortSignal.timeout(20_000)`. Toda mensagem de erro passa por `redigirValores` com a chave e o `serverUrl`.
- Eventos do webhook: `["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"]`, com `byEvents: false` e `base64: false`.
- Capabilities: `enviaMidia:false, markRead:false, conexaoPareada:true, precisaCredencial:true, janela24h:false, identidadePorTelefone:true, sintaxeWhatsapp:true, ecoaEnvioProprio:true, recebePorWebhook:true`.
- Texto que aparece para o usuário em português, no tom das mensagens que já existem em `conexao.ts`. 401 na criação: "A Evolution recusou a chave global — confira a AUTHENTICATION_API_KEY."
- Os testes ficam em `tests/canais/` (pasta nova).

## Review Focus

1. **Envelope uazapi com campos da Evolution** (`instance` string + `apikey`): continua recusado do mesmo jeito que hoje. Teste na Task 3.
2. **`create` com `hash` como objeto `{ apikey }` ou sem `hash`:** o primeiro caso é aceito; o segundo desfaz o canal sem deixar a linha nem os segredos. Teste na Task 4 (`extrairChaveDaInstancia`).
3. **Mídia maior que `TETO_BYTES` vinda em base64:** é recusada pelo comprimento antes de decodificar, sem estourar a memória. Teste na Task 6.
4. **Excluir, religar ou gerar código num canal Evolution:** nunca chama endpoint da uazapi (`/instance`, `/webhook`, `/instance/connect` sem nome). Teste na Task 5 (`rotasDoProvider`).
5. **`messages.upsert` com `fromMe` vindo do próprio envio pela API:** sai com `origem: 'aparelho'`, para o dedupe de eco que já existe funcionar. Teste na Task 2.

---

### Task 1: Slug, migration e credenciais

**Files:**
- Modify: `src/server/canais/types.ts` (SLUGS, `CredsEvolution`, `CanalCreds`, `segredosDe`, `credenciaisEvolution`)
- Modify: `src/server/canais/segredos.ts` (`CHAVE_EVOLUTION_GLOBAL`, caso em `formaDeCredencial`)
- Modify: `src/server/canais/origem-do-canal.ts` (`[SLUG_EVOLUTION]: 'whatsapp'`)
- Create: `supabase/migrations/0079_evolution.sql`
- Test: `tests/canais/credenciais-evolution.spec.ts`

**Interfaces:**
- Produces:
  - `SLUG_EVOLUTION = 'evolution'`, incluído em `SLUGS`
  - `type CredsEvolution = { readonly __validadoEvolution: unique symbol; tipo: 'evolution'; serverUrl: string; instancia: string; apiKey: string }`
  - `credenciaisEvolution(b: { serverUrl: string; instancia: string; apiKey: string }): CanalCreds | null`, que devolve null se `serverUrl` ou `apiKey` tiverem menos que `PISO_SEGREDO_CANAL` ou se `instancia` estiver vazia
  - `segredosDe(evolution)` devolve `[apiKey, serverUrl]`
  - `CHAVE_EVOLUTION_GLOBAL`
- ⚠️ Enquanto a Task 2 não existir, `ADAPTERS` em `registry.ts` vai reclamar da chave faltando no `Record<ProviderSlug, …>`. Para não quebrar o build, aponte `evolution` temporariamente para `simuladorAdapter`, com um `// trocado na Task 2`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('credenciaisEvolution monta creds válidas', () => {
  const c = credenciaisEvolution({ serverUrl: 'https://evo.exemplo.com', instancia: 'loja', apiKey: 'chave-da-instancia' })
  expect(c && c.tipo).toBe('evolution')
  expect(segredosDe(c!)).toEqual(['chave-da-instancia', 'https://evo.exemplo.com'])
})
it('recusa chave curta ou instância vazia', () => {
  expect(credenciaisEvolution({ serverUrl: 'https://evo.exemplo.com', instancia: 'loja', apiKey: 'curta' })).toBeNull()
  expect(credenciaisEvolution({ serverUrl: 'https://evo.exemplo.com', instancia: ' ', apiKey: 'chave-da-instancia' })).toBeNull()
})
it('lerCredenciais de evolution sem external_id dá sem_config', async () => {
  // mock de '@/server/secrets' (vi.mock) devolvendo 'chave-da-instancia'
  expect(await lerCredenciais({ id: 'c1', provider: 'evolution', serverUrl: 'https://evo.exemplo.com', externalId: null }))
    .toEqual({ creds: null, motivo: 'sem_config' })
})
it('lerCredenciais de evolution completo devolve creds', async () => {
  const r = await lerCredenciais({ id: 'c1', provider: 'evolution', serverUrl: 'https://evo.exemplo.com', externalId: 'loja' })
  expect(r.creds && (r.creds as { instancia: string }).instancia).toBe('loja')
})
```

- [ ] **Step 2:** `pnpm vitest run tests/canais/credenciais-evolution.spec.ts`. Esperado: FAIL (`credenciaisEvolution` não existe).
- [ ] **Step 3: Implementar** os itens de Produces. No `formaDeCredencial`, use `configFaltando: !canal.serverUrl || !canal.externalId`.
- [ ] **Step 4: Escrever a migration** copiando o bloco `do $$ … $$` da `0037_instagram.sql`. Novo check: `provider in ('uazapi', 'simulador', 'whatsapp_cloud', 'instagram', 'evolution')`. Acrescente `'uazapi,simulador,whatsapp_cloud,instagram'` como último domínio anterior (ele já está lá; a lista fica com 4 itens anteriores). Troque `[0037]` por `[0079]` e use um nome de constraint distinto, seguindo a convenção da 0037. Confira também se a 0037 alterou outra tabela além de `canais`; se alterou, repita para `evolution`.
- [ ] **Step 5:** `pnpm vitest run tests/canais tests/migracoes`. Esperado: PASS, incluindo `idempotencia.spec.ts` para a 0079.
- [ ] **Step 6: Commit** `feat(canais): slug e credenciais do canal Evolution`

---

### Task 2: Adapter `providers/evolution.ts`

**Files:**
- Create: `src/server/canais/providers/evolution.ts`
- Modify: `src/server/canais/registry.ts` (`[SLUG_EVOLUTION]: evolutionAdapter`)
- Test: `tests/canais/evolution-adapter.spec.ts`

**Interfaces:**
- Consumes: `CredsEvolution` (Task 1); helpers de `providers/fronteira.ts` (`comoId`, `comoTexto`, `limparTexto`, `contarCorte`, `LIMITE_*`), `normalizarTelefone`, `isoDeCarimbo`, `redigirValores`, `causaDaFalhaSemResposta`.
- Produces: `evolutionAdapter: CanalAdapter` com `slug: 'evolution'`, as capabilities das Global Constraints, `parse` e `enviarTexto`.

O mapeamento está na seção "Adapter" do spec. Valores que ficam fixos:
- Tipo de mídia: `imageMessage`→`imagem`, `audioMessage`→`audio`, `videoMessage`→`video`, `documentMessage`/`documentWithCaptionMessage`→`documento`. `stickerMessage` é ignorado (não vira mídia).
- `refExterna = refNaoValidada(key.id)`.
- Ack: `SERVER_ACK`→`sent`, `DELIVERY_ACK`→`delivered`, `READ`/`PLAYED`→`read`, `ERROR`→`failed`. O id vem de `data.keyId ?? data.key?.id`. Respeite `LIMITE_ACKS` com `contarCorte`, como a uazapi faz.
- `envio`: `POST {serverUrl}/message/sendText/{encodeURIComponent(instancia)}` com `{ number, text }`. O `externalId` vem de `key.id`. Sem `key.id` na resposta 200, devolva o mesmo erro "aceitou o envio … mas não confirmou" da uazapi.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const base = { instance: 'loja', apikey: 'chave-da-instancia' }
it('texto simples', () => {
  const [ev] = evolutionAdapter.parse({ ...base, event: 'messages.upsert', data: {
    key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'ABC' },
    pushName: 'Ana', messageTimestamp: 1730000000, message: { conversation: 'oi' } } }, 1730000001000)
  expect(ev).toMatchObject({ tipo: 'mensagem', externalId: 'ABC', tipoChat: 'individual', texto: 'oi',
    remetente: '5511999990000', nomeRemetente: 'Ana', origem: 'contato', midia: null })
})
it('extendedTextMessage', /* texto vem de extendedTextMessage.text */)
it('imagem com legenda', () => {
  // message: { imageMessage: { caption: 'foto', mimetype: 'image/jpeg' } }
  // expect midia: { kind: 'imagem', mime: 'image/jpeg', refExterna: { valor: 'ABC' }, legenda: 'foto' } e texto 'foto'
})
it('fromMe vira origem aparelho', /* key.fromMe: true → origem 'aparelho' */)
it('grupo pelo sufixo @g.us', /* tipoChat 'grupo'; remetente de key.participant */)
it('ack DELIVERY_ACK', () => {
  expect(evolutionAdapter.parse({ ...base, event: 'messages.update', data: { keyId: 'ABC', status: 'DELIVERY_ACK' } }))
    .toEqual([{ tipo: 'status', externalId: 'ABC', status: 'delivered' }])
})
it('connection.update open', () => {
  expect(evolutionAdapter.parse({ ...base, event: 'connection.update', data: { state: 'open' } }))
    .toEqual([{ tipo: 'conexao', externalId: 'loja', conectado: true }])
})
it('evento desconhecido e lixo dão []', /* event: 'presence.update'; null; 'x' */)
it('enviarTexto: sucesso devolve key.id e manda apikey', async () => {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify({ key: { id: 'OUT1' } }), { status: 201 }))
  const r = await evolutionAdapter.enviarTexto(creds, '5511999990000', 'olá', { fetchFn })
  expect(r).toEqual({ ok: true, externalId: 'OUT1' })
  expect(fetchFn.mock.calls[0][0]).toBe('https://evo.exemplo.com/message/sendText/loja')
  expect((fetchFn.mock.calls[0][1] as RequestInit).headers).toMatchObject({ apikey: 'chave-da-instancia' })
})
it('enviarTexto: erro de rede não vaza a chave', /* fetchFn lança Error('falhou chave-da-instancia') → erro sem a chave */)
it('enviarTexto: creds de outro tipo é recusado', /* creds uazapi → ok:false 'canal sem credencial configurada' */)
```

- [ ] **Step 2:** `pnpm vitest run tests/canais/evolution-adapter.spec.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `evolution.ts` e trocar o placeholder do registry.
- [ ] **Step 4:** Rodar de novo. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(canais): adapter da Evolution (parse e envio de texto)`

---

### Task 3: Conferência de identidade por provider

**Files:**
- Modify: `src/lib/canais/identidade-do-envelope.ts`
- Modify: `src/server/canais/registry.ts` (`verificarEvento` passa `canal.provider`)
- Modify: os outros chamadores de `nomeDaInstancia` / `tokenDeclarado` (há pelo menos um em `providers/uazapi.ts`), que passam `'uazapi'` explicitamente ou usam o default
- Test: `tests/canais/identidade-evolution.spec.ts`

**Interfaces:**
- Produces: `nomeDaInstancia(envelope: unknown, provider?: string): string | null` e `tokenDeclarado(envelope: unknown, provider?: string): string | null`. Para `provider === 'evolution'`, lê `instance` (string) e `apikey`. Qualquer outro valor, ou ausente, mantém **exatamente** a leitura de hoje.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it('evolution: lê instance string e apikey', () => {
  const env = { instance: 'loja', apikey: 'k' }
  expect(nomeDaInstancia(env, 'evolution')).toBe('loja')
  expect(tokenDeclarado(env, 'evolution')).toBe('k')
})
it('evolution: apikey ausente é null; não-string é ""', /* como o token da uazapi */)
it('uazapi continua ignorando instance string e apikey', () => {
  const env = { instance: 'loja', apikey: 'k' }
  expect(nomeDaInstancia(env, 'uazapi')).toBeNull()
  expect(nomeDaInstancia(env)).toBeNull()
  expect(tokenDeclarado(env, 'uazapi')).toBeNull()
})
it('verificarEvento: evolution válido passa, apikey errada recusa', async () => {
  const canal = { id: 'c1', workspace_id: 'w', provider: 'evolution', external_id: 'loja', config: {}, agente_ligado: false }
  const getSecret = async () => 'chave-da-instancia'
  expect(await verificarEvento(canal, { instance: 'loja', apikey: 'chave-da-instancia' }, { getSecret })).toEqual({ veredito: 'ok' })
  expect(await verificarEvento(canal, { instance: 'loja', apikey: 'outra' }, { getSecret }))
    .toEqual({ veredito: 'recusado', motivo: 'token_diferente' })
  expect(await verificarEvento(canal, { instance: 'outra', apikey: 'chave-da-instancia' }, { getSecret }))
    .toEqual({ veredito: 'recusado', motivo: 'instancia_diferente' })
})
```

- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Um `switch` por provider dentro das duas funções.
- [ ] **Step 4:** `pnpm vitest run tests/canais`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(canais): identidade do webhook da Evolution sem afrouxar a da uazapi`

---

### Task 4: Cliente HTTP da Evolution

**Files:**
- Create: `src/server/canais/evolution-api.ts`
- Test: `tests/canais/evolution-api.spec.ts`

**Interfaces:**
- Produces (todas recebem `deps: { fetchFn?: typeof fetch } = {}` por último e lançam `Error` com mensagem redigida no padrão de `chamarProvider`: "O servidor de mensagens recusou (HTTP n): …" / "Não consegui falar com o servidor de mensagens: …". O 401 em `criarInstancia` usa a mensagem fixa das Global Constraints):
  - `criarInstancia(serverUrl, chaveGlobal, instanceName): Promise<{ instancia: string; apiKey: string | null }>`
  - `extrairChaveDaInstancia(resposta: unknown): string | null`, que aceita `hash` como string ou `hash.apikey`
  - `registrarWebhookEvolution(serverUrl, apiKey, instancia, url): Promise<void>`
  - `conectarInstancia(serverUrl, apiKey, instancia): Promise<{ qr: string | null }>`, com `qr` vindo de `code`
  - `estadoDaInstancia(serverUrl, apiKey, instancia): Promise<'open' | 'connecting' | 'close' | null>`
  - `baixarMidiaBase64(serverUrl, apiKey, instancia, messageId): Promise<{ base64: string; mimetype: string | null }>`
  - `apagarInstancia(serverUrl, apiKey, instancia): Promise<void>`: logout (ignora erro) e depois delete (ignora 404)
- O nome da instância vai sempre com `encodeURIComponent` no caminho.

- [ ] **Step 1: Escrever os testes que falham** (todos com `fetchFn` falso que registra URL, método, cabeçalho e corpo):
  - `criarInstancia` faz POST em `/instance/create` com `apikey: chaveGlobal` e corpo `{ instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }`, e devolve a `apiKey` do `hash` string.
  - `extrairChaveDaInstancia({ hash: { apikey: 'k' } })` dá `'k'`; `({})` dá `null`; `({ hash: 3 })` dá `null`.
  - `criarInstancia` com 401 lança a mensagem fixa e a chave global não aparece em `err.message`.
  - `registrarWebhookEvolution` faz POST em `/webhook/set/loja` com `webhook.events` igual ao das Global Constraints e `enabled: true`.
  - `estadoDaInstancia` faz GET em `/instance/connectionState/loja` e lê `instance.state`; um valor fora dos três dá `null`.
  - `conectarInstancia` faz GET em `/instance/connect/loja` e devolve `{ qr: code }`.
  - `apagarInstancia` faz DELETE em `/instance/logout/loja` e depois `/instance/delete/loja`; um 500 no logout não impede o delete.
  - `baixarMidiaBase64` faz POST em `/chat/getBase64FromMediaMessage/loja` com `{ message: { key: { id } }, convertToMp4: false }`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Um `chamar(url, apiKey, corpo, segredos, metodo, deps)` interno. Não reaproveite o `chamarProvider` de `conexao.ts`: ele é privado e não aceita `fetchFn`.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(canais): cliente HTTP da Evolution v2`

---

### Task 5: Fluxo de conexão e server actions

**Files:**
- Modify: `src/server/canais/conexao.ts`
- Modify: `src/app/(app)/config/acoes-canais.ts`
- Test: `tests/canais/rotas-do-provider.spec.ts`

**Interfaces:**
- Consumes: Task 4 inteira; `CHAVE_EVOLUTION_GLOBAL`.
- Produces:
  - `criarCanalEvolution(workspaceId, dados: { nome: string; serverUrl: string }): Promise<{ canalId: string }>`, com as mesmas guardas e a mesma ordem de `criarCanal` (`exigirDonoDoDeploy`, `validarServerUrl`, URL pública, inserção com `provider: 'evolution'`, `external_id = nome`). Depois: `criarInstancia` → `extrairChaveDaInstancia`, desfazendo se vier null → atualiza `external_id` se a instância voltar com outro nome → `gravarSegredosDoCanal` → `registrarWebhookEvolution(urlDoWebhook(urlPublica, 'evolution', …))`. Em qualquer falha depois da criação da instância, chama `desfazerCanal` com rollback que use `apagarInstancia`.
  - `estadoDoCanalEvolution(workspaceId, canalId): Promise<{ estado: 'conectado' | 'pareando' | 'desconectado' }>`, que exige owner e grava `status_conexao` (`open` vira conectado; `close` vira desconectado; `connecting` vira pareando; `null` não muda nada e devolve o estado atual).
  - `reconectarCanal`, `registrarWebhookDoCanal` e `excluirCanal` ganham ramo `canal.provider === SLUG_EVOLUTION`, que usa `conectarInstancia` / `registrarWebhookEvolution` / `apagarInstancia`.
  - `rotasDoProvider(provider: string): 'uazapi' | 'evolution'`, uma função pura exportada que decide o ramo. Ela existe para o teste.
  - Actions novas: `salvarChaveEvolution(bruta): Promise<ResultadoSimples>` (dono do deploy, piso `PISO_SEGREDO_CANAL`, `setSecret(CHAVE_EVOLUTION_GLOBAL, …)`); `conectarCanalEvolution(dados)`; `consultarEstadoEvolution(canalId)`. `gerarQr` não muda (já chama `reconectarCanal` + `qrParaImagem`).

- [ ] **Step 1: Escrever o teste que falha:** `rotasDoProvider('evolution') === 'evolution'`, `rotasDoProvider('uazapi') === 'uazapi'`. Mais um teste de fonte que lê `conexao.ts` e confere que os ramos de `excluirCanal`, `reconectarCanal` e `registrarWebhookDoCanal` passam por `rotasDoProvider` (`expect(fonte.match(/rotasDoProvider\(/g)!.length).toBeGreaterThanOrEqual(3)`).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3: Implementar** os itens de Produces.
- [ ] **Step 4:** `pnpm vitest run tests/canais` e `pnpm exec tsc --noEmit`. Esperado: PASS, sem erro de tipo.
- [ ] **Step 5: Commit** `feat(canais): conectar, parear, religar e excluir canal Evolution`

---

### Task 6: Download de mídia da Evolution

**Files:**
- Modify: `src/server/canais/midia-tick.ts`
- Create: `src/server/canais/midia-evolution.ts`
- Test: `tests/canais/midia-evolution.spec.ts`

**Interfaces:**
- Consumes: `baixarMidiaBase64` (Task 4), `lerCredenciais` (Task 1), `TETO_BYTES` de `midia.ts`.
- Produces: `decodificarComTeto(base64: string, teto: number): { ok: true; bytes: Uint8Array } | { ok: false; motivo: 'grande' | 'invalido' }`. O tamanho estimado é `Math.floor(base64.length * 3 / 4)` e é conferido **antes** do `Buffer.from`. Aceita prefixo `data:…;base64,`.
- `baixarMidiaEvolution(canal: { id: string; serverUrl: string; externalId: string | null }, messageId: string, folga: number)` devolve o mesmo `ResultadoDownload` que `baixarMidia` já devolve, para o `processar` tratar igual. Usa `Math.min(TETO_BYTES, folga)` como teto; `grande` maior que a folga vira `sem_cota`, como em `baixarMidia`.
- Em `processar`: o embed de `canais` passa a trazer `id, provider, external_id`. Quando `provider === 'evolution'`, pula `validarUrlDeMidia` e chama `baixarMidiaEvolution` com `cru` como `messageId`. O resto (cota, tentativas, gravação) fica igual.

- [ ] **Step 1: Escrever os testes que falham**
  - `decodificarComTeto(btoa('abc'), 10)` dá `ok` com 3 bytes.
  - Prefixo `data:image/jpeg;base64,` é removido.
  - `decodificarComTeto('A'.repeat(4000), 100)` dá `{ ok: false, motivo: 'grande' }`, e `Buffer.from` não é chamado (`vi.spyOn(Buffer, 'from')`).
  - String vazia ou com caracteres fora do alfabeto base64 dá `invalido`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm vitest run tests/canais` e `pnpm exec tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(canais): baixa anexo da Evolution pelo base64 da própria instância`

---

### Task 7: Tela

**Files:**
- Modify: `src/server/canais/painel.ts` (`temChaveEvolution: boolean`, lido de `CHAVE_EVOLUTION_GLOBAL`)
- Modify: `src/app/(app)/config/canais/CanaisWhatsApp.tsx`
- Modify: `src/app/(app)/config/canais/canais.module.css` (só se faltar estilo)

**Interfaces:**
- Consumes: `salvarChaveEvolution`, `conectarCanalEvolution`, `consultarEstadoEvolution`, `gerarQr` (Task 5).

Requisitos:
- `TipoDeCanal` ganha `'evolution'`. A aba "WhatsApp (Evolution)" fica logo depois de "WhatsApp (código de pareamento)".
- Campos: nome do canal, endereço do servidor Evolution e chave global. O placeholder da chave é `'Configurado — cole outra pra trocar'` quando `temChaveEvolution`. Botão "Salvar" da chave e botão "Conectar". Texto: "Isso cria uma instância no seu servidor Evolution."
- Os canais Evolution aparecem na lista existente com os mesmos botões, porque já são `conexaoPareada`.
- Quando `codigo` está aberto para um canal `provider === 'evolution'`, um `useEffect` chama `consultarEstadoEvolution` a cada 3000 ms, por até 40 tentativas. Para ao receber `conectado`, fecha o QR e chama `router.refresh()`. Limpa o intervalo ao desmontar ou ao fechar o QR.
- A tela precisa saber o `provider` de cada canal. Se `painel.ts` ainda não o expõe na linha, acrescente.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `pnpm build`. Esperado: termina sem erro.
- [ ] **Step 3:** Subir local (`pnpm dev`), abrir `/config/canais` e conferir pelo browser: a aba aparece, o campo da chave aparece e as outras três abas continuam iguais.
- [ ] **Step 4: Commit** `feat(canais): aba da Evolution em Configurações → Canais`

---

### Task 8: Fechamento

- [ ] **Step 1:** `pnpm run test` e `pnpm build`. Esperado: tudo verde.
- [ ] **Step 2:** Conferir `git diff main --stat`: nenhum arquivo fora da lista deste plano.
- [ ] **Step 3:** Revisão de branch inteira (superpowers:requesting-code-review).
- [ ] **Step 4:** Entregar ao usuário a checklist de "Validação ao vivo" do spec. O merge no `main` (que publica em produção) só acontece com autorização explícita do usuário.
