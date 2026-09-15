# Task 15: Testes de Contrato — Reconciliação Catálogo ↔ Motor ↔ Rotas

**Status:** ✅ Concluído

## Arquivo Criado

- `tests/detracao/recolhimento-noturno/contrato.spec.ts` (74 linhas)

## Casos de Teste Implementados

Todos os 7 casos de teste do plano (§15) foram implementados e passaram:

1. **Test 1:** Catálogo tem produto detracao-recolhimento-noturno
   - Valida que PRODUTOS contém o objeto com id, slug e familia corretos

2. **Test 2:** caminhoDoProduto retorna rota detracao para familia detracao
   - Verifica que a função retorna `/ferramentas/detracao/recolhimento-noturno`

3. **Test 3:** produtoPorSlug resolve recolhimento-noturno → id
   - Valida que o lookup de slug retorna o id correto

4. **Test 4:** algoritmoVersao matches RN-1.0
   - Verifica a constante de versão do algoritmo

5. **Test 5:** Motor calcular is importable and callable
   - Valida que a função calcular é importável e executável

6. **Test 6:** preparar (validation) is importable and callable
   - Valida que a função preparar de validação é importável e executável

7. **Test 7:** Nenhum motor genérico (motorPorId equiv) — arquitetura independente
   - Verifica que recolhimento-noturno é hardcoded (não usa motorPorId)
   - Executa um cálculo real para validar que o motor funciona corretamente
   - Valida resultado com 1440 minutos = 1 dia e versão RN-1.0

## Resultados de Execução

### Testes Unitários
```
Test Files  1 passed (1)
     Tests  7 passed (7)
  Start at  11:48:32
  Duration  224ms (transform 93ms, setup 0ms, import 138ms, tests 3ms, environment 0ms)
```

### Type Check
```
pnpm exec tsc --noEmit
(sem erros)
```

## Reconciliação Validada

O teste garante que:
- ✅ Catálogo (`PRODUTOS`) conhece o produto
- ✅ Roteador (`caminhoDoProduto`) mapeia slug → rota correta
- ✅ Lookup (`produtoPorSlug`) resolve slug → id
- ✅ Versão (`ALGORITMO_VERSAO`) está correta (RN-1.0)
- ✅ Motor (`calcular`) é importável e funciona
- ✅ Validador (`preparar`) é importável e executável
- ✅ Arquitetura é independente (sem dispatch genérico)

## Commits

```
commit: CO-AUTHORED by Claude Haiku 4.5
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```
