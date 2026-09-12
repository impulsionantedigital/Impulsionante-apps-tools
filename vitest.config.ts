import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.spec.ts'], passWithNoTests: true },
  resolve: {
    alias: {
      
      
      
      '@awave/custom/servidor': fileURLToPath(new URL('./src/custom-sdk/servidor.ts', import.meta.url)),
      '@awave/custom/ui': fileURLToPath(new URL('./src/custom-sdk/ui.ts', import.meta.url)),
      '@awave/custom': fileURLToPath(new URL('./src/custom-sdk/index.ts', import.meta.url)),
      '@custom': fileURLToPath(new URL('./custom', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@platform': fileURLToPath(new URL('./platform', import.meta.url)),
      
      'server-only': fileURLToPath(new URL('./tests/__mocks__/server-only.ts', import.meta.url)),
    },
  },
})
