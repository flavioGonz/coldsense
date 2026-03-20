const CACHE_NAME = 'coldsense-pwa-v1';
const ASSETS = [
    '/pwa',
    '/style.css',
    '/client.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap',
    'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    // DO NOT cache API calls or Socket.IO
    if (e.request.url.includes('/api/') || e.request.url.includes('socket.io')) {
        return e.respondWith(fetch(e.request).catch(() => {
            return new Response(JSON.stringify({ error: 'Offline - No connection to SaaS Core' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }));
    }

    e.respondWith(
        caches.match(e.request).then(response => {
            return response || fetch(e.request).catch(err => {
                console.warn('📡 [PWA] Offline: Request failed:', e.request.url);
                return caches.match('/pwa'); // Fallback to main page if offline
            });
        })
    );
});

// PUSH NOTIFICATIONS
self.addEventListener('push', (e) => {
    const data = e.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/2322/2322701.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2322/2322701.png',
        vibrate: [200, 100, 200],
        data: { url: '/pwa' }
    });
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow(e.notification.data.url));
});
