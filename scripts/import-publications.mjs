import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const sources = [
  {
    id: "sre",
    tocUrl: "https://sre.google/sre-book/table-of-contents/",
    output: "publications/sre",
    selectLink: (tag, href) => tag.includes("menu-buttons") && href.includes("/sre-book/"),
    filename(url) {
      const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1);
      return `${slug}.html`;
    },
  },
  {
    id: "gpp",
    tocUrl: "https://gameprogrammingpatterns.com/contents.html",
    output: "publications/gpp",
    selectLink: (_tag, href) => /^[a-z0-9-]+\.html(?:#.*)?$/i.test(href),
    filename(url) {
      return path.basename(new URL(url).pathname);
    },
  },
];

function canonical(url) {
  const value = new URL(url);
  value.hash = "";
  value.search = "";
  return value.href;
}

function anchorLinks(html, baseUrl, selectLink) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gis)) {
    const [tag, href] = match;
    if (!selectLink(tag, href)) continue;
    links.push(canonical(new URL(href, baseUrl)));
  }
  return [...new Set(links)];
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function assetName(url) {
  const parsed = new URL(url);
  const basename = path.basename(parsed.pathname) || "asset";
  const safe = basename.replace(/[^a-z0-9._-]/gi, "-");
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${hash}-${safe}`;
}

async function transformPage(html, remoteUrl, source, pageMap) {
  const remoteOrigin = new URL(source.tocUrl).origin;
  let transformed = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/href=(["'])([^"']+)\1/gi, (full, quote, href) => {
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return full;
    const resolved = new URL(href, remoteUrl);
    const localFile = pageMap.get(canonical(resolved));
    if (localFile) return `href=${quote}${localFile}${resolved.hash}${quote}`;
    if (resolved.origin === remoteOrigin) return `href=${quote}${resolved.href}${quote}`;
    return full;
    });

  const assets = [];
  for (const match of transformed.matchAll(/<img\b[^>]*?src=(["'])([^"']+)\1[^>]*>/gis)) {
    const src = match[2];
    if (/^(data:|blob:)/i.test(src)) continue;
    const remoteAsset = new URL(src, remoteUrl).href;
    assets.push({ remoteAsset, localAsset: `assets/${assetName(remoteAsset)}` });
  }

  for (const { remoteAsset, localAsset } of assets) {
    try {
      const bytes = await fetchBytes(remoteAsset);
      await writeFile(path.join(root, source.output, localAsset), bytes);
      transformed = transformed.split(remoteAsset).join(localAsset);
      const originalForms = [...transformed.matchAll(/<img\b[^>]*?src=(["'])([^"']+)\1[^>]*>/gis)]
        .map((match) => match[2])
        .filter((src) => new URL(src, remoteUrl).href === remoteAsset);
      originalForms.forEach((original) => { transformed = transformed.split(original).join(localAsset); });
    } catch (error) {
      console.warn(error.message);
    }
  }
  return transformed.replace(/[ \t]+$/gm, "");
}

for (const source of sources) {
  const outputDir = path.join(root, source.output);
  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  const tocHtml = await fetchText(source.tocUrl);
  const pageUrls = anchorLinks(tocHtml, source.tocUrl, source.selectLink);
  const pageMap = new Map(pageUrls.map((url) => [canonical(url), source.filename(url)]));

  for (let index = 0; index < pageUrls.length; index += 5) {
    const batch = pageUrls.slice(index, index + 5);
    await Promise.all(batch.map(async (url) => {
      const html = await fetchText(url);
      const transformed = await transformPage(html, url, source, pageMap);
      await writeFile(path.join(outputDir, source.filename(url)), transformed, "utf8");
    }));
  }

  const localToc = await transformPage(tocHtml, source.tocUrl, source, pageMap);
  await writeFile(path.join(outputDir, "toc.html"), localToc, "utf8");
  console.log(`${source.id}: imported ${pageUrls.length} pages`);
}
