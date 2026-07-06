import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'test/**/*.test.ts'],
    globals: true,
  },
})
