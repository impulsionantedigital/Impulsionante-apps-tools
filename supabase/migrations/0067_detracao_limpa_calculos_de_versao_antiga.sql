-- 0067_detracao_limpa_calculos_de_versao_antiga.sql
--
-- Apaga os cálculos de detração gravados em versões ANTERIORES à atual (RN-2.0).
--
-- ⚠️ POR QUE ISTO É SEGURO AQUI, E NÃO SERIA EM GERAL: os cálculos existentes são de TESTE, e o
-- dono da instalação autorizou a limpeza. A regra geral do produto é o oposto — cálculo salvo é
-- DOCUMENTO e pode ter virado petição protocolada, e por isso o motor passou a ser versionado e
-- congelado (`src/lib/detracao/recolhimento-noturno/versoes/`), justamente para não perder nenhum.
-- Não replique este DELETE em outras tabelas sem a mesma autorização explícita.
--
-- Por que apagar em vez de migrar a entrada: a RN-2.0 mudou o formato do segmento (janela de
-- instantes → par de datas). Converter a entrada conserta a tela mas PERDE o documento — o número
-- que passaria a aparecer é o da fórmula nova, e o antigo não teria como ser reconstruído. Com os
-- dados de teste removidos, nenhuma conversão é necessária e a estrutura fica limpa: cada versão
-- tem o seu formulário e o seu motor congelados, sem ponte entre eles.
--
-- 🔴 ADITIVA E IDEMPOTENTE, como toda migration daqui: o CRM reaplica no boot qualquer migration
-- que não encontre registrada, então esta instrução aguenta rodar duas vezes (o segundo DELETE
-- simplesmente não encontra nada).
--
-- Escopo: só a calculadora de recolhimento noturno (`calculo_tipo`), e só fora da versão atual.
-- Os cálculos de indulto/comutação NÃO são tocados — são de outra tabela e de outro domínio.

delete from public.detracao_calculos
where calculo_tipo = 'recolhimento-noturno'
  and algoritmo_versao <> 'RN-2.0';
