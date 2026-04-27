/**
 * NutriAI Web Push service worker.
 *
 * Receives push events with a JSON payload of shape:
 *   { title: string, body: string, url?: string, tag?: string }
 *
 * Renders a notification and routes the click back to the SPA.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "NutriAI", body: event.data.text() };
  }
  const { title = "NutriAI", body = "", url = "/", tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url },
      tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            const u = new URL(url, self.registration.scope);
            client.navigate?.(u.toString());
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
