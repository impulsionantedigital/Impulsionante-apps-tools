# Task 9: Página de Lista de Cálculos — Relatório

**Data:** 2026-09-15  
**Status:** ✅ Concluído  

## Deliverables Criados

### 1. Arquivo Principal
- **`src/app/(app)/ferramentas/detracao/[calculadora]/page.tsx`**
  - Server component assíncrono
  - Chama `listarCalculos('recolhimento-noturno')`
  - Renderiza título "Cálculos de Recolhimento Noturno"
  - Renderiza botão "Novo Cálculo" (variante primária)
  - Mostra placeholder "Nenhum cálculo ainda" quando vazio
  - Renderiza tabela com colunas: título, última atualização, ações

### 2. Componente Cliente
- **`src/app/(app)/ferramentas/detracao/[calculadora]/BotaoExcluirCalculo.tsx`**
  - Componente `'use client'`
  - Renderiza botão com ícone de lixeira
  - Chama `excluirCalculo(id)` ao clicar
  - Recarrega página após exclusão bem-sucedida
  - Mostra mensagem de erro se falhar

### 3. Estilos
- **`src/app/(app)/ferramentas/detracao/[calculadora]/lista-calculos.module.css`**
  - Estilos de tabela com padrão de painel (`--superficie`, `--linha`)
  - Hover effects nas linhas
  - Links com cor de acento
  - Layout responsivo para mobile

## Estrutura da Página

```
[Page Component]
├─ CabecalhoPagina
│  ├─ Título: "Cálculos de Recolhimento Noturno"
│  ├─ Subtítulo: "Gerencie seus cálculos..."
│  └─ Ação: Botão "Novo Cálculo"
│
├─ [Se vazio] EstadoVazio
│  └─ Mostra: "Nenhum cálculo ainda"
│
└─ [Se com dados] Tabela
   ├─ Coluna 1: Título (link para edição)
   ├─ Coluna 2: Última atualização (data formatada)
   └─ Coluna 3: Ações
      ├─ Botão "Editar" (navega para ${id})
      └─ Botão "Excluir" (client-side)
```

## Verificação de Tipos

```bash
$ pnpm exec tsc --noEmit
# ✅ Passou: zero erros
```

## Assinatura de Tipo

```typescript
export default async function ListaCalculos({
  params,
}: {
  params: { calculadora: string }
}): Promise<React.ReactNode>
```

Nota: O parâmetro `calculadora` é fornecido pelo Next.js (rota `[calculadora]`), mas é ignorado na implementação pois o decreto é fixo em `'recolhimento-noturno'`.

## Integração com Task 6

- ✅ Importa `listarCalculos()` de `../../[calculadora]/calculos`
- ✅ Importa `excluirCalculo()` de `../../[calculadora]/acoes`
- ✅ Importa tipo `CalculoResumo`
- ✅ Funciona com decreto específico: `'recolhimento-noturno'`

## Rotas Geradas

A implementação cria automáticamente suporte para:
- `GET /ferramentas/detracao/recolhimento-noturno` → Lista
- `GET /ferramentas/detracao/recolhimento-noturno/novo` → Novo cálculo (não implementado aqui)
- `GET /ferramentas/detracao/recolhimento-noturno/[id]` → Editar cálculo (não implementado aqui)

## Notas de Implementação

1. **Formato de Data**: Usa `formatarDataHora()` da lib padrão do projeto
2. **Componente de UI**: Segue padrão de tokens CSS (`--superficie`, `--linha`, `--r-painel`)
3. **Exclusão**: Client-side com `useTransition()` e recarregamento da página
4. **Acessibilidade**: Tabela semântica com `<thead>` e `<tbody>`
5. **Responsividade**: Reduz padding em telas menores (< 768px)
