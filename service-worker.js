// Minimal Service Worker for PWA Installation
const CACHE_NAME = 'notification-viewer-v2.1.0';
const STATIC_CACHE = 'static-cache-v2.1.0';

// Essential files to cache for offline functionality
// Essential files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/browserconfig.xml',
  // Critical icons for offline functionality
  '/icons/android/android-launchericon-192-192.png',
  '/icons/android/android-launchericon-512-512.png',
  '/icons/ios/180.png',
  '/icons/ios/32.png',
  '/icons/ios/16.png',
  // External dependencies that are critical
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/mqtt/5.7.0/mqtt.min.js'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('📦 Caching static assets');
        // Cache essential files, but don't fail if some external resources fail
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn('⚠️ Failed to cache:', url, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('✅ Service Worker installed successfully');
      })
      .catch((error) => {
        console.error('❌ Service Worker installation failed:', error);
      })
  );
});

// Activate event - take control and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
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
    }).catch((error) => {
      console.error('❌ Service Worker activation failed:', error);
    })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip MQTT WebSocket connections
  if (url.protocol.startsWith('ws')) {
    return;
  }
  
  event.respondWith(
    handleFetch(request)
  );
});

async function handleFetch(request) {
  const url = new URL(request.url);
  
  try {
    // For the main document, try network first, then cache
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        // Cache successful responses
        if (response.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Network failed, try cache
        const cached = await caches.match('/index.html');
        if (cached) {
          return cached;
        }
        // Return a basic offline page
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Offline - Morph Messaging</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui; text-align: center; padding: 2rem; }
              .offline { color: #666; }
            </style>
          </head>
          <body>
            <h1>📡 Offline</h1>
            <p class="offline">You're currently offline. Please check your connection and try again.</p>
            <button onclick="location.reload()">🔄 Retry</button>
          </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    
    // For static assets, try cache first, then network
    const cached = await caches.match(request);
    if (cached) {
      // Serve from cache, but update in background
      fetch(request).then(response => {
        if (response.status === 200) {
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, response);
          });
        }
      }).catch(() => {
        // Network failed, but we have cache
      });
      return cached;
    }
    
    // Not in cache, try network
    const response = await fetch(request);
    
    // Cache successful responses for static assets
    if (response.status === 200 && (
      url.hostname === location.hostname ||
      url.hostname === 'cdn.tailwindcss.com' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'cdnjs.cloudflare.com'
    )) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.error('Fetch failed:', error);
    
    // Return cached version if available
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    // Return a simple error response
    return new Response('Network error occurred', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('📨 Push notification received');
  
  let notificationData = {
    title: 'Morph Messaging',
    body: 'New notification received',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: 'default',
    data: {}
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.body || data.message || notificationData.body,
        icon: data.icon || notificationData.icon,
        tag: data.tag || `notification-${Date.now()}`,
        data: data,
        actions: [
          {
            action: 'open',
            title: '👁️ View',
            icon: '/icons/icon-96.png'
          },
          {
            action: 'dismiss',
            title: '❌ Dismiss',
            icon: '/icons/icon-96.png'
          }
        ],
        requireInteraction: data.priority === 'high',
        silent: data.priority === 'low'
      };
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Default action or 'open'
  let urlToOpen = '/';
  
  if (event.notification.data) {
    const data = event.notification.data;
    if (data.notificationId) {
      urlToOpen = `/?notification=${data.notificationId}`;
    } else if (data.jobOrderId) {
      urlToOpen = `/?joborder=${data.jobOrderId}`;
    }
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Check if app is already open
        for (const client of clients) {
          if (client.url.includes(urlToOpen.split('?')[0])) {
            return client.focus().then(() => {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: event.notification.data,
                url: urlToOpen
              });
            });
          }
        }
        // Open new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  // Ignore extension messages and other non-app messages
  if (!event.data || typeof event.data !== 'object' || !event.data.type) {
    return;
  }
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLAIM_CLIENTS':
      self.clients.claim();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        version: CACHE_NAME,
        timestamp: new Date().toISOString()
      });
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

// Global error handling
self.addEventListener('error', (event) => {
  console.error('💥 Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('💥 Unhandled promise rejection in SW:', event.reason);
});

console.log('🚀 Service Worker script loaded - v' + CACHE_NAME);