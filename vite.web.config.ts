// Vite config for standalone web app build
// Builds the React frontend WITHOUT Electron dependencies
// Uses web-main.tsx as entry point (sets up Supabase-backed window.api)

import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  publicDir: resolve('src/renderer/public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('src/renderer/web.html')
    }
  },
  define: {
    // Ensure import.meta.env variables are available
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || '')
  }
})
