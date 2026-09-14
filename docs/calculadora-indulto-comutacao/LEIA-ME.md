# Calculadora de Indulto e Comutação — o que ficou pendente

A calculadora está em `/ferramentas/indulto-comutacao`, dentro do CRM. O código vive em
`src/lib/indulto-comutacao/` (os motores por decreto) e `src/app/(app)/ferramentas/` (as telas).

Esta pasta guarda o que **não** cabia no código: o que ficou por decidir, o que ficou por testar, e o
que conferir antes de plugar um decreto novo.

| Arquivo | Para quê |
|---|---|
| [`pendencias-e-roteiro-de-teste.md`](pendencias-e-roteiro-de-teste.md) | **Comece por aqui.** As decisões jurídicas e de LGPD que são do dono do produto, o roteiro de 10 testes para rodar com o CRM no ar, e os pontos menores que ficaram para depois |
| [`fronteira-rsc.md`](fronteira-rsc.md) | **Leia antes de mexer nos componentes.** O defeito de 14/09/2026 que derrubou `/novo` e `/[id]` com 500, a regra de serialização servidor→cliente que o causou, e a guarda que impede a volta |
| [`verificacoes-de-conjunto.md`](verificacoes-de-conjunto.md) | O que conferir quando alguém mexer na calculadora — inclui **o que a folha de impressão leva ao anexo de petição e por quê**, que mudou em 14/09/2026 — em especial ao acrescentar o decreto de 2024 ou de 2026 |

Documentos de origem, versionados junto:

- **Spec:** [`../superpowers/specs/2026-09-12-calculadora-indulto-comutacao-design.md`](../superpowers/specs/2026-09-12-calculadora-indulto-comutacao-design.md)
- **Plano:** [`../superpowers/plans/2026-09-12-calculadora-indulto-comutacao.md`](../superpowers/plans/2026-09-12-calculadora-indulto-comutacao.md)
- **Validação contra a planilha original:** [`../../validacao/README.md`](../../validacao/README.md)

## As três coisas mais urgentes

1. **O Art. 13 nega comutação a quem cumpriu exatamente a fração.** A planilha usa comparação
   estrita; o texto do artigo diz "que tenham cumprido um quinto". O motor segue fiel à planilha e
   exibe o ponto ao advogado. **Decisão jurídica pendente** — se for erro, a correção é um caractere,
   e o cenário de teste já existe.
2. **Dois defeitos da ferramenta que está no ar** foram encontrados pela validação e corrigidos no
   motor novo, mas continuam na versão antiga: o campo de justiça restaurativa que a tela nunca
   perguntava, e a fórmula `G149` da planilha, que esconde uma comutação de 2/3 devida.
3. **Nada foi testado logado.** Não havia Supabase na máquina onde isto foi construído. O roteiro de
   10 testes é o primeiro passo quando o CRM subir.
