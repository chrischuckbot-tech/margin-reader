# Margin

Margin is a static, installable reading app for software engineering books, papers, and PDFs. It is designed to run free on GitHub Pages with no account, backend, analytics, or build step.

## Included now

- Software Engineering at Google, read directly from the official Abseil HTML edition
- Light, sepia, and dark themes
- Serif/sans type, text size, line spacing, and code wrapping controls
- Chapter progress and automatic resume
- Chapter search and internal section links
- Highlights, notes, chapter bookmarks, and a local notebook
- Copy buttons for code examples
- Automatic offline caching for chapter text and illustrations—no download step
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

The included book remains hosted by its publisher. Margin fetches and restyles the official pages for reading, while preserving title/author attribution and linking each chapter back to its original source and license. Software Engineering at Google is published under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).
