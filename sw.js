const SHELL_CACHE = "margin-shell-v2";
const CONTENT_CACHE = "margin-content-v1";
const PUBLICATION_TOC = "https://abseil.io/resources/swe-book/html/toc.html";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./data/publications.json",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS));
    await cachePublication();
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("margin-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

async function cachePublication() {
  try {
    const contentCache = await caches.open(CONTENT_CACHE);
    const tocResponse = await fetch(PUBLICATION_TOC, { mode: "cors" });
    if (!tocResponse.ok) return;
    await contentCache.put(PUBLICATION_TOC, tocResponse.clone());
    const tocHtml = await tocResponse.text();
    const chapterUrls = [...new Set(
      [...tocHtml.matchAll(/href=["']([^"']+\.html(?:#[^"']*)?)["']/gi)]
        .map((match) => new URL(match[1], PUBLICATION_TOC).href.split("#")[0])
        .filter((url) => new URL(url).hostname === "abseil.io"),
    )];
    const imageUrls = new Set();

    for (let index = 0; index < chapterUrls.length; index += 6) {
      const batch = chapterUrls.slice(index, index + 6);
      await Promise.allSettled(batch.map(async (url) => {
        let response = await contentCache.match(url);
        if (!response) {
          response = await fetch(url, { mode: "cors" });
          if (!response.ok) return;
          await contentCache.put(url, response.clone());
        }
        const html = await response.text();
        [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
          .forEach((match) => imageUrls.add(new URL(match[1], url).href));
      }));
    }

    const images = [...imageUrls];
    for (let index = 0; index < images.length; index += 8) {
      const batch = images.slice(index, index + 8);
      await Promise.allSettled(batch.map(async (url) => {
        if (await contentCache.match(url)) return;
        const response = await fetch(url, { mode: "no-cors" });
        await contentCache.put(url, response);
      }));
    }
  } catch {
    // The app still installs if the source is temporarily unavailable.
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isAppAsset = url.origin === self.location.origin;
  const isPublicationAsset = url.hostname === "abseil.io";
  if (!isAppAsset && !isPublicationAsset) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(isAppAsset ? SHELL_CACHE : CONTENT_CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => isAppAsset ? caches.match("./index.html") : Response.error())),
  );
});
