# Detração por Recolhimento Noturno — o que conferir antes de mexer

A calculadora está em `/ferramentas/detracao/recolhimento-noturno`. O código do motor vive em
`src/lib/detracao/recolhimento-noturno/` e as telas em
`src/app/(app)/ferramentas/detracao/[calculadora]/`.

## A folha de impressão — o que o anexo leva, e por quê (16/09/2026)

> Leia antes de mexer em `@media print`, na `Calculadora`, no `Resumo` ou no `CabecalhoAnexo`.

O destino do resultado é anexo de petição. Quem manda no que sai é o CSS, não o React — a mesma
regra do CIC, documentada em
[`../../calculadora-indulto-comutacao/verificacoes-de-conjunto.md`](../../calculadora-indulto-comutacao/verificacoes-de-conjunto.md).

| Elemento | Na tela | No papel |
|---|---|---|
| Formulário (coluna esquerda) | visível | oculto |
| Barra de salvar, imprimir, excluir, voltar | visível | oculto |
| `CabecalhoAnexo` — identificação, protocolo e data | **oculto** | **visível** |
| `Resultado` — destaque e memória de cálculo | visível | oculto |
| `Resumo` — total, saldo, datas, categorias | visível | visível |
| Observações (texto livre) | visível | **oculto** |

**O defeito que isto conserta.** Até 16/09/2026 a folha saía com o formulário oculto, o `.painel`
escondido e o `Resumo` mostrando a composição por categoria — **e sem o total apurado em lugar
nenhum**. Quem imprimia para anexar à petição levava datas, horas por categoria e nenhum número de
dias. O total vivia só no `Resultado`, que é justamente o que não vai ao papel. Por isso o `Resumo`
passou a abrir com **"Você tem N dias de detração"**.

Três decisões que não são óbvias e que um revisor tende a desfazer:

1. **O `.painel` fica oculto de propósito, mesmo tendo o mesmo número.** A memória de cálculo é
   conferência de TELA — dezenas de linhas de `timestamp` que inflam o anexo sem dizer nada ao
   juízo. Quem imprime quer o número e como ele se compõe, não o log. Tirar o `.painel` do
   `display: none` faz o anexo dobrar de tamanho sem acrescentar informação.
2. **O destaque do total no `Resumo` é um `<b>` dentro do texto, com `<style>` inline — não um
   `<b class="numero">` grande.** O tamanho é só desta tela (a classe vem do CSS Modules e o nome
   tem hash, então não dá para estilizá-lo de fora); assim o número continua saindo no papel mesmo
   se a folha de estilo não carregar, que é o defeito que este bloco existe para impedir.
3. **As observações ficam ocultas na impressão.** Ao contrário das respostas do CIC — que são
   escolhas do questionário e o usuário pediu que fossem —, este campo é texto LIVRE do advogado.
   O anexo acompanha a petição, que é assinada, e rascunho não vai assinado.
4. **A data do anexo é fixada num `useEffect`.** `new Date()` no corpo do componente daria um valor
   no servidor e outro no navegador, e o React acusaria divergência de hidratação.

## Como verificar sem imprimir

Emule a mídia no navegador e compare o texto, não o `display`:

```js
await page.emulateMedia({ media: 'print' })
const noPapel = await page.locator('body').innerText()
```

**Não use `getComputedStyle(filho).display` para decidir se algo saiu no papel:** num filho de um
elemento `display: none` ele devolve o display do próprio filho, e faz tudo parecer visível. Meça
`getBoundingClientRect().height`, ou leia o texto do `body` — que é o que o juiz vai receber.

**Verificação de 16/09/2026**, contra o banco de produção, com um mês de recolhimento noturno das
22h às 06h em todos os dias: tela e papel devolveram o mesmo **"Você tem 9 dias de detração"**
(218h computadas: 24 datas úteis + 8 de fim de semana, saldo de 2h), zero erros de console.

## Rodar esta tela localmente
⚠️ **`pnpm start` não serve esta build.** A configuração é `output: standalone`, e o `next start`
avisa: *"'next start' does not work with 'output: standalone' configuration"* — os chunks dão 404 e
a página **não monta** (o `Resumo` e o `CabecalhoAnexo` ficam invisíveis e parece defeito do seu
código). Para conferir de verdade, use `pnpm dev`, que é o que a verificação acima usou. Se
precisar da build de produção, sirva com `node .next/standalone/server.js` **e** copie
`.next/static` para dentro do standalone, que é o passo que o `pnpm start` faria.
