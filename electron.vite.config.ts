import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __GOOGLE_CLIENT_ID__: JSON.stringify(env.GOOGLE_CLIENT_ID || ''),
        __GOOGLE_CLIENT_SECRET__: JSON.stringify(env.GOOGLE_CLIENT_SECRET || ''),
      },
      build: {
        rollupOptions: {
          external: ['better-sqlite3']
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      root: resolve('src/renderer'),
      build: {
        rollupOptions: {
          input: resolve('src/renderer/index.html')
        }
      },
      plugins: [react()]
    }
  }
})
