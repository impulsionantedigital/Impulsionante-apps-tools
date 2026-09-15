# Task 12 — Documentação de Lógica Versionada

**Status:** ✅ CONCLUÍDO

## Arquivo criado

- **Caminho:** `docs/detracao-recolhimento-noturno/logica.md`
- **Tamanho:** ~6.5 KB
- **Formato:** Markdown puro, sem frontmatter de código

## Estrutura entregue (conforme plano §8)

1. **Header**: Título "Calculadora de Detração por Recolhimento Noturno — Lógica v1.0" com referência à spec técnica.

2. **Base Jurídica**:
   - Tema Repetitivo STJ 1.155 e REsp 1.977.135/SC
   - Monitoramento eletrônico: metadado, não condição matemática
   - Conversão: `dias = floor(total_minutos / 1440)`, saldo não arredonda
   - Descumprimento exclui, mas nunca por presunção automática

3. **Modelo de Dados**:
   - `Intervalo` (tipo com início/fim exclusivo)
   - `SegmentoRegra` (janela, horários, dias, feriados, intervalos adicionais/excluídos)
   - `EntradaCalculo` (timezone, segmentos, metadados)
   - `ResultadoCalculo` (totais, dias, saldo, intervalos consolidados/excluídos, versão)

4. **Algoritmo**:
   - Validação de entrada (datas, horários, rejeição de `00:00–00:00` como ambíguo)
   - Geração de intervalos por segmento (noturno + folga + adicionais)
   - Recorte pela janela
   - Subtração de exclusões
   - Merge de sobreposições
   - Cálculo de dias + saldo

5. **Casos de Borda**:
   - `00:00–00:00` rejeitado
   - Duração sempre inteira
   - Fim exclusivo `[início, fim)`
   - Timezone configurável
   - Intervalo vazio descartado
   - Segmento sem dias aplicáveis gera zero minutos

6. **Histórico de Versões**:
   - **RN-1.0** (2026-09-15): Versão inicial, conforme especificação técnica

## Pontos de legibilidade

- ✅ Índice curto (5 seções + histórico)
- ✅ Linguagem acessível: menciona conceitos jurídicos (Tema 1.155, REsp) e operacionais (fórmula, casos de borda) em tom neutro
- ✅ Exemplos estruturais de tipos de dados (sem código real)
- ✅ Referência cruzada com spec técnica (`design.md`)
- ✅ Seção "Como Usar" para auditoria, mudanças futuras e treinamento

## Nenhuma compilação necessária

Documento é puro markdown, não requer validação de código.

## Commits associados

Fará parte do commit de finalização da Task 12 com mensagem:

```
docs(detracao): documentação de lógica versionada do motor de recolhimento noturno
```

---

**Tempo decorrido:** ~10 min  
**Data:** 2026-09-15  
**Agente:** Claude Haiku 4.5
