import { defineConfig } from 'vitest/config'

// Pure-logic unit tests run in a Node environment — no Svelte compilation or DOM
// needed for the modules under test (table-query, table-list, studio-tabs, format-sql).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
