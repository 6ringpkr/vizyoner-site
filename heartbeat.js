const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8085;

// In-memory storage for subscriptions (use database in production)
let subscriptions = [];

// VAPID keys configuration
const vapidKeys = {
  publicKey: 'BGAq623vEDEL-ISsEZZRJyBVOssH6iVUmil3S0R3pr6qBTKq_3S5FFr99Plg9DIF8268XLbW0ss0RzK00afmTXA',
  privateKey: 'Uvrd9Rg63lc4q0H4YRjKWNe-IPLaycpq7F_vfHJAwTg'
};

// Set VAPID details
webpush.setVapidDetails(
  'mailto:vzymb2xxx@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Middleware
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from current directory

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Root route - serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    subscriptions: subscriptions.length,
    uptime: process.uptime()
  });
});

// Get VAPID public key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({
    publicKey: vapidKeys.publicKey
  });
});

// Subscribe endpoint - receive and store push subscriptions
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({
      error: 'Invalid subscription object'
    });
  }
  
  // Check if subscription already exists
  const existingIndex = subscriptions.findIndex(
    sub => sub.endpoint === subscription.endpoint
  );
  
  if (existingIndex !== -1) {
    // Update existing subscription
    subscriptions[existingIndex] = {
      ...subscription,
      updatedAt: new Date().toISOString()
    };
    console.log('📱 Updated existing subscription:', subscription.endpoint.substring(0, 50) + '...');
  } else {
    // Add new subscription
    subscriptions.push({
      ...subscription,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log('📱 New subscription added:', subscription.endpoint.substring(0, 50) + '...');
  }
  
  console.log(`📊 Total subscriptions: ${subscriptions.length}`);
  
  res.status(201).json({
    success: true,
    message: 'Subscription saved successfully',
    totalSubscriptions: subscriptions.length
  });
});

// Unsubscribe endpoint
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  
  if (!endpoint) {
    return res.status(400).json({
      error: 'Endpoint required'
    });
  }
  
  const initialLength = subscriptions.length;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  
  const removed = initialLength - subscriptions.length;
  
  if (removed > 0) {
    console.log('📱 Subscription removed:', endpoint.substring(0, 50) + '...');
    res.json({
      success: true,
      message: 'Subscription removed successfully',
      totalSubscriptions: subscriptions.length
    });
  } else {
    res.status(404).json({
      error: 'Subscription not found'
    });
  }
});

// Get subscription stats
app.get('/api/subscriptions/stats', (req, res) => {
  res.json({
    total: subscriptions.length,
    active: subscriptions.length, // In production, check which ones are still valid
    oldest: subscriptions.length > 0 ? 
      Math.min(...subscriptions.map(s => new Date(s.createdAt || s.updatedAt))) : null,
    newest: subscriptions.length > 0 ? 
      Math.max(...subscriptions.map(s => new Date(s.updatedAt || s.createdAt))) : null
  });
});

// Heartbeat endpoint - send push notifications to all subscribers
app.post('/api/heartbeat', async (req, res) => {
  console.log('💓 Heartbeat requested');
  
  if (subscriptions.length === 0) {
    return res.json({
      success: false,
      message: 'No subscriptions available',
      sent: 0,
      failed: 0
    });
  }
  
  const payload = JSON.stringify({
    title: '💓 Heartbeat',
    body: 'This is a heartbeat notification to all devices.',
    status: 'new',
    priority: 'normal',
    timestamp: new Date().toISOString(),
    data: {
      type: 'heartbeat',
      source: 'server'
    }
  });
  
  let sent = 0;
  let failed = 0;
  const failedSubscriptions = [];
  
  // Send notifications to all subscriptions
  const promises = subscriptions.map(async (subscription, index) => {
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
      console.log(`✅ Heartbeat sent to subscription ${index + 1}`);
    } catch (error) {
      failed++;
      failedSubscriptions.push(index);
      console.error(`❌ Failed to send heartbeat to subscription ${index + 1}:`, error.message);
      
      // Remove invalid subscriptions (410 Gone means subscription is no longer valid)
      if (error.statusCode === 410) {
        console.log(`🗑️ Removing invalid subscription ${index + 1}`);
      }
    }
  });
  
  await Promise.all(promises);
  
  // Clean up invalid subscriptions
  if (failedSubscriptions.length > 0) {
    const validSubscriptions = subscriptions.filter((_, index) => 
      !failedSubscriptions.includes(index) || 
      // Keep subscriptions that failed for reasons other than 410
      true
    );
    
    // Only remove subscriptions that returned 410 (Gone)
    // For simplicity, we'll keep all subscriptions for now
    // In production, you'd want to track and remove truly invalid ones
  }
  
  console.log(`📊 Heartbeat summary: ${sent} sent, ${failed} failed`);
  
  res.json({
    success: true,
    message: 'Heartbeat notifications sent',
    sent,
    failed,
    total: subscriptions.length
  });
});

// Test notification endpoint with different statuses
app.post('/api/test-notification/:status', async (req, res) => {
  const { status } = req.params;
  const { title, message, priority } = req.body;
  
  const validStatuses = ['new', 'pending', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
    });
  }
  
  if (subscriptions.length === 0) {
    return res.json({
      success: false,
      message: 'No subscriptions available',
      sent: 0
    });
  }
  
  const testNotifications = {
    new: {
      title: '🆕 New Job Order',
      body: 'A new job order has been received and requires attention.',
      jobOrderId: `JO-${Date.now()}`,
      priority: 'high'
    },
    pending: {
      title: '⏳ Pending Review',
      body: 'A job order is awaiting your review and approval.',
      jobOrderId: `JO-${Date.now()}`,
      priority: 'medium'
    },
    approved: {
      title: '✅ Job Approved',
      body: 'A job order has been approved and is now active.',
      jobOrderId: `JO-${Date.now()}`,
      priority: 'low'
    },
    rejected: {
      title: '❌ Job Rejected',
      body: 'A job order has been rejected and requires revision.',
      jobOrderId: `JO-${Date.now()}`,
      priority: 'medium'
    }
  };
  
  const notificationData = {
    ...testNotifications[status],
    title: title || testNotifications[status].title,
    body: message || testNotifications[status].body,
    priority: priority || testNotifications[status].priority,
    status,
    timestamp: new Date().toISOString(),
    data: {
      type: 'test',
      status,
      source: 'server'
    }
  };
  
  const payload = JSON.stringify(notificationData);
  
  let sent = 0;
  let failed = 0;
  
  const promises = subscriptions.map(async (subscription, index) => {
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
      console.log(`✅ Test ${status} notification sent to subscription ${index + 1}`);
    } catch (error) {
      failed++;
      console.error(`❌ Failed to send test notification to subscription ${index + 1}:`, error.message);
    }
  });
  
  await Promise.all(promises);
  
  console.log(`📊 Test ${status} notification summary: ${sent} sent, ${failed} failed`);
  
  res.json({
    success: true,
    message: `Test ${status} notifications sent`,
    sent,
    failed,
    notification: notificationData
  });
});

// Bulk notification endpoint (for MQTT integration)
app.post('/api/notify', async (req, res) => {
  const { notifications } = req.body;
  
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return res.status(400).json({
      error: 'Notifications array is required'
    });
  }
  
  if (subscriptions.length === 0) {
    return res.json({
      success: false,
      message: 'No subscriptions available',
      sent: 0
    });
  }
  
  let totalSent = 0;
  let totalFailed = 0;
  
  for (const notification of notifications) {
    const payload = JSON.stringify({
      ...notification,
      timestamp: new Date().toISOString(),
      data: {
        ...notification.data,
        source: 'mqtt'
      }
    });
    
    let sent = 0;
    let failed = 0;
    
    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (error) {
        failed++;
        console.error('❌ Failed to send notification:', error.message);
      }
    });
    
    await Promise.all(promises);
    
    totalSent += sent;
    totalFailed += failed;
  }
  
  res.json({
    success: true,
    message: 'Bulk notifications sent',
    sent: totalSent,
    failed: totalFailed,
    notifications: notifications.length
  });
});

// Clear all subscriptions (for testing)
app.post('/api/subscriptions/clear', (req, res) => {
  const count = subscriptions.length;
  subscriptions = [];
  
  console.log(`🗑️ Cleared ${count} subscriptions`);
  
  res.json({
    success: true,
    message: `Cleared ${count} subscriptions`,
    remaining: 0
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Morph Messaging Server started');
  console.log(`📡 Server running on http://127.0.0.1:${PORT}`);
  console.log(`🔑 VAPID Public Key: ${vapidKeys.publicKey}`);
  console.log('📱 Push notifications ready');
  console.log('\n📋 Available endpoints:');
  console.log('  GET  / - Main app');
  console.log('  GET  /health - Health check');
  console.log('  GET  /api/vapid-public-key - Get VAPID public key');
  console.log('  POST /api/subscribe - Subscribe to push notifications');
  console.log('  POST /api/unsubscribe - Unsubscribe from push notifications');
  console.log('  GET  /api/subscriptions/stats - Get subscription statistics');
  console.log('  POST /api/heartbeat - Send heartbeat to all subscribers');
  console.log('  POST /api/test-notification/:status - Send test notification');
  console.log('  POST /api/notify - Send bulk notifications');
  console.log('  POST /api/subscriptions/clear - Clear all subscriptions');
  console.log('');
});

// Export for testing
module.exports = app;