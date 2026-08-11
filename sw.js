const SHELL_CACHE = "margin-shell-v6";
const CONTENT_CACHE = "margin-content-v1";
const PUBLICATION_MANIFEST = "./data/publications.json";
const APP_SHELL = "./index.html";
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

let publicationCacheJob = null;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("margin-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)),
    ));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_PUBLICATIONS") return;
  if (!publicationCacheJob) {
    publicationCacheJob = cachePublications().finally(() => { publicationCacheJob = null; });
  }
  event.waitUntil(publicationCacheJob);
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

  if (event.request.mode === "navigate") {
    event.respondWith(serveShell(event, APP_SHELL));
    return;
  }

  if (isAppAsset && !isLocalPublication) {
    event.respondWith(serveShell(event, event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CONTENT_CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => Response.error())),
  );
});

function serveShell(event, cacheKey) {
  const update = fetch(event.request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  });
  event.waitUntil(update.catch(() => {}));

  return caches.open(SHELL_CACHE).then(async (cache) => (
    (await cache.match(cacheKey)) || update
  ));
}
