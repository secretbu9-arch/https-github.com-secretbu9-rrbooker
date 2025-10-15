// firebase-config.js
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDRP4C2T3T_eAdPOW9sYtqBRcGUghhACvo",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "rrbookerappnotif.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "rrbookerappnotif",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "rrbookerappnotif.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "160590142868",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:160590142868:web:7338b090540861a36b0381"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging and get a reference to the service
const messaging = getMessaging(app);

// VAPID key for web push
// This key MUST match the one in your Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || "BAGIOkbGzKfdJTdJXuKM1EjknKKiRid3kxMzdvfXuPDe2loPNolgmvUxxNyEwGupN9uHAXspL8tQCfl5Vf0yXoM";

// Get FCM token
export const getFCMToken = async () => {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers are not supported in this browser.');
      return null;
    }

    // Check if service worker is already registered
    let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    
    if (!registration) {
      console.log('Registering Firebase service worker...');
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      console.log('Service worker registered successfully:', registration);
    } else {
      console.log('Service worker already registered:', registration);
    }

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('Service worker is ready');

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('FCM Token:', token);
      return token;
    } else {
      console.log('No registration token available.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return null;
  }
};

// Listen for foreground messages
export const onForegroundMessage = (callback) => {
  return onMessage(messaging, (payload) => {
    console.log('Message received in foreground:', payload);
    callback(payload);
  });
};

export { messaging, app };
