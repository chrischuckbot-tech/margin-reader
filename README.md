# Margin

Margin is a static, installable reading app for software engineering books, papers, and PDFs. It is designed to run free on GitHub Pages with no account, backend, analytics, or build step.

## Included now

- Software Engineering at Google
- Site Reliability Engineering
- Building Secure and Reliable Systems
- The Architecture of Open Source Applications, Volumes 1 and 2
- Game Programming Patterns
- Distributed Systems for Fun and Profit (official online edition)
- Light, sepia, and dark themes
- Serif/sans type, text size, line spacing, and code wrapping controls
- Chapter progress and automatic resume
- Chapter search and internal section links
- Highlights, notes, chapter bookmarks, and a local notebook
- Copy buttons for code examples
- Automatic offline caching for every chapter—no download step; illustrations cache when a book is opened online
- Installable PWA metadata for “Add to Home Screen”
- Basic PDF support for future local publications

Reader data is stored in the browser on the current device. Clearing site data removes progress, annotations, and bookmarks.

## Preview locally

From this folder, run:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main`, keep the folder set to `/ (root)`, and save.
5. Open the Pages URL on your phone and choose **Add to Home Screen** from the browser share menu.

The `.nojekyll` file keeps GitHub Pages in simple static-file mode.

## Add another publication

Publications live in `data/publications.json`.

`scripts/import-publications.mjs` refreshes the locally bundled copies of sources that do not permit cross-origin browser fetching. Run it from the repository root with Node.js when those upstream editions change.

For another cross-origin HTML publication, add an item with `type: "remote-html"`, a table-of-contents `sourceUrl`, and its `baseUrl`. The source must allow browser CORS requests.

For a PDF uploaded into this repository, place it under `publications/` and add an entry like:

```json
{
  "id": "example-paper",
  "title": "Example Paper",
  "shortTitle": "Example Paper",
  "authors": "Author Name",
  "description": "A useful engineering paper.",
  "type": "pdf",
  "sourceUrl": "publications/example-paper.pdf",
  "publisher": "Publisher",
  "license": "Used with permission",
  "licenseUrl": "https://example.com",
  "topics": ["Architecture", "Systems"]
}
```

PDFs currently use the browser’s built-in viewer. A future PDF-specific layer can add text highlights and annotations when the first PDF is supplied.

## Content rights

Included books remain hosted by their publishers or authors. Margin fetches, restyles, or embeds the official pages for reading, while preserving title/author attribution and linking back to the original source and license. Software Engineering at Google is published under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). Distributed Systems for Fun and Profit is shown from the author-hosted online edition and is not bundled for offline use.
