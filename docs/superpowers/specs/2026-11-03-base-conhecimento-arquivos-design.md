# Base de conhecimento com arquivos — design

Data: 2026-11-03

## Intenção

Hoje a base de conhecimento só recebe cards digitados à mão (título + até 4.000 caracteres),
e o agente do WhatsApp busca neles os 5 mais parecidos. Isso não serve para material de
verdade: um almanaque inteiro, uma apostila, a transcrição de uma aula.

Queremos que o dono da instalação **envie arquivos** e que o agente do WhatsApp **responda
qualquer pergunta sobre o conteúdo deles, só com o que está neles, citando a fonte**.

O código é um só e roda em instalações separadas, cada uma com o seu material:

- **Trilhas de Aruanda:** Almanaque dos Orixás e Almanaque das Ervas, ambos em Markdown.
- **GPS da Pena:** apostilas e outros materiais, ainda indefinidos — por exemplo a transcrição
  de uma aula.

Uma instalação nunca vê o material da outra (são servidores e espaços de trabalho diferentes).
Por isso **o sistema não pode saber nada de orixá, erva ou direito**: ele precisa funcionar bem
com qualquer texto, dos mais organizados aos mais corridos. O usuário pediu explicitamente que
o desenho atenda "aos cenários mais complexos possíveis".

## Perguntas que precisam funcionar

Do Trilhas (reais, ditas pelo usuário):

| Pergunta | Tipo | Dificuldade |
|---|---|---|
| Quem é o par de Ogum? | pontual | a resposta está em um lugar |
| Quais comidas e bebidas posso oferecer a Xangô? | pontual, dentro de verbete longo | o verbete de cada orixá é grande |
| Tem alguma oferenda para Iemanjá? | pontual, dentro de verbete longo | idem |
| Para qual orixá posso fazer firmeza para abertura de caminhos? | busca por tema | a resposta pode estar em vários verbetes |
| Quais ervas são de Oxum? | **lista** | cada erva é um verbete curto que cita o orixá; a resposta são todos os verbetes que citam Oxum |
| Quais plantas frias posso usar para harmonizar o corpo após um dia cansativo? | **lista + filtro por tema** | idem, cruzando "fria" com o uso |

Do GPS (hipotéticas): pergunta sobre algo explicado no meio de uma aula transcrita, sem título
nenhum marcando o assunto.

## Objetivos

1. Enviar arquivos **pdf, docx, md, txt, json e csv**, com **pelo menos 100 MB por arquivo**.
2. Envio que **retoma de onde parou** se a conexão cair.
3. Processamento em segundo plano, com status visível: enviado → processando → pronto, ou erro
   com o motivo em português.
4. Corte do texto **respeitando a estrutura** do documento (títulos, páginas, tabelas), com
   recorte adicional quando uma seção é longa.
5. Uma **frase de contexto gerada por IA para cada trecho**, para que texto sem estrutura
   (transcrição de aula) seja encontrável.
6. O agente ganha ferramentas para os quatro tipos de pergunta: pontual, longa, por tema e lista.
7. O agente **cita a fonte** ao responder no WhatsApp (decisão do usuário).
8. Os cards manuais atuais **continuam funcionando** como hoje, lado a lado com os documentos.

## Não-objetivos

- OCR. Os PDFs e Word serão sempre de texto (decisão do usuário). PDF que só tem imagem deve
  terminar em **erro com motivo claro** ("o arquivo não tem texto selecionável"), não em
  documento "pronto" e vazio.
- Imagens, áudio e vídeo dentro ou fora dos documentos.
- Conversa com o agente fora do WhatsApp (tela de chat no site). Fica para depois.
- `.doc` (Word antigo), planilhas `.xlsx`, PowerPoint.
- Mudar quando o menu mostra a base e os agentes (o `soFerramentas` do `Rail.tsx` fica como está).

## Anti-objetivos (falhou, mesmo que funcione)

- O agente **inventa** algo que não está no material, ou mistura com conhecimento geral dele.
  Hoje ele é proibido de inventar; isso continua.
- Pergunta de lista respondida pela metade sem avisar ("as ervas de Oxum são A, B e C" quando
  o almanaque cita 30). Se o agente não conseguiu ver tudo, ele precisa dizer que a lista pode
  não estar completa.
- Reenviar uma versão nova de um documento deixa o agente, por um tempo, com trechos velhos e
  novos misturados.
- Um envio grande derruba o servidor (memória) ou trava o relógio interno, atrasando as
  respostas do WhatsApp.
- Documento fica "processando" para sempre sem ninguém saber por quê.
- Dado de um espaço de trabalho aparece para outro.

## O que já existe e deve ser reaproveitado

- **Tabela `base_conhecimento`** ([0030](../../../supabase/migrations/0030_base_conhecimento.sql)):
  `embedding vector(1536)`, `embed_versao`, `fts` em português, índices HNSW e GIN, RLS.
- **Busca híbrida** `base_conhecimento_buscar` (textual + semântica, fundidas por posição),
  hoje com assinatura estendida por [0031](../../../supabase/migrations/0031_base_conhecimento_tipos.sql),
  [0041](../../../supabase/migrations/0041_base_por_assistente.sql) e
  [0049](../../../supabase/migrations/0049_indices_busca_e_tetos.sql) — tipos e recorte por assistente.
- **Recorte por assistente**: `assistente_blocos` liga card a assistente.
- **Embeddings**: [embed.ts](../../../src/server/agente/embed.ts), `text-embedding-3-small`, chave
  OpenAI do servidor, custo registrado por `registrarCusto`.
- **Ferramenta do agente** `buscarBase` em [ferramentas.ts](../../../src/server/agente/ferramentas.ts).
- **Relógio interno**: `heartbeat-tick.mjs` chama `/api/interno/tick` a cada 15 s; o tick tem
  orçamento total de 45 s dividido entre "braços" ([orcamento-tick.ts](../../../src/lib/orcamento-tick.ts)).
- **Storage**: buckets privados já existem para anexos e mídia; o padrão de criação está em
  [0019_anexos.sql](../../../supabase/migrations/0019_anexos.sql).
- **Permissão**: só quem administra o espaço de trabalho altera a base
  ([acoes.ts](../../../src/app/(app)/base-conhecimento/acoes.ts), `SO_O_OWNER`), e as ações passam
  por `exigirEngineLiberado()`.

## Limites que mandam no desenho

- **Resposta do agente**: no máximo **6 passos** (`PASSOS_MAX`), **20 s** por turno
  (`TURNO_MAX_MS`) e **4 s** por busca (`ORCAMENTO_BUSCA_MS`)
  ([orcamento.ts](../../../src/server/agente/orcamento.ts)). Buscar várias vezes, ler seção e
  responder têm que caber nisso. O construtor pode ajustar esses números se precisar, mas
  sem passar do braço do agente no tick.
- **Tick**: 45 s no total, compartilhado com WhatsApp, e-mail, automação. O processamento de
  documentos é um **braço novo com orçamento próprio e pequeno**, e trabalha em etapas que
  sobrevivem entre ticks. Ele nunca pode atrasar o braço do agente.
- **Supabase Storage**: no plano gratuito o máximo por arquivo é 50 MB; no Pro é configurável
  no painel (Storage → Settings). Os 100 MB exigem o Pro com o limite global aumentado. O
  `docs/DEPLOY.md` precisa dizer isso.
- **Regras do repositório** (`AGENTS.md`): toda tabela com `workspace_id`, RLS e policy; bucket
  privado; nenhuma `create policy on storage.objects` em migration; toda migration roda duas
  vezes sem falhar. Migrations novas continuam a numeração a partir de **0076** (a `0075` é a de cursos, que veio com a unificação).

## Como funciona — decisões tomadas

### 1. Envio

- O navegador envia o arquivo **direto para o Storage**, sem passar o arquivo pelo servidor
  Next (que tem limite de corpo de requisição). O servidor só autoriza o envio e registra o
  documento.
- Envio que retoma (protocolo TUS, que o Supabase suporta). Como o bucket é privado e não
  podemos criar policy em `storage.objects`, a autorização tem que vir de um **link/token
  assinado emitido pelo servidor**, não da sessão do usuário. **O construtor precisa confirmar**
  que o Supabase aceita envio retomável com token assinado; se não aceitar, ver "Riscos".
- Bucket próprio, privado: `base-arquivos`, com `file_size_limit` e `allowed_mime_types`
  definidos. Caminho do objeto começa por `workspace_id/`.
- Tipos aceitos conferidos **pela extensão e pelo conteúdo** no processamento, não só pelo que
  o navegador declarou.
- Limite por arquivo: 100 MB por padrão, num único lugar do código (constante ou variável de
  ambiente), para subir depois sem caçar números.

### 2. Documento e versões

- Tabela nova **`base_documentos`** (nome final é do construtor): `workspace_id`, nome original,
  tipo, tamanho, caminho no Storage, hash do conteúdo, status, motivo do erro, etapa e progresso
  do processamento, quem enviou, datas, ligado/desligado.
- **Reenviar** um arquivo com o mesmo nome (ou escolher "substituir" na tela) cria uma versão
  nova que é processada **inteira** em segundo plano; só quando ela fica pronta a troca acontece,
  numa única transação (trechos novos entram, velhos saem). Até lá o agente usa a versão antiga.
- Arquivo com o **mesmo hash** de um documento já presente é recusado com aviso.
- **Desligar** um documento tira todos os trechos dele da busca, sem apagar.
- **Excluir** apaga o objeto no Storage e todos os trechos.

### 3. Trechos

- Cada trecho vira **uma linha em `base_conhecimento`**, com uma coluna nova apontando para o
  documento (FK composta com `workspace_id`, como faz `assistente_blocos`). Assim a busca
  híbrida, os índices, o recorte por assistente e a contagem de custo continuam valendo.
  Os cards manuais seguem como linhas sem documento.
- O limite de 4.000 caracteres do card manual é da **tela**, não da tabela; os trechos não
  passam por ele.
- Cada trecho guarda:
  - o **caminho de títulos** de onde veio (ex.: `Almanaque dos Orixás › Ogum › Oferendas`);
  - a **página** (PDF) ou seção, quando houver;
  - a **posição** no documento (ordem), para achar os vizinhos;
  - a identificação da **seção** a que pertence, para ler a seção inteira;
  - a **frase de contexto** gerada por IA;
  - o texto em si.
- O texto que vai para o embedding e para a busca textual é **caminho de títulos + frase de
  contexto + texto**.

**Regras de corte por tipo:**

| Tipo | Estrutura usada |
|---|---|
| `md` | títulos `#`…`######` |
| `docx` | estilos de título do Word (Título 1, 2, …); tabelas viram texto tabular |
| `pdf` | páginas; títulos detectados quando der; quebra de página não corta frase no meio |
| `txt` | parágrafos (linha em branco) |
| `json` | cada objeto/entrada vira texto legível com os nomes dos campos; o caminho de chaves faz o papel de título |
| `csv` | cada linha vira um registro legível com o nome das colunas; registros agrupados até o tamanho do trecho |

- Seção maior que o tamanho de trecho é **recortada de novo** em pedaços menores, sempre em fim
  de parágrafo ou frase, com sobreposição pequena. Todos os pedaços herdam o caminho de títulos.
  (É o caso do verbete de cada orixá.)
- Seção pequena (verbete de erva) é **um trecho só**; não junta verbetes diferentes num trecho.
- Texto sem estrutura nenhuma (transcrição) cai no corte por tamanho em fim de parágrafo/frase.
- Tamanho-alvo e sobreposição são do construtor, ajustáveis numa constante.

### 4. Frase de contexto

- Para cada trecho, uma chamada barata de IA (modelo pequeno da OpenAI, com a mesma chave do
  servidor) gera **uma ou duas frases** situando o trecho no documento, a partir do título do
  documento, do caminho de títulos e do próprio trecho.
- Vale para **todo documento**, de qualquer tipo.
- Custo registrado por `registrarCusto`, aparecendo na tela de custos como o resto.
- Se a geração falhar para um trecho, o trecho entra sem frase (não trava o documento) e a
  falha conta no status.

### 5. Ferramentas do agente

A `buscarBase` atual é substituída/ampliada por:

1. **Busca por significado** (híbrida, como hoje), devolvendo mais que 5 trechos, cada um com
   nome do documento, caminho de títulos e página.
2. **Busca exaustiva por termo**: todos os trechos que contêm o termo (busca textual em
   português), em forma compacta (documento + caminho de títulos + pedaço onde o termo aparece),
   com o **total encontrado** e paginação. É o que responde "quais ervas são de Oxum".
   Se houver mais resultados do que cabe, a ferramenta diz quantos ficaram de fora, e o agente
   avisa que a lista pode não estar completa.
3. **Ler seção / vizinhos**: dado um trecho, devolve a seção inteira a que ele pertence (até um
   teto) ou os trechos anterior e seguinte. É o que responde "que comidas oferecer a Xangô"
   quando o verbete foi recortado.
4. O agente pode chamar essas ferramentas **mais de uma vez** na mesma resposta, dentro dos
   limites de passos e tempo.

As descrições das ferramentas e o prompt do agente devem orientar quando usar cada uma.
Tudo isso continua respeitando o recorte por assistente e o `workspace_id`.

### 6. Citação

- O agente diz de onde tirou a resposta, pelo **nome do documento** e, quando houver, a
  **página** ou a seção. Ex.: "Segundo o Almanaque das Ervas…".
- Nunca mostra identificador interno, caminho de arquivo ou link do Storage.
- O nome exibido é editável na tela (o nome do arquivo pode ser feio).

### 7. Tela

Na página atual da base de conhecimento, uma área de documentos ao lado dos cards:

- soltar/escolher arquivos, com barra de progresso do envio;
- lista de documentos: nome, tipo, tamanho, status, quantidade de trechos, data, motivo do erro;
- ações: renomear, desligar/ligar, substituir, reprocessar, excluir;
- escolher a quais assistentes o documento pertence (mesma ideia do recorte por card);
- ver os trechos de um documento, para conferir como ele foi cortado.

A aparência segue o restante da tela; o desenho exato é do construtor.

## Riscos e pontos a confirmar pelo construtor

- **Envio retomável com bucket privado sem policy.** Se o Supabase não aceitar TUS com token
  assinado, o caminho alternativo é envio assinado padrão (sem retomar) até 100 MB, e isso deve
  ser dito ao usuário antes de seguir — retomar o envio foi um objetivo.
- **Memória e tempo na extração.** Um PDF de 100 MB não pode ser lido inteiro num tick só nem
  segurar o tick. A extração deve ser feita em partes (por faixa de páginas ou por lote de
  trechos), guardando o progresso, e com teto de memória pensado para o container do EasyPanel.
- **Custo da frase de contexto em documento enorme.** Milhares de trechos = milhares de
  chamadas. Mostrar a quantidade de trechos e o custo estimado na tela antes ou durante o
  processamento; o teto de gasto que já existe precisa valer aqui também.
- **Respostas de lista grandes no WhatsApp.** Uma lista de 30 ervas é uma mensagem longa; o
  agente deve resumir ou agrupar em vez de despejar tudo.

## Fica a critério do construtor

- Bibliotecas de extração (ex.: `unpdf` para PDF, `mammoth` para docx), instaladas com `pnpm`.
- Tamanho do trecho, sobreposição, quantos resultados cada ferramenta devolve.
- Modelo da frase de contexto (um modelo pequeno e barato da OpenAI).
- Nomes de tabela, colunas, funções e ferramentas.
- Se a busca exaustiva vira função SQL nova ou parâmetro da atual.
- Ordem das etapas de implementação, desde que cada etapa deixe a suíte verde e o boot de pé.

## Como saber que deu certo

- Os dois almanaques reais (Markdown) enviados numa instalação de teste, e as seis perguntas da
  tabela respondidas corretamente no simulador do agente (`/agentes/testar`), citando a fonte.
- "Quais ervas são de Oxum?" devolve todas as ervas que o almanaque liga a Oxum, ou avisa que a
  lista pode estar incompleta.
- Uma pergunta cuja resposta não está nos arquivos é respondida com "não sei / não encontrei",
  sem invenção.
- Um arquivo de ~100 MB é enviado, a conexão é interrompida no meio, o envio retoma, e o
  documento termina "pronto" sem atrasar respostas do WhatsApp no período.
- Substituir um documento não deixa o agente com trechos misturados em nenhum momento.
- `pnpm build` e `pnpm run test` verdes; migrations aplicadas duas vezes seguidas sem erro.
