# Focus Trail Tabs

Chrome/Edge extension (Manifest V3) that marks tab titles so you can see where you just came from while multitasking.

**Trail markers**

| Marker | Meaning |
|--------|---------|
| 🟢 | Tab you **just left** (immediate previous) |
| 🟠 | Tab before that (second previous) |

**Example:** Dashboard → Messenger → GitHub

| Tab | Title |
|-----|--------|
| Dashboard | 🟠 Dashboard |
| Messenger | 🟢 Messenger |
| GitHub | GitHub (active — no marker) |

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest (`tabs`, `scripting`, `<all_urls>`) |
| `background.js` | Service worker: `chrome.tabs.onActivated`, title injection |

## Load in Chrome or Edge

1. Open extensions:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder (the one containing `manifest.json`).
5. Switch between a few normal web tabs (e.g. Gmail, GitHub, docs) and watch titles update.

**Reload after code changes:** open the extension card → **Reload**, or use “Update” on the extensions page.

## How it works

1. `chrome.tabs.onActivated` fires when you change tabs.
2. The tab you left becomes **previous** (🟢); the old previous becomes **second** (🟠).
3. `chrome.scripting.executeScript` sets `document.title` in each tab.
4. Original titles are stored without markers; markers are stripped before re-applying so they never stack.
5. `chrome://`, `edge://`, and similar URLs are skipped (scripting not allowed).

## Optional future work (TODO)

- [ ] **Favicon indicators** — draw 🟢/🟠 on the tab icon via `canvas` + `chrome.action` or `declarativeNetRequest` / content script overlay (titles-only today).
- [ ] **Keyboard shortcut return** — e.g. `Alt+Shift+[` to jump back to 🟢 then 🟠 tab via `chrome.commands`.
- [ ] **Temporary work-tab pinning** — pin the “focus” tab while trail markers stay on others.
- [ ] **Heatmap / recent workflow** — session history of tab switches for analytics or a popup timeline.

## Notes

- Trail state lives in the service worker memory; it resets if the worker is killed (normal for MV3).
- Sites that constantly rewrite `document.title` may fight the extension; a later version could use a `MutationObserver` in an injected script.
