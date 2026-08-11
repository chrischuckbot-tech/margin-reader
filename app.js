const APP_CACHE = "margin-content-v1";
const STORAGE = {
  settings: "margin:settings",
  progress: "margin:progress",
  highlights: "margin:highlights",
  bookmarks: "margin:bookmarks",
  offline: "margin:offline",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  libraryView: $("#library-view"),
  readerView: $("#reader-view"),
  publicationGrid: $("#publication-grid"),
  libraryCount: $("#library-count"),
  installButton: $("#install-button"),
  libraryThemeButton: $("#library-theme-button"),
  backButton: $("#back-button"),
  readerBookTitle: $("#reader-book-title"),
  readerChapterTitle: $("#reader-chapter-title"),
  tocBookTitle: $("#toc-book-title"),
  tocPanel: $("#toc-panel"),
  tocList: $("#toc-list"),
  tocSearch: $("#toc-search"),
  tocToggleButton: $("#toc-toggle-button"),
  tocCloseButton: $("#toc-close-button"),
  readerTitleButton: $("#reader-title-button"),
  chapterContent: $("#chapter-content"),
  chapterLoading: $("#chapter-loading"),
  chapterNavigation: $("#chapter-navigation"),
  previousChapterButton: $("#previous-chapter-button"),
  nextChapterButton: $("#next-chapter-button"),
  topProgressFill: $("#top-progress-fill"),
  bookmarkButton: $("#bookmark-button"),
  notebookButton: $("#notebook-button"),
  notebookPanel: $("#notebook-panel"),
  notebookCloseButton: $("#notebook-close-button"),
  notebookList: $("#notebook-list"),
  settingsButton: $("#settings-button"),
  settingsDialog: $("#settings-dialog"),
  noteDialog: $("#note-dialog"),
  noteForm: $("#note-form"),
  noteQuote: $("#note-quote"),
  noteText: $("#note-text"),
  saveNoteButton: $("#save-note-button"),
  selectionToolbar: $("#selection-toolbar"),
  addNoteButton: $("#add-note-button"),
  fontSizeOutput: $("#font-size-output"),
  fontDecrease: $("#font-decrease"),
  fontIncrease: $("#font-increase"),
  lineHeightInput: $("#line-height-input"),
  codeWrapInput: $("#code-wrap-input"),
  downloadButton: $("#download-button"),
  downloadProgressFill: $("#download-progress-fill"),
  offlineStatus: $("#offline-status"),
  offlineCount: $("#offline-count"),
  scrim: $("#scrim"),
  toast: $("#toast"),
};

const state = {
  publications: [],
  publication: null,
  chapters: [],
  chapterIndex: 0,
  currentUrl: "",
  pendingSelection: null,
  notebookTab: "highlights",
  installPrompt: null,
  scrollTimer: null,
  toastTimer: null,
  settings: loadJSON(STORAGE.settings, {
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    font: "serif",
    fontSize: 19,
    lineHeight: 1.8,
    codeWrap: false,
  }),
};

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Could not save on this device");
  }
}

function escapeHTML(value = "") {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function truncate(value, length = 170) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trim()}…` : clean;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2400);
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty("--reader-leading", state.settings.lineHeight);
  els.chapterContent.classList.toggle("sans", state.settings.font === "sans");
  els.chapterContent.classList.toggle("code-wrap", state.settings.codeWrap);
  els.fontSizeOutput.value = `${state.settings.fontSize}px`;
  els.fontSizeOutput.textContent = `${state.settings.fontSize}px`;
  els.lineHeightInput.value = state.settings.lineHeight;
  els.codeWrapInput.checked = state.settings.codeWrap;
  $$('[data-theme-value]').forEach((button) => button.classList.toggle("active", button.dataset.themeValue === state.settings.theme));
  $$('[data-font-value]').forEach((button) => button.classList.toggle("active", button.dataset.fontValue === state.settings.font));
  const themeColor = state.settings.theme === "dark" ? "#151714" : state.settings.theme === "sepia" ? "#f0e5cf" : "#f4f0e8";
  $('meta[name="theme-color"]').content = themeColor;
  saveJSON(STORAGE.settings, state.settings);
}

async function init() {
  applySettings();
  bindEvents();
  registerServiceWorker();
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIos && !isStandalone) els.installButton.hidden = false;

  try {
    const response = await fetch("data/publications.json");
    if (!response.ok) throw new Error(`Library returned ${response.status}`);
    state.publications = await response.json();
    renderLibrary();
    await restoreRoute();
  } catch (error) {
    els.publicationGrid.innerHTML = `<p class="notebook-empty">The library could not load. ${escapeHTML(error.message)}</p>`;
  }
}

function bindEvents() {
  els.backButton.addEventListener("click", showLibrary);
  els.libraryThemeButton.addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applySettings();
  });
  els.tocToggleButton.addEventListener("click", () => togglePanel("toc", true));
  els.tocCloseButton.addEventListener("click", closePanels);
  els.readerTitleButton.addEventListener("click", () => togglePanel("toc", true));
  els.notebookButton.addEventListener("click", () => togglePanel("notebook", true));
  els.notebookCloseButton.addEventListener("click", closePanels);
  els.scrim.addEventListener("click", closePanels);
  els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());
  els.bookmarkButton.addEventListener("click", toggleBookmark);
  els.tocSearch.addEventListener("input", renderToc);
  els.downloadButton.addEventListener("click", downloadPublication);
  els.previousChapterButton.addEventListener("click", () => loadChapter(state.chapterIndex - 1));
  els.nextChapterButton.addEventListener("click", () => loadChapter(state.chapterIndex + 1));
  els.chapterContent.addEventListener("click", handleChapterClick);
  els.chapterContent.addEventListener("mouseup", handleSelection);
  els.chapterContent.addEventListener("touchend", () => setTimeout(handleSelection, 80));
  document.addEventListener("selectionchange", () => {
    if (!window.getSelection()?.toString().trim()) hideSelectionToolbar();
  });
  $$('[data-highlight-color]').forEach((button) => button.addEventListener("click", () => saveHighlight(button.dataset.highlightColor)));
  els.addNoteButton.addEventListener("click", openNoteDialog);
  els.saveNoteButton.addEventListener("click", (event) => {
    event.preventDefault();
    saveHighlight("yellow", els.noteText.value.trim());
    els.noteDialog.close();
  });
  $$('[data-notebook-tab]').forEach((button) => button.addEventListener("click", () => {
    state.notebookTab = button.dataset.notebookTab;
    $$('[data-notebook-tab]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", selected);
    });
    renderNotebook();
  }));
  $$('[data-theme-value]').forEach((button) => button.addEventListener("click", () => {
    state.settings.theme = button.dataset.themeValue;
    applySettings();
  }));
  $$('[data-font-value]').forEach((button) => button.addEventListener("click", () => {
    state.settings.font = button.dataset.fontValue;
    applySettings();
  }));
  els.fontDecrease.addEventListener("click", () => changeFontSize(-1));
  els.fontIncrease.addEventListener("click", () => changeFontSize(1));
  els.lineHeightInput.addEventListener("input", () => {
    state.settings.lineHeight = Number(els.lineHeightInput.value);
    applySettings();
  });
  els.codeWrapInput.addEventListener("change", () => {
    state.settings.codeWrap = els.codeWrapInput.checked;
    applySettings();
  });
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("popstate", restoreRoute);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installButton.hidden = false;
  });
  els.installButton.addEventListener("click", installApp);
  document.addEventListener("keydown", handleKeyboard);
}

function renderLibrary() {
  const progress = loadJSON(STORAGE.progress, {});
  els.libraryCount.textContent = `${state.publications.length} publication${state.publications.length === 1 ? "" : "s"}`;
  els.publicationGrid.innerHTML = state.publications.map((publication) => {
    const saved = progress[publication.id] || {};
    const percent = Math.round(saved.overallPercent || 0);
    const label = saved.chapterTitle ? `Continue · ${saved.chapterTitle}` : "Start reading";
    return `
      <button class="book-card" type="button" data-publication-id="${escapeHTML(publication.id)}">
        <span class="book-cover" aria-hidden="true">
          <span class="cover-kicker">${escapeHTML(publication.publisher || "Technical reading")}</span>
          <strong class="cover-title">${escapeHTML(publication.title)}</strong>
          <span class="cover-mark">{ }</span>
        </span>
        <span class="book-meta">
          <span class="book-topics">${(publication.topics || []).map((topic) => `<span class="topic-tag">${escapeHTML(topic)}</span>`).join("")}</span>
          <h3>${escapeHTML(publication.title)}</h3>
          <span class="book-author">${escapeHTML(publication.authors)}</span>
          <span class="book-progress-wrap">
            <span class="book-progress-label"><span>${escapeHTML(label)}</span><span>${percent}%</span></span>
            <span class="book-progress"><span style="width:${percent}%"></span></span>
          </span>
        </span>
      </button>`;
  }).join("");
  $$('[data-publication-id]', els.publicationGrid).forEach((button) => button.addEventListener("click", () => openPublication(button.dataset.publicationId)));
}

async function restoreRoute() {
  const params = new URLSearchParams(location.search);
  const publicationId = params.get("book");
  if (!publicationId) {
    showLibrary(false);
    return;
  }
  const chapterUrl = params.get("chapter");
  await openPublication(publicationId, chapterUrl, false);
}

function showLibrary(push = true) {
  saveProgress();
  closePanels();
  els.readerView.hidden = true;
  els.libraryView.hidden = false;
  document.body.classList.remove("reading");
  document.title = "Margin — Software Engineering Reader";
  if (push) history.pushState({}, "", location.pathname);
  renderLibrary();
  window.scrollTo(0, 0);
}

async function openPublication(id, requestedChapterUrl = null, push = true) {
  const publication = state.publications.find((item) => item.id === id);
  if (!publication) return showLibrary(push);
  state.publication = publication;
  els.libraryView.hidden = true;
  els.readerView.hidden = false;
  document.body.classList.add("reading");
  els.readerBookTitle.textContent = publication.shortTitle || publication.title;
  els.tocBookTitle.textContent = publication.title;

  try {
    if (!state.chapters.length || state.chapters[0]?.publicationId !== publication.id) {
      state.chapters = await fetchToc(publication);
    }
    const progress = loadJSON(STORAGE.progress, {})[publication.id] || {};
    const requested = requestedChapterUrl ? decodeURIComponent(requestedChapterUrl) : progress.chapterUrl;
    let index = state.chapters.findIndex((chapter) => sameDocument(chapter.url, requested));
    if (index < 0) index = Math.min(progress.chapterIndex || 0, state.chapters.length - 1);
    renderToc();
    updateOfflineStatus();
    await loadChapter(index, requested?.includes("#") ? new URL(requested).hash : "", push);
  } catch (error) {
    renderChapterError(error);
  }
}

async function fetchToc(publication) {
  if (publication.type === "pdf") {
    return [{ publicationId: publication.id, title: publication.title, url: publication.sourceUrl, type: "pdf", label: "PDF" }];
  }
  const html = await fetchText(publication.sourceUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = $$("nav[data-type='toc'] > ol > li", doc);
  const seen = new Set();
  return items.flatMap((item) => {
    const anchor = $(":scope > a", item);
    if (!anchor) return [];
    const url = new URL(anchor.getAttribute("href"), publication.baseUrl).href;
    const documentUrl = url.split("#")[0];
    if (seen.has(documentUrl)) return [];
    seen.add(documentUrl);
    const type = item.dataset.type || "section";
    return [{
      publicationId: publication.id,
      title: anchor.textContent.trim(),
      url,
      type,
      label: chapterLabel(type),
    }];
  });
}

function chapterLabel(type) {
  if (type === "chapter") return "Chapter";
  if (type === "part") return "Part";
  if (type === "foreword") return "Foreword";
  if (type === "preface") return "Preface";
  return "Section";
}

function renderToc() {
  if (!state.publication) return;
  const query = els.tocSearch.value.trim().toLowerCase();
  const chapters = state.chapters.map((chapter, index) => ({ ...chapter, index }))
    .filter((chapter) => !query || `${chapter.title} ${chapter.label}`.toLowerCase().includes(query));
  els.tocList.innerHTML = chapters.length ? chapters.map((chapter) => `
    <button class="toc-item ${chapter.index === state.chapterIndex ? "active" : ""}" type="button" data-chapter-index="${chapter.index}">
      <span class="toc-number">${String(chapter.index + 1).padStart(2, "0")}</span>
      <strong>${escapeHTML(chapter.title)}</strong>
      <small>${escapeHTML(chapter.label)}</small>
    </button>`).join("") : `<p class="notebook-empty">No chapters match “${escapeHTML(query)}”.</p>`;
  $$('[data-chapter-index]', els.tocList).forEach((button) => button.addEventListener("click", () => {
    loadChapter(Number(button.dataset.chapterIndex));
    closePanels();
  }));
  requestAnimationFrame(() => $(".toc-item.active", els.tocList)?.scrollIntoView({ block: "nearest" }));
}

async function fetchText(url, preferCache = false) {
  let cache;
  if ("caches" in window) cache = await caches.open(APP_CACHE);
  if (preferCache && cache) {
    const cached = await cache.match(url);
    if (cached) return cached.text();
  }
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    if (cache) await cache.put(url, response.clone());
    return response.text();
  } catch (error) {
    if (cache) {
      const cached = await cache.match(url);
      if (cached) return cached.text();
    }
    throw error;
  }
}

async function loadChapter(index, hash = "", push = true) {
  if (index < 0 || index >= state.chapters.length) return;
  saveProgress();
  hideSelectionToolbar();
  state.chapterIndex = index;
  const chapter = state.chapters[index];
  state.currentUrl = chapter.url.split("#")[0];
  els.chapterLoading.hidden = false;
  els.chapterContent.hidden = true;
  els.chapterNavigation.hidden = true;
  els.readerChapterTitle.textContent = chapter.title;
  els.bookmarkButton.classList.toggle("active", isCurrentChapterBookmarked());
  els.bookmarkButton.setAttribute("aria-label", isCurrentChapterBookmarked() ? "Remove chapter bookmark" : "Bookmark this chapter");
  renderToc();

  try {
    if (state.publication.type === "pdf") {
      renderPdf(state.publication);
    } else {
      const html = await fetchText(state.currentUrl, true);
      const doc = new DOMParser().parseFromString(html, "text/html");
      renderDocument(doc, state.currentUrl);
    }
    els.chapterLoading.hidden = true;
    els.chapterContent.hidden = false;
    els.chapterNavigation.hidden = false;
    renderChapterNavigation();
    renderNotebook();
    document.title = `${chapter.title} — Margin`;
    const route = `${location.pathname}?book=${encodeURIComponent(state.publication.id)}&chapter=${encodeURIComponent(chapter.url)}`;
    if (push) history.pushState({}, "", route);
    else history.replaceState({}, "", route);
    await restoreChapterPosition(hash || new URL(chapter.url).hash);
    updateReadingProgress();
  } catch (error) {
    renderChapterError(error);
  }
}

function renderDocument(doc, baseUrl) {
  const source = doc.body.cloneNode(true);
  $$('script, style, nav, [data-type="indexterm"]', source).forEach((node) => node.remove());
  $$('[contenteditable]', source).forEach((node) => node.removeAttribute("contenteditable"));
  $$('img', source).forEach((image) => {
    const src = image.getAttribute("src");
    if (src) image.src = new URL(src, baseUrl).href;
    image.loading = "lazy";
    image.decoding = "async";
  });
  $$('a', source).forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    anchor.href = new URL(href, baseUrl).href;
    if (new URL(anchor.href).origin !== new URL(baseUrl).origin) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
  });
  els.chapterContent.replaceChildren(...source.childNodes);
  const attribution = document.createElement("footer");
  attribution.className = "source-attribution";
  attribution.innerHTML = `
    <p><strong>${escapeHTML(state.publication.title)}</strong> by ${escapeHTML(state.publication.authors)}.</p>
    <p>Read from <a href="${escapeHTML(baseUrl)}" target="_blank" rel="noopener noreferrer">the original publication</a>. Content is provided under <a href="${escapeHTML(state.publication.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(state.publication.license)}</a>.</p>`;
  els.chapterContent.append(attribution);
  applyStoredHighlights();
  addCodeControls();
  applySettings();
}

function renderPdf(publication) {
  els.chapterContent.innerHTML = `<iframe title="${escapeHTML(publication.title)}" src="${escapeHTML(publication.sourceUrl)}" style="width:100%;height:calc(100vh - 150px);border:1px solid var(--line)"></iframe>`;
}

function renderChapterError(error) {
  els.chapterLoading.hidden = true;
  els.chapterContent.hidden = false;
  els.chapterContent.innerHTML = `
    <section>
      <p class="panel-kicker">Reading interrupted</p>
      <h1>This chapter could not load.</h1>
      <p>${escapeHTML(error.message || "Check your connection and try again.")}</p>
      <button class="quiet-button" type="button" id="retry-chapter">Try again</button>
    </section>`;
  $("#retry-chapter")?.addEventListener("click", () => loadChapter(state.chapterIndex));
}

function renderChapterNavigation() {
  const previous = state.chapters[state.chapterIndex - 1];
  const next = state.chapters[state.chapterIndex + 1];
  els.previousChapterButton.hidden = !previous;
  els.nextChapterButton.hidden = !next;
  $("strong", els.previousChapterButton).textContent = previous?.title || "";
  $("strong", els.nextChapterButton).textContent = next?.title || "";
}

async function restoreChapterPosition(hash) {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (hash) {
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) {
      target.scrollIntoView({ block: "start" });
      return;
    }
  }
  const progress = loadJSON(STORAGE.progress, {})[state.publication.id];
  const savedScroll = progress && sameDocument(progress.chapterUrl, state.currentUrl) ? progress.scrollY : 0;
  window.scrollTo(0, savedScroll || 0);
}

function sameDocument(left, right) {
  if (!left || !right) return false;
  try { return new URL(left, location.href).href.split("#")[0] === new URL(right, location.href).href.split("#")[0]; }
  catch { return left.split("#")[0] === right.split("#")[0]; }
}

function handleChapterClick(event) {
  const copyButton = event.target.closest(".copy-code-button");
  if (copyButton) {
    const code = copyButton.parentElement.cloneNode(true);
    $(".copy-code-button", code)?.remove();
    navigator.clipboard.writeText(code.textContent).then(() => {
      copyButton.textContent = "Copied";
      setTimeout(() => { copyButton.textContent = "Copy"; }, 1300);
    });
    return;
  }
  const highlight = event.target.closest("mark.reader-highlight");
  if (highlight) {
    const item = getHighlights().find((entry) => entry.id === highlight.dataset.highlightId);
    if (item?.note) {
      togglePanel("notebook", true);
      state.notebookTab = "highlights";
      renderNotebook();
      requestAnimationFrame(() => $(`[data-note-id="${CSS.escape(item.id)}"]`, els.notebookList)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
    return;
  }
  const anchor = event.target.closest("a");
  if (!anchor || anchor.target === "_blank") return;
  const url = new URL(anchor.href);
  const index = state.chapters.findIndex((chapter) => sameDocument(chapter.url, url.href));
  if (index >= 0) {
    event.preventDefault();
    if (index === state.chapterIndex && url.hash) {
      document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      loadChapter(index, url.hash);
    }
  }
}

function addCodeControls() {
  $$("pre", els.chapterContent).forEach((pre) => {
    const button = document.createElement("button");
    button.className = "copy-code-button";
    button.type = "button";
    button.textContent = "Copy";
    button.dataset.readerUi = "true";
    button.setAttribute("aria-label", "Copy code block");
    pre.append(button);
  });
}

function changeFontSize(delta) {
  state.settings.fontSize = Math.max(15, Math.min(25, state.settings.fontSize + delta));
  applySettings();
}

function handleScroll() {
  if (els.readerView.hidden) return;
  updateReadingProgress();
  clearTimeout(state.scrollTimer);
  state.scrollTimer = setTimeout(saveProgress, 180);
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const chapterPercent = max > 0 ? Math.min(1, scrollY / max) : 1;
  els.topProgressFill.style.width = `${chapterPercent * 100}%`;
}

function saveProgress() {
  if (!state.publication || els.readerView.hidden || !state.chapters.length) return;
  const values = loadJSON(STORAGE.progress, {});
  const max = document.documentElement.scrollHeight - innerHeight;
  const chapterPercent = max > 0 ? Math.min(1, scrollY / max) : 1;
  values[state.publication.id] = {
    chapterIndex: state.chapterIndex,
    chapterUrl: state.currentUrl,
    chapterTitle: state.chapters[state.chapterIndex]?.title,
    scrollY,
    chapterPercent,
    overallPercent: ((state.chapterIndex + chapterPercent) / state.chapters.length) * 100,
    updatedAt: Date.now(),
  };
  saveJSON(STORAGE.progress, values);
}

function handleSelection() {
  const selection = window.getSelection();
  const quote = selection?.toString().replace(/\s+/g, " ").trim();
  if (!selection || selection.rangeCount === 0 || !quote || quote.length < 2) return hideSelectionToolbar();
  const range = selection.getRangeAt(0);
  if (!els.chapterContent.contains(range.commonAncestorContainer)) return hideSelectionToolbar();
  const offsets = getSelectionOffsets(range);
  if (!offsets || offsets.end <= offsets.start) return hideSelectionToolbar();
  const rect = range.getBoundingClientRect();
  state.pendingSelection = { quote, start: offsets.start, end: offsets.end };
  els.selectionToolbar.hidden = false;
  const toolbarWidth = Math.min(250, innerWidth - 24);
  const x = Math.max(toolbarWidth / 2 + 12, Math.min(innerWidth - toolbarWidth / 2 - 12, rect.left + rect.width / 2));
  const y = Math.max(70, rect.top);
  els.selectionToolbar.style.left = `${x}px`;
  els.selectionToolbar.style.top = `${y}px`;
}

function getTextNodes(root = els.chapterContent) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.parentElement?.closest("[data-reader-ui]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function getSelectionOffsets(range) {
  const nodes = getTextNodes();
  let total = 0;
  let start = null;
  let end = null;
  for (const node of nodes) {
    if (node === range.startContainer) start = total + range.startOffset;
    if (node === range.endContainer) end = total + range.endOffset;
    total += node.nodeValue.length;
  }
  if (start === null || end === null) return null;
  return { start, end };
}

function hideSelectionToolbar() {
  els.selectionToolbar.hidden = true;
}

function openNoteDialog() {
  if (!state.pendingSelection) return;
  els.noteQuote.textContent = truncate(state.pendingSelection.quote, 260);
  els.noteText.value = "";
  hideSelectionToolbar();
  els.noteDialog.showModal();
  setTimeout(() => els.noteText.focus(), 80);
}

function getHighlights() {
  return loadJSON(STORAGE.highlights, []).filter((item) => item.publicationId === state.publication?.id);
}

function saveHighlight(color, note = "") {
  if (!state.pendingSelection || !state.publication) return;
  const all = loadJSON(STORAGE.highlights, []);
  const item = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    publicationId: state.publication.id,
    chapterUrl: state.currentUrl,
    chapterTitle: state.chapters[state.chapterIndex]?.title,
    quote: state.pendingSelection.quote,
    start: state.pendingSelection.start,
    end: state.pendingSelection.end,
    color,
    note,
    createdAt: Date.now(),
  };
  all.push(item);
  saveJSON(STORAGE.highlights, all);
  window.getSelection()?.removeAllRanges();
  state.pendingSelection = null;
  hideSelectionToolbar();
  unwrapHighlights();
  applyStoredHighlights();
  renderNotebook();
  showToast(note ? "Highlight and note saved" : "Highlight saved");
}

function unwrapHighlights() {
  $$("mark.reader-highlight", els.chapterContent).forEach((mark) => mark.replaceWith(...mark.childNodes));
  els.chapterContent.normalize();
}

function applyStoredHighlights() {
  const items = getHighlights()
    .filter((item) => sameDocument(item.chapterUrl, state.currentUrl))
    .sort((a, b) => b.start - a.start);
  items.forEach(applyTextHighlight);
}

function applyTextHighlight(item) {
  const nodes = getTextNodes();
  let cursor = 0;
  const matches = [];
  for (const node of nodes) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.nodeValue.length;
    if (item.end > nodeStart && item.start < nodeEnd) {
      matches.push({ node, start: Math.max(0, item.start - nodeStart), end: Math.min(node.nodeValue.length, item.end - nodeStart) });
    }
    cursor = nodeEnd;
    if (cursor >= item.end) break;
  }
  matches.reverse().forEach(({ node, start, end }) => {
    if (end <= start) return;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const mark = document.createElement("mark");
    mark.className = `reader-highlight${item.note ? " has-note" : ""}`;
    mark.dataset.highlightId = item.id;
    mark.dataset.color = item.color;
    try { range.surroundContents(mark); } catch { /* A stale position should not break the chapter. */ }
  });
}

function getBookmarks() {
  return loadJSON(STORAGE.bookmarks, []).filter((item) => item.publicationId === state.publication?.id);
}

function isCurrentChapterBookmarked() {
  return getBookmarks().some((item) => sameDocument(item.chapterUrl, state.currentUrl));
}

function toggleBookmark() {
  if (!state.publication) return;
  const all = loadJSON(STORAGE.bookmarks, []);
  const existingIndex = all.findIndex((item) => item.publicationId === state.publication.id && sameDocument(item.chapterUrl, state.currentUrl));
  if (existingIndex >= 0) {
    all.splice(existingIndex, 1);
    showToast("Bookmark removed");
  } else {
    all.push({
      id: `b-${Date.now()}`,
      publicationId: state.publication.id,
      chapterUrl: state.currentUrl,
      chapterTitle: state.chapters[state.chapterIndex]?.title,
      chapterIndex: state.chapterIndex,
      createdAt: Date.now(),
    });
    showToast("Chapter bookmarked");
  }
  saveJSON(STORAGE.bookmarks, all);
  els.bookmarkButton.classList.toggle("active", isCurrentChapterBookmarked());
  renderNotebook();
}

function renderNotebook() {
  if (!state.publication) return;
  if (state.notebookTab === "bookmarks") {
    const bookmarks = getBookmarks().sort((a, b) => b.createdAt - a.createdAt);
    els.notebookList.innerHTML = bookmarks.length ? bookmarks.map((item) => `
      <article class="note-card bookmark-card" data-bookmark-id="${escapeHTML(item.id)}">
        <strong>${escapeHTML(item.chapterTitle)}</strong>
        <footer><span>Chapter ${item.chapterIndex + 1}</span><button class="note-delete" type="button" aria-label="Delete bookmark">Remove</button></footer>
      </article>`).join("") : `<p class="notebook-empty">Bookmark chapters to build a quick-return list.</p>`;
    $$('[data-bookmark-id]', els.notebookList).forEach((card) => {
      card.addEventListener("click", (event) => {
        const item = bookmarks.find((entry) => entry.id === card.dataset.bookmarkId);
        if (event.target.closest(".note-delete")) return deleteBookmark(item.id);
        loadChapter(item.chapterIndex);
        closePanels();
      });
    });
    return;
  }
  const highlights = getHighlights().sort((a, b) => b.createdAt - a.createdAt);
  els.notebookList.innerHTML = highlights.length ? highlights.map((item) => `
    <article class="note-card" data-note-id="${escapeHTML(item.id)}" data-color="${escapeHTML(item.color)}">
      <blockquote>“${escapeHTML(truncate(item.quote, 190))}”</blockquote>
      ${item.note ? `<p>${escapeHTML(item.note)}</p>` : ""}
      <footer><span>${escapeHTML(item.chapterTitle)}</span><button class="note-delete" type="button" aria-label="Delete highlight">Remove</button></footer>
    </article>`).join("") : `<p class="notebook-empty">Select any passage to highlight it or add a note. Everything stays on this device.</p>`;
  $$('[data-note-id]', els.notebookList).forEach((card) => {
    card.addEventListener("click", (event) => {
      const item = highlights.find((entry) => entry.id === card.dataset.noteId);
      if (event.target.closest(".note-delete")) return deleteHighlight(item.id);
      const index = state.chapters.findIndex((chapter) => sameDocument(chapter.url, item.chapterUrl));
      if (index !== state.chapterIndex) loadChapter(index).then(() => scrollToHighlight(item.id));
      else scrollToHighlight(item.id);
      closePanels();
    });
  });
}

function scrollToHighlight(id) {
  $(`mark[data-highlight-id="${CSS.escape(id)}"]`, els.chapterContent)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteHighlight(id) {
  const all = loadJSON(STORAGE.highlights, []).filter((item) => item.id !== id);
  saveJSON(STORAGE.highlights, all);
  unwrapHighlights();
  applyStoredHighlights();
  renderNotebook();
  showToast("Highlight removed");
}

function deleteBookmark(id) {
  const all = loadJSON(STORAGE.bookmarks, []).filter((item) => item.id !== id);
  saveJSON(STORAGE.bookmarks, all);
  els.bookmarkButton.classList.toggle("active", isCurrentChapterBookmarked());
  renderNotebook();
  showToast("Bookmark removed");
}

function togglePanel(panel, open) {
  const isToc = panel === "toc";
  const target = isToc ? els.tocPanel : els.notebookPanel;
  const other = isToc ? els.notebookPanel : els.tocPanel;
  other.classList.remove("open");
  other.setAttribute("aria-hidden", "true");
  target.classList.toggle("open", open);
  target.setAttribute("aria-hidden", String(!open));
  els.scrim.hidden = !open || (isToc && innerWidth > 760);
  if (panel === "notebook") {
    $(".reader-layout").classList.toggle("notebook-open", open);
    renderNotebook();
  }
  if (open && isToc) setTimeout(() => els.tocSearch.focus(), 180);
}

function closePanels() {
  els.tocPanel.classList.remove("open");
  els.notebookPanel.classList.remove("open");
  els.notebookPanel.setAttribute("aria-hidden", "true");
  $(".reader-layout").classList.remove("notebook-open");
  els.scrim.hidden = true;
}

async function downloadPublication() {
  if (!("caches" in window) || !state.chapters.length) return showToast("Offline storage is not available here");
  els.downloadButton.disabled = true;
  const urls = [state.publication.sourceUrl, ...state.chapters.map((chapter) => chapter.url.split("#")[0])];
  const uniqueUrls = [...new Set(urls)];
  const resourceUrls = new Set();
  let complete = 0;
  let failed = 0;
  for (const url of uniqueUrls) {
    try {
      const html = await fetchText(url);
      const doc = new DOMParser().parseFromString(html, "text/html");
      $$("img[src]", doc).forEach((image) => resourceUrls.add(new URL(image.getAttribute("src"), url).href));
    } catch { failed += 1; }
    complete += 1;
    const percent = (complete / uniqueUrls.length) * 100;
    els.downloadProgressFill.style.width = `${percent}%`;
    els.offlineStatus.textContent = "Downloading";
    els.offlineCount.textContent = `${complete}/${uniqueUrls.length}`;
  }
  let resourcesComplete = 0;
  for (const url of resourceUrls) {
    try { await cacheResource(url); } catch { failed += 1; }
    resourcesComplete += 1;
    const total = uniqueUrls.length + resourceUrls.size;
    const done = complete + resourcesComplete;
    els.downloadProgressFill.style.width = `${(done / total) * 100}%`;
    els.offlineCount.textContent = `${done}/${total}`;
  }
  const total = uniqueUrls.length + resourceUrls.size;
  const offline = loadJSON(STORAGE.offline, {});
  offline[state.publication.id] = { complete: failed === 0, count: total - failed, total, updatedAt: Date.now() };
  saveJSON(STORAGE.offline, offline);
  els.downloadButton.disabled = false;
  updateOfflineStatus();
  showToast(failed ? `${failed} chapter${failed === 1 ? "" : "s"} could not download` : "Publication ready offline");
}

async function cacheResource(url) {
  const cache = await caches.open(APP_CACHE);
  if (await cache.match(url)) return;
  const response = await fetch(url, { mode: "no-cors" });
  await cache.put(url, response);
}

function updateOfflineStatus() {
  const info = loadJSON(STORAGE.offline, {})[state.publication?.id];
  if (!info) {
    els.offlineStatus.textContent = navigator.onLine ? "Available online" : "Not downloaded";
    els.offlineCount.textContent = "";
    els.downloadProgressFill.style.width = "0";
    els.downloadButton.firstChild;
    return;
  }
  els.offlineStatus.textContent = info.complete ? "Ready offline" : "Partly downloaded";
  els.offlineCount.textContent = `${info.count}/${info.total}`;
  els.downloadProgressFill.style.width = `${(info.count / info.total) * 100}%`;
  els.downloadButton.lastChild.textContent = info.complete ? "Refresh offline copy" : "Finish download";
}

function handleKeyboard(event) {
  const typing = /INPUT|TEXTAREA/.test(event.target.tagName);
  if (event.key === "Escape") {
    closePanels();
    hideSelectionToolbar();
  }
  if (typing || els.readerView.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "/") {
    event.preventDefault();
    togglePanel("toc", true);
  }
  if (event.key.toLowerCase() === "b") toggleBookmark();
  if (event.key === "ArrowLeft" && scrollY < 80) loadChapter(state.chapterIndex - 1);
  if (event.key === "ArrowRight" && scrollY > document.documentElement.scrollHeight - innerHeight - 80) loadChapter(state.chapterIndex + 1);
}

async function installApp() {
  if (!state.installPrompt) {
    showToast("In Safari, tap Share, then Add to Home Screen");
    return;
  }
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  els.installButton.hidden = true;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
