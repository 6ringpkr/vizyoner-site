// Service Worker for Morph Messaging PWA - Simplified and Working Version
console.log('🚀 Service Worker script loaded');

self.addEventListener('install', event => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(onInstall(event));
});

async function onInstall(event) {
    console.info('Installing Service Worker...');
    // Skip waiting to activate immediately
    self.skipWaiting();
}

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker activating...');
    event.waitUntil(
        self.clients.claim().then(() => {
            console.log('✅ Service Worker activated and claimed clients');
            
            // Notify all clients about activation
            return self.clients.matchAll();
        }).then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'SW_ACTIVATED',
                    message: 'Service Worker activated successfully'
                });
            });
        })
    );
});

// Push notifications handler
self.addEventListener('push', event => {
    console.log('📨 Push notification received');
    
    let notificationData = {
        title: 'Morph Portal',
        body: 'New notification received',
        icon: 'favicon.ico',
        badge: '/icons/android/android-launchericon-96-96.png',
        vibrate: [100, 50, 100],
        data: { url: '/' },
        tag: 'default',
        requireInteraction: false,
        actions: [
            {
                action: 'open',
                title: '👁️ View'
            },
            {
                action: 'dismiss',
                title: '❌ Dismiss'
            }
        ]
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            console.log('📨 Push data:', payload);
            
            notificationData = {
                ...notificationData,
                title: payload.title || 'Morph Portal',
                body: payload.message || payload.body || 'New notification received',
                icon: payload.icon || 'favicon.ico',
                data: { 
                    url: payload.url || '/',
                    ...payload
                },
                tag: payload.tag || `notification-${Date.now()}`,
                requireInteraction: payload.priority === 'high',
                vibrate: payload.priority === 'high' ? [300, 100, 300, 100, 300] : [100, 50, 100]
            };
            
        } catch (error) {
            console.error('Error parsing push data:', error);
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    console.log('🔔 Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'dismiss') {
        return;
    }
    
    // Get URL from notification data
    const url = event.notification.data.url || '/';
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // Check if app is already open
                for (const client of clients) {
                    if (client.url.includes(url.split('?')[0]) || client.url === new URL(url, self.location.origin).href) {
                        return client.focus().then(() => {
                            client.postMessage({
                                type: 'NOTIFICATION_CLICKED',
                                data: event.notification.data,
                                url: url
                            });
                        });
                    }
                }
                // Open new window if no matching client found
                return self.clients.openWindow(url);
            })
    );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
    console.log('🔔 Notification closed:', event.notification.tag);
    
    // Send message to clients about notification dismissal
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NOTIFICATION_DISMISSED',
                tag: event.notification.tag,
                data: event.notification.data
            });
        });
    });
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object' || !event.data.type) {
        return;
    }
    
    const { type, data } = event.data;
    console.log('📨 Message received:', type);
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLAIM_CLIENTS':
            self.clients.claim();
            break;
            
        case 'GET_VERSION':
            event.ports[0]?.postMessage({
                version: 'morph-messaging-simplified-v1.0.0',
                timestamp: new Date().toISOString()
            });
            break;
            
        case 'TEST_NOTIFICATION':
            // Test notification functionality
            self.registration.showNotification('Test Notification', {
                body: 'This is a test notification from the service worker',
                icon: 'favicon.ico',
                tag: 'test',
                data: { url: '/', test: true },
                actions: [
                    { action: 'open', title: 'Open' },
                    { action: 'dismiss', title: 'Dismiss' }
                ]
            });
            break;
            
        default:
            console.log('Unknown message type:', type);
    }
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', (event) => {
    console.log('📱 Push subscription changed');
    
    event.waitUntil(
        // Notify clients about subscription change
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'PUSH_SUBSCRIPTION_CHANGED',
                    message: 'Push subscription changed - please resubscribe'
                });
            });
        })
    );
});

// Basic fetch handler for offline support (optional)
self.addEventListener('fetch', (event) => {
    // Only handle navigation requests for basic offline support
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Return a simple offline page
                return new Response(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Offline - Morph Portal</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                            body { 
                                font-family: system-ui; 
                                text-align: center; 
                                padding: 2rem; 
                                max-width: 400px; 
                                margin: 0 auto;
                            }
                            .offline { color: #666; margin: 2rem 0; }
                            .icon { font-size: 4rem; margin-bottom: 1rem; }
                            button {
                                background: #3b82f6;
                                color: white;
                                border: none;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="icon">📡</div>
                        <h1>You're Offline</h1>
                        <p class="offline">No internet connection detected.</p>
                        <button onclick="location.reload()">🔄 Retry</button>
                    </body>
                    </html>
                `, {
                    headers: { 'Content-Type': 'text/html' }
                });
            })
        );
    }
});

// Global error handling
self.addEventListener('error', (event) => {
    console.error('💥 Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Unhandled promise rejection in SW:', event.reason);
});

console.log('✅ Service Worker script loaded successfully');