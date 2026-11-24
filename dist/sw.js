const CACHE_NAME = 'billiards-pwa-v3'

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './favicon.ico',
  './three_core.js',
  './three_module.js',
  './three_examples.js',
  './messaging.js',
  './index.js',
  './css/fonts.css',
  './css/index.css',
  './css/aiminputs.css',
  './css/powerinput.css',
  './css/notification.css',
  './css/tray.css',
  './css/chat.css',
  './css/lobby.css',
  './css/menu.css',
  './css/wood.css',
  './assets/fonts/exo-200.ttf',
  './assets/fonts/exo-600.ttf',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/wave.jpg',
  './models/p8.min.gltf',
  './models/p8.min.bin',
  './models/threecushion.min.gltf',
  './models/threecushion.min.bin',
  './models/snooker.min.gltf',
  './models/snooker.min.bin',
  './models/background.gltf',
  './models/background.bin',
  './sounds/ballcollision.ogg',
  './sounds/cue.ogg',
  './sounds/cushion.ogg',
  './sounds/pot.ogg',
  './sounds/success.ogg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to cache: ${url}`, err)
            })
          )
        )
      })
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('billiards-pwa-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      })
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return
  }

  const url = new URL(event.request.url)

  // Bypass and fail-safe external telemetry/shortener services when offline
  if (
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('vercel.app')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    return
  }

  // Same-origin and static assets: Cache-First strategy with network fallback
  event.respondWith(
    caches.match(event.request, { ignoreSearch: false }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (url.protocol === 'http:' || url.protocol === 'https:')
          ) {
            const responseToCache = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return networkResponse
        })
        .catch(() => {
          // If navigation request fails while offline, serve index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html')
          }
          return new Response('Offline resource unavailable', {
            status: 503,
            statusText: 'Service Unavailable'
          })
        })
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
