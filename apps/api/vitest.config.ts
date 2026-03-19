import { defineConfig } from 'vitest/config';
// vitest 2.x

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/db/migrations/**'],
      reporter: ['text', 'json-summary'],
    },
  },
});
