const MESSENGER_URL = "https://messenger.com/";
const MESSENGER_MATCH = "https://messenger.com/*";
const GROUP_TITLE = "Messenger";
const TAB_KEY = "messengerTabId";
const OPEN_KEY = "panelOpen";
const LAST_TAB_KEY = "lastActiveTabId";

async function getActiveTabInCurrentWindow() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab ?? null;
}

async function findMessengerTab() {
  const tabs = await chrome.tabs.query({ url: MESSENGER_MATCH });
  return tabs[0] ?? null;
}

async function rememberReturnTab() {
  const tab = await getActiveTabInCurrentWindow();
  if (tab?.id && !tab.url?.startsWith("https://messenger.com")) {
    await chrome.storage.session.set({ [LAST_TAB_KEY]: tab.id });
  }
}

async function focusReturnTab() {
  const { [LAST_TAB_KEY]: tabId } = await chrome.storage.session.get(
    LAST_TAB_KEY
  );
  if (!tabId) return;

  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // previous tab was closed
  }
}

async function ensureGroup(tab) {
  if (tab.groupId !== -1) {
    await chrome.tabGroups.update(tab.groupId, {
      title: GROUP_TITLE,
      collapsed: false,
    });
    return tab.groupId;
  }

  const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, {
    title: GROUP_TITLE,
    collapsed: false,
    color: "blue",
  });
  return groupId;
}

async function openMessengerPanel() {
  await rememberReturnTab();

  let tab = await findMessengerTab();
  const active = await getActiveTabInCurrentWindow();

  if (!tab) {
    tab = await chrome.tabs.create({
      url: MESSENGER_URL,
      active: true,
      pinned: true,
      windowId: active?.windowId,
    });
  } else {
    if (active?.windowId != null && tab.windowId !== active.windowId) {
      tab = await chrome.tabs.move(tab.id, {
        windowId: active.windowId,
        index: -1,
      });
    }
    await chrome.tabs.update(tab.id, { active: true, pinned: true });
  }

  await ensureGroup(tab);
  await chrome.storage.session.set({
    [TAB_KEY]: tab.id,
    [OPEN_KEY]: true,
  });
}

async function hideMessengerPanel() {
  const { [TAB_KEY]: tabId } = await chrome.storage.session.get(TAB_KEY);
  if (!tabId) {
    await chrome.storage.session.set({ [OPEN_KEY]: false });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId !== -1) {
      await chrome.tabGroups.update(tab.groupId, { collapsed: true });
    }
  } catch {
    await chrome.storage.session.remove(TAB_KEY);
  }

  await focusReturnTab();
  await chrome.storage.session.set({ [OPEN_KEY]: false });
}

async function isPanelOpen() {
  const { [OPEN_KEY]: open, [TAB_KEY]: tabId } =
    await chrome.storage.session.get([OPEN_KEY, TAB_KEY]);
  if (!open || !tabId) return false;

  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

async function toggleMessengerPanel() {
  if (await isPanelOpen()) {
    await hideMessengerPanel();
  } else {
    await openMessengerPanel();
  }
}

async function clearPanelState() {
  await chrome.storage.session.remove([TAB_KEY, OPEN_KEY, LAST_TAB_KEY]);
}

chrome.action.onClicked.addListener(() => {
  toggleMessengerPanel();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-messenger") {
    toggleMessengerPanel();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [TAB_KEY]: storedId } = await chrome.storage.session.get(TAB_KEY);
  if (storedId === tabId) {
    await clearPanelState();
  }
});
