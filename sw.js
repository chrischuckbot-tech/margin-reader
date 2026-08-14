const SHELL_CACHE = "margin-shell-v9";
const CONTENT_CACHE = "margin-content-v1";
const PUBLICATION_MANIFEST = "./data/publications.json";
const SCOPE_URL = new URL("./", self.registration.scope).href;
const APP_SHELL = new URL("index.html", SCOPE_URL).href;
const PUBLICATION_HOSTS = new Set(["abseil.io", "google.github.io", "aosabook.org"]);
const CORE_SHELL_ASSETS = [
  "index.html",
  "styles.css",
  "app.js",
  "data/publications.json",
].map((path) => new URL(path, SCOPE_URL).href);
const OPTIONAL_SHELL_ASSETS = [
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
].map((path) => new URL(path, SCOPE_URL).href);

let publicationCacheJob = null;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_SHELL_ASSETS);
    await Promise.allSettled(OPTIONAL_SHELL_ASSETS.map(async (url) => {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    }));
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
    event.respondWith(serveAppShell(event.request));
    return;
  }

  if (isAppAsset && !isLocalPublication) {
    event.respondWith(cacheFirst(event, SHELL_CACHE));
    return;
  }

  event.respondWith(cacheFirst(event, CONTENT_CACHE));
});

async function serveAppShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(APP_SHELL);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`App shell returned ${response.status}`);
    try { await cache.put(APP_SHELL, response.clone()); } catch { /* Do not hide a valid network response. */ }
    return response;
  } catch {
    return createOfflineFallback();
  }
}

async function cacheFirst(event, cacheName) {
  const cached = await caches.match(event.request);
  if (cached) return cached;

  try {
    const response = await fetch(event.request);
    if (response.ok || response.type === "opaque") {
      const copy = response.clone();
      event.waitUntil(caches.open(cacheName).then((cache) => cache.put(event.request, copy)).catch(() => {}));
    }
    return response;
  } catch {
    return Response.error();
  }
}

function createOfflineFallback() {
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <meta name="theme-color" content="#f4f0e8">
        <title>Margin — Offline</title>
        <style>
          *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;background:#f4f0e8;color:#20221f;font:16px/1.55 system-ui,sans-serif}
          main{width:min(100%,430px)}strong{display:grid;width:44px;height:44px;place-items:center;margin-bottom:34px;border-radius:3px 3px 13px 3px;background:#173f38;color:#faf8f3;font:24px Georgia,serif}
          h1{margin:0 0 14px;font:500 44px/1 Georgia,serif;letter-spacing:-.03em}p{margin:0 0 26px;color:#676a64}a{display:inline-block;padding:11px 16px;border:1px solid rgba(32,34,31,.28);border-radius:4px;color:inherit;text-decoration:none;font-weight:600}
        </style>
      </head>
      <body><main><strong>M</strong><h1>Margin is offline.</h1><p>The app has not finished saving on this device. Reconnect once, open Margin, and wait for the library to appear before going offline.</p><a href="${SCOPE_URL}">Try again</a></main></body>
    </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
