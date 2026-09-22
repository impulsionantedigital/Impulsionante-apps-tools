# Task 8: Componente Resultado + Tabulações de Duração

## Status: ✅ Concluído

### Deliverables

**Arquivo criado:**
- `src/app/(app)/ferramentas/detracao/[calculadora]/Resultado.tsx`

### Implementação

O componente `Resultado.tsx` foi criado com as seguintes características:

#### Exports
- React component: `<Resultado resultado, deDados>`
- Props interface:
  - `resultado: ResultadoCalculo` — resultado do cálculo de detração
  - `deDados: (s: string) => void` — callback para expandir/colapsar seções

#### Estrutura do componente
1. **Destaque de dias de detração:**
   - Número grande: `{resultado.diasDetracao}` dias
   - Rótulo com saldo: `{resultado.saldoHoras}`
   - CSS: `estilos.destaque`, `estilos.numero`, `estilos.rotuloNumero`

2. **Linha de horas totais:**
   - Exibe `totalHoras` e `totalMinutos`
   - Usa definição de lista (`dl/dt/dd`) com classe `estilos.metricas`

3. **Seção colapsável "Intervalos consolidados":**
   - Implementada com `useState` para controlar abertura/fechamento
   - Ícone `ChevronDown` com rotação animada
   - Tabela com colunas:
     - Data/Hora de Início (formatada com `formatarInstante()`)
     - Data/Hora de Fim (formatada com `formatarInstante()`)
     - Duração (calculada em horas e minutos)
   - CSS: `estilos.memoria` para a seção colapsável

#### Funcionalidades
- **formatarInstante()**: Importada de `intervalos.ts` (Task 1) para exibir datas/horas
- **paraInstante()**: Importada de `intervalos.ts` para parsing de timestamps
- **Cálculo de duração**: Função auxiliar `calcularDuracao()` converte ms para "Xh Ymin"
- **Callback deDados()**: Invocada ao toggle de intervalos, permitindo tracking de expansão/colapso

#### CSS
- Todas as classes importadas de `calculadora.module.css` (Task 7)
- Inline styles apenas para estados de animação (rotação do ícone) e tabela (borders, padding)
- Design responsivo com cores e tokens do sistema (variáveis CSS: `--tinta`, `--tinta-2`, `--tinta-3`, `--linha`, etc.)

### Verificação de tipos

```
pnpm exec tsc --noEmit
```

✅ **Resultado:** Sem erros (0 issues)

### Imports utilizados
- `'use client'` — componente client React
- `lucide-react`: `ChevronDown`
- `react`: `useState`
- `@/lib/detracao/recolhimento-noturno/tipos`: `Intervalo`, `ResultadoCalculo`
- `@/lib/detracao/recolhimento-noturno/intervalos`: `formatarInstante`, `paraInstante`
- `./calculadora.module.css`: estilos

### Notas de implementação
- O componente não requer testes de runtime (é UI puro)
- A tabela de intervalos consolidados é renderizada apenas quando a seção está aberta
- O estado colapsável (`abertaIntervalos`) é local ao componente
- O callback `deDados()` permite integração com tracking/analytics externo
