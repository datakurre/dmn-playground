/**
 * Service Worker for DMN Playground PWA.
 *
 * Provides offline support by caching the application shell and assets.
 * Uses a cache-first strategy for static assets and network-first for
 * the HTML shell to ensure updates are picked up.
 */

const CACHE_NAME = 'dmn-playground-v1';

/**
 * Assets to pre-cache during installation.
 * The actual file list will be populated by the build process;
 * these are the minimum required for the app shell.
 */
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json'];

// ── Install ─────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
  // Activate immediately
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
    }),
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) return;

  // Navigation requests: network-first (to pick up updates)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(request));
});

/**
 * Network-first strategy: try network, fall back to cache.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/**
 * Cache-first strategy: try cache, fall back to network.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
