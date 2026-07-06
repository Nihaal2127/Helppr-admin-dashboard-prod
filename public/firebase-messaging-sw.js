// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDbvu_VONThJcXYYp_ikMY4_qyXPUVScbE',
  authDomain: 'helppr-bc0ba.firebaseapp.com',
  projectId: 'helppr-bc0ba',
  messagingSenderId: '944474510158',
  appId: '1:944474510158:web:14d411b2c94fc9c8d7041f',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/notification/icon-192x192.png',
  });
});

