// Service Worker for Morph Messaging PWA with Push Notifications
const CACHE_NAME = 'morph-messaging-v2.2.0';
const STATIC_CACHE = 'static-cache-v2.2.0';

// Essential files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
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
              body { 
                font-family: system-ui; 
                text-align: center; 
                padding: 2rem; 
                max-width: 400px; 
                margin: 0 auto;
                background: #f8fafc;
              }
              .offline { 
                color: #666; 
                margin: 2rem 0;
              }
              .icon {
                font-size: 4rem;
                margin-bottom: 1rem;
              }
              button {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
              }
              button:hover {
                background: #2563eb;
              }
            </style>
          </head>
          <body>
            <div class="icon">📡</div>
            <h1>You're Offline</h1>
            <p class="offline">No internet connection detected. Please check your network and try again.</p>
            <button onclick="location.reload()">🔄 Retry Connection</button>
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
    icon: '/icons/android/android-launchericon-192-192.png',
    badge: '/icons/android/android-launchericon-96-96.png',
    tag: 'default',
    data: {},
    actions: [
      {
        action: 'open',
        title: '👁️ View',
        icon: '/icons/android/android-launchericon-96-96.png'
      },
      {
        action: 'dismiss',
        title: '❌ Dismiss',
        icon: '/icons/android/android-launchericon-96-96.png'
      }
    ],
    requireInteraction: false,
    silent: false
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('📨 Push data:', data);
      
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.body || data.message || notificationData.body,
        icon: data.icon || notificationData.icon,
        tag: data.tag || `notification-${Date.now()}`,
        data: data,
        requireInteraction: data.priority === 'high',
        silent: data.priority === 'low'
      };
      
      // Add status-specific styling
      if (data.status) {
        const statusConfig = {
          'new': { 
            badge: '/icons/android/android-launchericon-96-96.png',
            vibrate: [200, 100, 200]
          },
          'pending': { 
            badge: '/icons/android/android-launchericon-96-96.png',
            vibrate: [300, 100, 300, 100, 300]
          },
          'approved': { 
            badge: '/icons/android/android-launchericon-96-96.png',
            vibrate: [100]
          },
          'rejected': { 
            badge: '/icons/android/android-launchericon-96-96.png',
            vibrate: [500, 200, 500]
          }
        };
        
        const config = statusConfig[data.status];
        if (config) {
          Object.assign(notificationData, config);
        }
      }
      
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

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('🔔 Notification closed:', event.notification.tag);
  
  // Optional: Send analytics or perform cleanup
  if (event.notification.data && event.notification.data.notificationId) {
    // Could send a message to the main app about notification dismissal
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_DISMISSED',
          notificationId: event.notification.data.notificationId
        });
      });
    });
  }
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
      
    case 'CLEAR_CACHE':
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

// Background sync for offline actions (if supported)
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync triggered:', event.tag);
    
    if (event.tag === 'notification-response') {
      event.waitUntil(syncNotificationResponses());
    }
  });
}

async function syncNotificationResponses() {
  try {
    // Get pending responses from IndexedDB or localStorage
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_NOTIFICATION_RESPONSES'
      });
    });
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Periodic background sync (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    console.log('⏰ Periodic sync triggered:', event.tag);
    
    if (event.tag === 'heartbeat') {
      event.waitUntil(performHeartbeat());
    }
  });
}

async function performHeartbeat() {
  try {
    // Send heartbeat to server or perform maintenance tasks
    console.log('💓 Performing background heartbeat');
    
    // Notify clients about heartbeat
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_HEARTBEAT',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('Background heartbeat failed:', error);
  }
}

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('📱 Push subscription changed');
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'BGAq623vEDEL-ISsEZZRJyBVOssH6iVUmil3S0R3pr6qBTKq_3S5FFr99Plg9DIF8268XLbW0ss0RzK00afmTXA'
    }).then(subscription => {
      console.log('📱 New push subscription created');
      
      // Send new subscription to server
      return fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });
    }).then(() => {
      // Notify clients about subscription change
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
          message: 'Push subscription renewed'
        });
      });
    }).catch(error => {
      console.error('Failed to renew push subscription:', error);
    })
  );
});

// Global error handling
self.addEventListener('error', (event) => {
  console.error('💥 Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('💥 Unhandled promise rejection in SW:', event.reason);
});

// Utility functions for notifications
function createNotificationFromMQTT(mqttData) {
  const statusConfig = {
    'new': {
      icon: '🆕',
      color: '#3b82f6',
      urgency: 'normal'
    },
    'pending': {
      icon: '⏳',
      color: '#f59e0b',
      urgency: 'high'
    },
    'approved': {
      icon: '✅',
      color: '#10b981',
      urgency: 'low'
    },
    'rejected': {
      icon: '❌',
      color: '#ef4444',
      urgency: 'normal'
    }
  };
  
  const config = statusConfig[mqttData.status] || statusConfig['new'];
  
  return {
    title: `${config.icon} ${mqttData.title || 'Job Order Update'}`,
    body: `Job #${mqttData.jobOrderId || 'N/A'}: ${mqttData.content || mqttData.message || 'Status updated'}`,
    icon: '/icons/android/android-launchericon-192-192.png',
    badge: '/icons/android/android-launchericon-96-96.png',
    tag: `job-${mqttData.jobOrderId || Date.now()}`,
    data: mqttData,
    actions: mqttData.status === 'pending' || mqttData.status === 'new' ? [
      {
        action: 'approve',
        title: '✅ Approve',
        icon: '/icons/android/android-launchericon-96-96.png'
      },
      {
        action: 'reject',
        title: '❌ Reject',
        icon: '/icons/android/android-launchericon-96-96.png'
      },
      {
        action: 'view',
        title: '👁️ View',
        icon: '/icons/android/android-launchericon-96-96.png'
      }
    ] : [
      {
        action: 'view',
        title: '👁️ View',
        icon: '/icons/android/android-launchericon-96-96.png'
      }
    ],
    requireInteraction: mqttData.priority === 'high',
    silent: mqttData.priority === 'low',
    vibrate: mqttData.priority === 'high' ? [300, 100, 300, 100, 300] : [100, 50, 100]
  };
}

// Cache management utilities
function cleanupOldCaches() {
  return caches.keys().then(cacheNames => {
    const oldCaches = cacheNames.filter(name => 
      name.startsWith('morph-messaging-') && 
      name !== CACHE_NAME && 
      name !== STATIC_CACHE
    );
    
    return Promise.all(
      oldCaches.map(cacheName => {
        console.log('🗑️ Removing old cache:', cacheName);
        return caches.delete(cacheName);
      })
    );
  });
}

// Network status detection
function isOnline() {
  return navigator.onLine;
}

// Log service worker lifecycle
console.log('🚀 Service Worker script loaded - ' + CACHE_NAME);

// Performance monitoring
let installStart = performance.now();
self.addEventListener('install', () => {
  console.log(`⚡ Service Worker install took ${performance.now() - installStart}ms`);
});

let activateStart = performance.now();
self.addEventListener('activate', () => {
  console.log(`⚡ Service Worker activate took ${performance.now() - activateStart}ms`);
});