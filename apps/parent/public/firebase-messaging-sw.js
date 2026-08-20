// Firebase Messaging Service Worker for background push alerts
/* eslint-disable no-undef */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.notification?.title || data.data?.title || 'School Attendance Alert';
    const options = {
      body: data.notification?.body || data.data?.body || 'Attendance status update recorded.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: data.data || {},
      vibrate: [200, 100, 200],
      tag: data.data?.attendance_id || 'attendance-notification',
      renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event in SW:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/today');
    })
  );
});
