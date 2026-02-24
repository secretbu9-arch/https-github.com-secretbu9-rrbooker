// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// NOTE: This configuration is auto-generated from .env
// DO NOT edit this manually - run 'npm run sync-firebase-config' instead
const firebaseConfig = {
  apiKey: "AIzaSyCAP-KcVY2uTMl5aFMquAODPX5IhoiuDh0",
  authDomain: "rrbookerappnotif.firebaseapp.com",
  projectId: "rrbookerappnotif",
  storageBucket: "rrbookerappnotif.firebasestorage.app",
  messagingSenderId: "160590142868",
  appId: "1:160590142868:web:7338b090540861a36b0381"
};

firebase.initializeApp(firebaseConfig);

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  // Extract info from notification OR data payload
  const notificationTitle = payload.notification?.title || payload.data?.title || 'R&R Booker';
  const bodyText = payload.notification?.body || payload.data?.body || payload.data?.message || 'You have a new notification';

  const uniqueTag = `${payload.data?.type || 'general'}-${payload.data?.appointment_id || 'no-id'}-${Date.now()}`;

  const notificationOptions = {
    body: bodyText,
    icon: '/rrbooker-logo-3.png',
    badge: '/favicon.ico',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'View Details',
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
      return `${baseUrl}/appointments`;
    case 'queue':
      return `${baseUrl}/queue`;
    case 'booking':
      return `${baseUrl}/book`;
    default:
      return `${baseUrl}/dashboard`;
  }
}
