// Web app entry point
// Sets up window.api with Supabase-backed implementation
// then renders the same React app as the Electron version

import React from 'react'
import ReactDOM from 'react-dom/client'
import { createWebApi } from './lib/web-api'
import App from './App'
import './globals.css'

// Polyfill window.api for web — replaces Electron IPC with Supabase calls
;(window as unknown as Record<string, unknown>).api = createWebApi()

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — app still works
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
