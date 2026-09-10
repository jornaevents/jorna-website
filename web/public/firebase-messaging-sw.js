/* ────────────────────────────────────────────────────────────────────────────
 *  FIREBASE MESSAGING SERVICE WORKER
 *  Served at /app/firebase-messaging-sw.js (scope /app/). Handles push while the
 *  tab is closed/backgrounded and shows the notification.
 *
 *  ┌──────────────────────────────────────────────────────────────────────────┐
 *  │  PLACE YOUR VALUES HERE  (slot 2 of 2)                                    │
 *  │  A service worker is a static file — it can't read the app's env vars, so │
 *  │  the SAME five config values from web/src/lib/firebaseConfig.ts must be   │
 *  │  hard-coded again below. Keep them in sync. (No VAPID key needed here.)   │
 *  └──────────────────────────────────────────────────────────────────────────┘
 * ──────────────────────────────────────────────────────────────────────────── */

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyDy11WfdRcuOoGtBXEjCuPQTMcnNuaUE_Q",
  authDomain:        "jorna-15768.firebaseapp.com",
  projectId:         "jorna-15768",
  messagingSenderId: "876290852341",
  appId:             "1:876290852341:web:1356351e32243ccd748cbc",
});

const messaging = firebase.messaging();

// Fired when a push arrives and no tab is focused. Show the notification and
// stash a link so a click opens the right place in the app.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Jorna";
  const body = (payload.notification && payload.notification.body) || "";
  const data = payload.data || {};
  self.registration.showNotification(title, {
    body,
    icon: "/app/favicon.ico",
    data,
  });
});

// Focus an existing tab (or open one) when the notification is clicked,
// navigating it to the conversation a message-type push carries — falls back
// to the Needs-You feed for a push with no conversation (booking status,
// check-in) or no data at all.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data && event.notification.data.conversation_id;
  const url = conversationId
    ? `/app/conversation/?id=${encodeURIComponent(conversationId)}`
    : "/app/activity/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes("/app/") && "focus" in c) {
          return "navigate" in c ? c.navigate(url).then((nc) => nc.focus()) : c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
