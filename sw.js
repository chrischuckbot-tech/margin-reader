const SHELL_CACHE = "margin-shell-v4";
const CONTENT_CACHE = "margin-content-v1";
const PUBLICATION_MANIFEST = "./data/publications.json";
const PUBLICATION_HOSTS = new Set(["abseil.io", "google.github.io", "aosabook.org"]);
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
    await cachePublications();
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

async function cachePublications() {
  try {
    const manifestUrl = new URL(PUBLICATION_MANIFEST, self.registration.scope).href;
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) return;
    const publications = await manifestResponse.json();
    for (const publication of publications) {
      if (publication.type === "remote-html") await cachePublication(publication);
    }
  } catch {
    // The app still installs if a source is temporarily unavailable.
  }
}

async function cachePublication(publication) {
  try {
    const contentCache = await caches.open(CONTENT_CACHE);
    const sourceUrl = new URL(publication.sourceUrl, self.registration.scope).href;
    const baseUrl = new URL(publication.baseUrl, self.registration.scope).href;
    const sourceIsLocal = new URL(sourceUrl).origin === self.location.origin;
    const tocResponse = await fetch(sourceUrl, { mode: sourceIsLocal ? "same-origin" : "cors" });
    if (!tocResponse.ok) return;
    await contentCache.put(sourceUrl, tocResponse.clone());
    const tocHtml = await tocResponse.text();
    const hrefPattern = publication.tocHrefPattern ? new RegExp(publication.tocHrefPattern, "i") : /\.html(?:#.*)?$/i;
    const chapterUrls = [...new Set(
      [...tocHtml.matchAll(/href=["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter((href) => hrefPattern.test(href))
        .map((href) => new URL(href, baseUrl).href.split("#")[0]),
    )];
    for (let index = 0; index < chapterUrls.length; index += 6) {
      const batch = chapterUrls.slice(index, index + 6);
      await Promise.allSettled(batch.map(async (url) => {
        let response = await contentCache.match(url);
        if (!response) {
          const isLocal = new URL(url).origin === self.location.origin;
          response = await fetch(url, { mode: isLocal ? "same-origin" : "cors" });
          if (!response.ok) return;
          await contentCache.put(url, response.clone());
        }
        // Chapter HTML is the offline baseline. Illustrations are cached
        // automatically by the reader when their publication is opened.
      }));
    }
  } catch {
    // One unavailable publication must not prevent the app from installing.
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isAppAsset = url.origin === self.location.origin;
  const isLocalPublication = isAppAsset && url.pathname.includes("/publications/");
  const isPublicationAsset = isLocalPublication || PUBLICATION_HOSTS.has(url.hostname);
  if (!isAppAsset && !isPublicationAsset) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(isAppAsset && !isLocalPublication ? SHELL_CACHE : CONTENT_CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => isAppAsset ? caches.match("./index.html") : Response.error())),
  );
});
