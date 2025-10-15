#!/usr/bin/env node

/**
 * Sync Firebase Configuration
 * 
 * This script synchronizes Firebase configuration from .env to the service worker files.
 * Service workers can't access environment variables at runtime, so we need to inject
 * the configuration at build time.
 * 
 * Usage: node scripts/sync-firebase-config.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TEMPLATE = `// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// NOTE: This configuration is auto-generated from .env
// DO NOT edit this manually - run 'npm run sync-firebase-config' instead
const firebaseConfig = {
  apiKey: "{{FIREBASE_API_KEY}}",
  authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
  projectId: "{{FIREBASE_PROJECT_ID}}",
  storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
  messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
  appId: "{{FIREBASE_APP_ID}}"
};

firebase.initializeApp(firebaseConfig);

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'R&R Booker';
  const uniqueTag = \`\${payload.data?.type || 'general'}-\${payload.data?.timestamp || Date.now()}\`;
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/favicon.ico'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/favicon.ico'
      }
    ],
    tag: uniqueTag,
    renotify: true,
    requireInteraction: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  const action = event.action;
  
  if (action === 'dismiss') {
    return;
  }
  
  // Store notification data for the app to handle
  if (data.type) {
    const notificationData = {
      type: data.type,
      data: data,
      timestamp: Date.now()
    };
    
    // Store in IndexedDB for the app to retrieve
    event.waitUntil(
      storeNotificationData(notificationData)
    );
  }
  
  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise, open a new window
      if (clients.openWindow) {
        const url = getNotificationUrl(data.type);
        return clients.openWindow(url);
      }
    })
  );
});

// Store notification data in IndexedDB
async function storeNotificationData(data) {
  try {
    const db = await openDB();
    const transaction = db.transaction(['notifications'], 'readwrite');
    const store = transaction.objectStore('notifications');
    await store.add(data);
  } catch (error) {
    console.error('Error storing notification data:', error);
  }
}

// Open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RafRokBooker', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('notifications')) {
        db.createObjectStore('notifications', { keyPath: 'timestamp' });
      }
    };
  });
}

// Get URL based on notification type
function getNotificationUrl(type) {
  const baseUrl = self.location.origin;
  
  switch (type) {
    case 'appointment':
      return \`\${baseUrl}/appointments\`;
    case 'queue':
      return \`\${baseUrl}/queue\`;
    case 'booking':
      return \`\${baseUrl}/book\`;
    default:
      return \`\${baseUrl}/dashboard\`;
  }
}
`;

function syncFirebaseConfig() {
  console.log('🔄 Syncing Firebase configuration...\n');

  // Read environment variables
  const config = {
    FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.REACT_APP_FIREBASE_APP_ID,
    FIREBASE_VAPID_KEY: process.env.REACT_APP_FIREBASE_VAPID_KEY
  };

  // Validate configuration
  const missingVars = Object.entries(config)
    .filter(([key, value]) => !value)
    .map(([key]) => `REACT_APP_${key}`);

  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease check your .env file.');
    process.exit(1);
  }

  // Display configuration (masked)
  console.log('📋 Firebase Configuration:');
  console.log(`   API Key: ${config.FIREBASE_API_KEY.substring(0, 20)}...`);
  console.log(`   Auth Domain: ${config.FIREBASE_AUTH_DOMAIN}`);
  console.log(`   Project ID: ${config.FIREBASE_PROJECT_ID}`);
  console.log(`   Storage Bucket: ${config.FIREBASE_STORAGE_BUCKET}`);
  console.log(`   Messaging Sender ID: ${config.FIREBASE_MESSAGING_SENDER_ID}`);
  console.log(`   App ID: ${config.FIREBASE_APP_ID.substring(0, 20)}...`);
  console.log(`   VAPID Key: ${config.FIREBASE_VAPID_KEY.substring(0, 20)}...\n`);

  // Replace placeholders in template
  let content = TEMPLATE;
  Object.entries(config).forEach(([key, value]) => {
    content = content.replace(`{{${key}}}`, value);
  });

  // Write to public directory
  const publicPath = path.join(__dirname, '..', 'public', 'firebase-messaging-sw.js');
  fs.writeFileSync(publicPath, content, 'utf8');
  console.log(`✅ Updated: public/firebase-messaging-sw.js`);

  // Write to build directory if it exists
  const buildPath = path.join(__dirname, '..', 'build', 'firebase-messaging-sw.js');
  if (fs.existsSync(path.dirname(buildPath))) {
    fs.writeFileSync(buildPath, content, 'utf8');
    console.log(`✅ Updated: build/firebase-messaging-sw.js`);
  }

  console.log('\n✅ Firebase configuration sync completed!\n');
  console.log('💡 TIP: Add this to your package.json scripts:');
  console.log('   "sync-firebase-config": "node scripts/sync-firebase-config.js"');
  console.log('   "prebuild": "npm run sync-firebase-config"\n');
}

// Run sync
syncFirebaseConfig();

