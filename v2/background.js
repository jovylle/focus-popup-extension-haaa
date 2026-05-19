const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 800;
const MESSENGER_URL = "https://messenger.com";
const STORAGE_KEY = "messengerWindowId";

async function getRightDockedBounds() {
  const displays = await chrome.system.display.getInfo();
  const primary =
    displays.find((d) => d.isPrimary) ?? displays[0];
  const { left, top, width, height } = primary.workArea;

  return {
    left: left + width - POPUP_WIDTH,
    top,
    width: POPUP_WIDTH,
    height: Math.min(POPUP_HEIGHT, height),
  };
}

async function getStoredWindowId() {
  const { [STORAGE_KEY]: id } = await chrome.storage.session.get(STORAGE_KEY);
  return id ?? null;
}

async function clearStoredWindowId() {
  await chrome.storage.session.remove(STORAGE_KEY);
}

async function storeWindowId(windowId) {
  await chrome.storage.session.set({ [STORAGE_KEY]: windowId });
}

async function messengerWindowStillOpen(windowId) {
  try {
    const win = await chrome.windows.get(windowId, { populate: true });
    return win.tabs?.some((tab) =>
      tab.url?.startsWith("https://messenger.com")
    );
  } catch {
    return false;
  }
}

async function closeMessengerPopup(windowId) {
  try {
    await chrome.windows.remove(windowId);
  } catch {
    // already closed
  }
  await clearStoredWindowId();
}

async function openMessengerPopup() {
  const { left, top, width, height } = await getRightDockedBounds();

  const win = await chrome.windows.create({
    url: MESSENGER_URL,
    type: "popup",
    focused: true,
    left,
    top,
    width,
    height,
  });

  if (win.id != null) {
    await storeWindowId(win.id);
  }
}

async function toggleMessengerPopup() {
  const windowId = await getStoredWindowId();

  if (windowId != null && (await messengerWindowStillOpen(windowId))) {
    await closeMessengerPopup(windowId);
    return;
  }

  await clearStoredWindowId();
  await openMessengerPopup();
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-messenger") {
    toggleMessengerPopup();
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const storedId = await getStoredWindowId();
  if (storedId === windowId) {
    await clearStoredWindowId();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "toggle-messenger") {
    toggleMessengerPopup().then(() => sendResponse({ ok: true }));
    return true;
  }
});
