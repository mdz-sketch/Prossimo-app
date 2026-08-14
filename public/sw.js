// Service worker minimo: serve per rendere l'app installabile (PWA) e per
// ricevere le notifiche push in futuro, anche quando l'app non e' aperta.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Nessuna cache offline per ora: si affida sempre alla rete, cosi' l'app
// mostra sempre dati aggiornati (fondamentale per una coda in tempo reale).
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Prossimo", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Prossimo", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: payload.url || "/",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
