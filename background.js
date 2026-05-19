/**
 * Focus Trail Tabs — MV3 service worker
 *
 * When you switch tabs:
 *   • tab you just left  → 🟢 (immediate previous)
 *   • prior 🟢 tab       → 🟠 (second previous)
 *   • older markers      → removed
 *
 * Example: Dashboard → Messenger → GitHub
 *   🟠 Dashboard | 🟢 Messenger | GitHub (active, no marker)
 */

// --- Marker constants -------------------------------------------------------

const MARKER_PREV = "🟢 "; // tab you just left
const MARKER_SECOND = "🟠 "; // tab before that

/** Prefixes stripped before reading or storing the “base” title */
const MARKER_PREFIXES = [MARKER_PREV, MARKER_SECOND];

// --- Tab trail state (in-memory; resets when the service worker restarts) ---

/** @type {number | null} */
let currentTabId = null;

/** @type {number | null} Tab that should show 🟢 */
let previousTabId = null;

/** @type {number | null} Tab that should show 🟠 */
let secondPreviousTabId = null;

/**
 * Base document.title per tab (never includes our markers).
 * @type {Map<number, string>}
 */
const originalTitles = new Map();

/**
 * Which marker is currently applied per tab.
 * @type {Map<number, "prev" | "second">}
 */
const appliedMarkers = new Map();

// --- URL guards -------------------------------------------------------------

/**
 * Browser-internal pages cannot be scripted; skip them quietly.
 * @param {string | undefined} url
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("extension://") ||
    lower.startsWith("about:") ||
    lower.startsWith("devtools://")
  );
}

// --- Title helpers ----------------------------------------------------------

/**
 * Remove our markers from a title string.
 * @param {string} title
 */
function stripMarkers(title) {
  for (const prefix of MARKER_PREFIXES) {
    if (title.startsWith(prefix)) {
      return title.slice(prefix.length);
    }
  }
  return title;
}

/**
 * Remember the canonical title for a tab (marker-free).
 * @param {number} tabId
 * @param {string} titleFromPage
 */
function rememberOriginalTitle(tabId, titleFromPage) {
  const base = stripMarkers(titleFromPage);
  if (!originalTitles.has(tabId)) {
    originalTitles.set(tabId, base);
    return;
  }
  // Only update if the page title changed without our prefix (user/site renamed tab).
  const stored = originalTitles.get(tabId);
  const currentBase = stripMarkers(titleFromPage);
  if (currentBase !== stored && !titleFromPage.startsWith(MARKER_PREV) && !titleFromPage.startsWith(MARKER_SECOND)) {
    originalTitles.set(tabId, currentBase);
  }
}

// --- Script injection -------------------------------------------------------

/**
 * Run a small function in the tab to set document.title.
 * Returns the stripped title read from the page, or null on failure.
 *
 * @param {number} tabId
 * @param {"prev" | "second" | "none"} marker
 */
async function setTabTitleMarker(tabId, marker) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return null;
  }

  if (isRestrictedUrl(tab.url)) {
    return null;
  }

  const prefix =
    marker === "prev" ? MARKER_PREV : marker === "second" ? MARKER_SECOND : "";

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (markerPrefix, green, orange) => {
      function strip(t) {
        if (t.startsWith(green)) return t.slice(green.length);
        if (t.startsWith(orange)) return t.slice(orange.length);
        return t;
      }

      const base = strip(document.title);
      document.title = markerPrefix ? markerPrefix + base : base;
      return base;
    },
    args: [prefix, MARKER_PREV, MARKER_SECOND],
  });

  const baseTitle = results?.[0]?.result;
  if (typeof baseTitle === "string") {
    rememberOriginalTitle(tabId, baseTitle);
    if (marker === "none") {
      appliedMarkers.delete(tabId);
    } else {
      appliedMarkers.set(tabId, marker);
    }
  }
  return baseTitle ?? null;
}

// --- Marker orchestration ---------------------------------------------------

/**
 * Remove trail markers from every tab except the two we are tracking.
 */
async function clearStaleMarkers() {
  const keep = new Set(
    [previousTabId, secondPreviousTabId].filter((id) => id != null)
  );

  for (const [tabId] of appliedMarkers) {
    if (!keep.has(tabId)) {
      await setTabTitleMarker(tabId, "none");
    }
  }
}

/**
 * Apply 🟢 / 🟠 to the current trail and strip markers elsewhere.
 */
async function refreshMarkers() {
  await clearStaleMarkers();

  if (previousTabId != null) {
    await setTabTitleMarker(previousTabId, "prev");
  }
  if (secondPreviousTabId != null) {
    await setTabTitleMarker(secondPreviousTabId, "second");
  }

  // Active tab should never keep a trail marker.
  if (currentTabId != null && appliedMarkers.has(currentTabId)) {
    await setTabTitleMarker(currentTabId, "none");
  }
}

// --- Tab switch handling ----------------------------------------------------

/**
 * Called when the user activates a different tab.
 * @param {{ tabId: number; windowId: number }} activeInfo
 */
async function onTabActivated(activeInfo) {
  const newTabId = activeInfo.tabId;
  const leftTabId = currentTabId;

  if (leftTabId != null && leftTabId !== newTabId) {
    secondPreviousTabId = previousTabId;
    previousTabId = leftTabId;
  }

  currentTabId = newTabId;
  await refreshMarkers();
}

/**
 * Drop closed tabs from trail state and title caches.
 * @param {number} tabId
 */
function onTabRemoved(tabId) {
  originalTitles.delete(tabId);
  appliedMarkers.delete(tabId);

  if (tabId === currentTabId) currentTabId = null;
  if (tabId === previousTabId) previousTabId = null;
  if (tabId === secondPreviousTabId) secondPreviousTabId = null;
}

/**
 * Seed current tab on install / browser startup.
 */
async function seedCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      currentTabId = tab.id;
    }
  } catch {
    // ignore
  }
}

// --- Listeners --------------------------------------------------------------

chrome.tabs.onActivated.addListener((activeInfo) => {
  onTabActivated(activeInfo).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  seedCurrentTab();
});

chrome.runtime.onStartup.addListener(() => {
  seedCurrentTab();
});

// Service worker may wake cold — initialize once at load.
seedCurrentTab();
