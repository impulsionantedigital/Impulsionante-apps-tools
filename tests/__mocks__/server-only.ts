// O pacote `server-only` existe para quebrar o build quando um módulo de servidor
// é importado pelo cliente. Sob teste isso não se aplica: o alias do vitest.config.ts
// aponta para este arquivo vazio de propósito.
export {}
