import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@app-sync': fileURLToPath(new URL(mode === 'desktop' ? './src/hooks/useLocalOnlySync.ts' : './src/hooks/useSuiteSync.ts', import.meta.url)),
    },
  },
  base: process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
}))
