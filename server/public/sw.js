const CACHE_NAME = 'coldsense-pwa-v1';
const ASSETS = [
    '/pwa',
    '/style.css',
    '/client.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap',
    'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
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
