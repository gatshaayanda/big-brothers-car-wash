// Background push is optional. A failed remote import must never prevent offline support.
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/11.9.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/11.9.0/firebase-messaging-compat.js",
    "/api/firebase/messaging-sw-config"
  );
} catch (error) {
  console.warn("Background messaging is unavailable; offline app-shell support remains enabled.", error);
}

let vulaMessaging = null;
try {
  const config = self.__BIG_BROTHERS_FIREBASE_CONFIG__;
  if (config && config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
    firebase.initializeApp(config);
    vulaMessaging = firebase.messaging();
    vulaMessaging.onBackgroundMessage((payload) => {
      if (payload.notification) return;
      const title = payload.data?.title || "Big Brothers Car Wash update";
      const options = {
        body: payload.data?.body || "Open the app to check your latest information.",
        icon: "/big-brothers-icon-192.png",
        badge: "/big-brothers-icon-192.png",
        data: { link: payload.data?.link || "/account" },
      };
      self.registration.showNotification(title, options);
    });
  } else {
    console.error("Big Brothers Car Wash Firebase Messaging web config is incomplete.");
  }
} catch (error) {
  console.error("Big Brothers Car Wash Firebase Messaging service worker could not initialize.", error);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink = event.notification.data?.link || "/account";
  const link = rawLink.startsWith("/") ? rawLink : "/account";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ("focus" in client) {
        void client.navigate(link);
        return client.focus();
      }
    }
    return clients.openWindow(link);
  }));
});

const CACHE_VERSION = "big-brothers-shell-v1";
const GAME_CACHE = "big-brothers-game-v1";
const MEDIA_CACHE = "big-brothers-media-v1";
const SHELL_CACHE = CACHE_VERSION;
const STATIC_LIMIT = 160;
const PUBLIC_PAGE_LIMIT = 16;
const APP_SHELL = [
  "/", "/games", "/games/career", "/offline", "/iphone-install", "/iphone-install.svg",
  "/big-brothers-icon.svg", "/big-brothers-icon-180.png", "/big-brothers-icon-192.png",
  "/big-brothers-icon-512.png", "/manifest.webmanifest"
];
const RACING_MANIFEST = "/game-assets/racing-kit/manifest.json";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheShell();
    await precacheRacingAssets();
    // Let an existing app show its Refresh action before activating an update.
    // First-time installs still activate normally because there is no older worker.
  })());
});

async function fetchAndCache(path, cacheName, { required = false } = {}) {
  const cache = await caches.open(cacheName);
  const request = new Request(path, { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) {
    if (required) throw new Error("Required offline asset returned HTTP " + response.status + ": " + path);
    return null;
  }
  await cache.put(request, response.clone());
  return response;
}

async function precacheShell() {
  const discovered = new Set();
  for (const path of APP_SHELL) {
    const critical = path === "/" || path === "/games";
    try {
      const response = await fetchAndCache(path, SHELL_CACHE, { required: critical });
      if (!response || !(response.headers.get("content-type") || "").includes("text/html")) continue;
      const html = await response.text();
      for (const match of html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)) discovered.add(match[1]);
    } catch (error) {
      if (critical) throw error;
      console.warn("Could not refresh an optional app-shell resource:", path, error);
    }
  }

  // Do not activate an update with an incomplete app bundle: keep the active
  // worker and retry on a later visit if any referenced JS/CSS cannot be cached.
  await Promise.all([...discovered].map((path) => fetchAndCache(path, SHELL_CACHE, { required: true })));
  await trimCache(SHELL_CACHE, STATIC_LIMIT + PUBLIC_PAGE_LIMIT);
}

async function precacheRacingAssets() {
  try {
    const response = await fetchAndCache(RACING_MANIFEST, GAME_CACHE);
    if (!response) return;
    const manifest = await response.clone().json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const selected = assets.find((asset) => /race.?car.?red|car.?red/i.test(asset.name))
      || assets.find((asset) => /race.?car|vehicle.?race/i.test(asset.name))
      || assets.find((asset) => /car|vehicle/i.test(asset.name));
    if (!selected || typeof selected.path !== "string") {
      console.warn("No racing model is listed; the game will use its built-in fallback car.");
      return;
    }

    const modelUrl = new URL(selected.path, self.location.origin);
    if (modelUrl.origin !== self.location.origin || !modelUrl.pathname.startsWith("/game-assets/racing-kit/")) {
      console.warn("Skipped a racing asset outside Big Brothers local asset directory.");
      return;
    }
    const modelResponse = await fetchAndCache(modelUrl.href, GAME_CACHE);
    if (!modelResponse || !/\.gltf$/i.test(modelUrl.pathname)) return;

    // A .gltf file may refer to external buffers or textures. Cache same-origin
    // dependencies so the model can be reconstructed without a network connection.
    const gltf = await modelResponse.clone().json();
    const dependencies = [
      ...(Array.isArray(gltf.buffers) ? gltf.buffers : []),
      ...(Array.isArray(gltf.images) ? gltf.images : []),
    ];
    await Promise.all(dependencies.map(async (dependency) => {
      if (typeof dependency.uri !== "string" || dependency.uri.startsWith("data:")) return;
      try {
        const dependencyUrl = new URL(dependency.uri, modelUrl);
        if (dependencyUrl.origin !== self.location.origin || !dependencyUrl.pathname.startsWith("/game-assets/racing-kit/")) return;
        await fetchAndCache(dependencyUrl.href, GAME_CACHE);
      } catch (error) {
        console.warn("Could not precache a racing model dependency.", error);
      }
    }));
  } catch (error) {
    // Gameplay still has a procedural car fallback if the optional model is unavailable.
    console.warn("Racing model precache failed; offline gameplay can use its fallback car.", error);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "PRECACHE_RACING") {
    event.waitUntil(precacheRacingAssets());
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const obsolete = new Set([
      "big-brothers-shell-v2", "big-brothers-shell-v3", "big-brothers-shell-v4",
      "big-brothers-game-v2", "big-brothers-game-v3", "big-brothers-game-v4",
      "big-brothers-media-v0"
    ]);
    await Promise.all(keys.filter((key) =>
      obsolete.has(key) && key !== SHELL_CACHE && key !== GAME_CACHE && key !== MEDIA_CACHE
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  const isNavigation = request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
  const isPrivate = /^\/(?:account|requests|orders|admin|invite)(?:\/|$)/.test(url.pathname);

  // Never serve cached private pages as if they were the current authenticated response.
  if (isNavigation && isPrivate) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match("/offline") || Response.error();
    }));
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })).then((response) => {
      if (response.ok) {
        const cacheCopy = response.clone();
        void caches.open(SHELL_CACHE).then((cache) => cache.put(request, cacheCopy));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(request) || Response.error();
    }));
    return;
  }

  if (url.pathname.startsWith("/game-assets/racing-kit/")) {
    event.respondWith(cacheFirst(request, GAME_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|webp|svg|ico|avif)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (isNavigation) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(SHELL_CACHE).then(async (cache) => {
          await cache.put(request, copy);
          await trimCache(SHELL_CACHE, STATIC_LIMIT + PUBLIC_PAGE_LIMIT);
        });
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(request, { ignoreSearch: true })
        || await cache.match(url.pathname)
        || await cache.match("/")
        || await cache.match("/offline")
        || Response.error();
    }));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await trimCache(cacheName, cacheName === GAME_CACHE ? 120 : STATIC_LIMIT + PUBLIC_PAGE_LIMIT);
    }
    return response;
  } catch {
    return await cache.match(request, { ignoreSearch: true }) || Response.error();
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)));
}
