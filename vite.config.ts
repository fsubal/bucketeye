import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Web（React SPA）のビルド設定。サーバは esbuild で別にバンドルする（package.json の build:server）
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 開発時は Hono（3000）に API を流す。本番は Hono が dist/web を配信するので同一オリジン
    proxy: {
      '/api': 'http://localhost:3000',
      '/up': 'http://localhost:3000',
    },
  },
  test: {
    // サーバ側は node、コンポーネントは各テストファイル先頭の `// @vitest-environment jsdom` で切り替える
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
