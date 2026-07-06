// Nexus PWA Service Worker
// Caches app shell for offline access + handles push notifications

/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'nexus-v1'
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
]

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  )
  self.clients.claim()
})

// Fetch — network first, cache fallback for navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  // API calls (Supabase) — network only
  if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return

  // App shell — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // For navigation requests, serve the app shell
          if (event.request.mode === 'navigate') {
            return caches.match('/')
          }
          return new Response('Offline', { status: 503 })
        })
      })
  )
})

// --- Push Notifications ---

// Handle incoming push messages
self.addEventListener('push', (event) => {
  let data = { title: 'Nexus', body: 'You have a notification', tag: 'nexus-default' }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'nexus-default',
    data: data,
    actions: [
      { action: 'open', title: 'Open Nexus' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [100, 50, 100]
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  // Navigate to the relevant page
  const urlPath = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(urlPath)
          return
        }
      }
      // Open new window
      return self.clients.openWindow(urlPath)
    })
  )
})
