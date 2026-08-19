const STORAGE_KEY = "theirFlagCapture";
const MAX_MESSAGES = 2000;
const SCAN_DELAY_MS = 400;
const HISTORY_WAIT_MS = 650;
const MAX_HISTORY_PASSES = 30;

let scanTimer;
let lastPageUrl = location.href;
let historyScanInProgress = false;

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
}

function findSurfaces() {
  const candidates = new Set();

  if (location.pathname.startsWith("/direct/")) {
    document.querySelectorAll("main").forEach((node) => {
      if (node.querySelector('[role="textbox"], textarea')) candidates.add(node);
    });
  } else {
    document.querySelectorAll('[role="textbox"], textarea').forEach((editor) => {
      if (!isVisible(editor)) return;

      // Instagram's home-page chat is not a dialog. The conversation is wrapped
      // by a labelled container (the label is normally the participant's name).
      let labelledContainer = editor.closest("[aria-label]");
      while (labelledContainer && !labelledContainer.querySelector('[role="group"]')) {
        labelledContainer = labelledContainer.parentElement?.closest("[aria-label]");
      }

      if (labelledContainer) candidates.add(labelledContainer);
    });
  }

  return [...candidates].filter(isVisible);
}

function surfaceTitle(surface, index) {
  const profileLink = surface.querySelector('a[aria-label^="Open the profile page of "]');
  const username = profileLink?.getAttribute("aria-label")?.replace("Open the profile page of ", "");
  if (username) return username;

  const title = cleanText(surface.getAttribute("aria-label") || "");
  return title || (location.pathname.startsWith("/direct/") ? "Instagram Direct" : `Floating chat ${index + 1}`);
}

function surfaceId(surface, surfaceIndex) {
  const threadId = location.pathname.match(/^\/direct\/t\/([^/]+)/)?.[1];
  if (threadId) return `thread:${threadId}`;
  return `profile:${surfaceTitle(surface, surfaceIndex).toLowerCase()}`;
}

function timestampFor(group, text) {
  let container = group.parentElement;
  for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
    if (container.querySelectorAll('[role="group"]').length !== 1) continue;
    const containerText = cleanText(container.innerText || "");
    if (containerText === text) continue;
    const timestamp = containerText.match(/(?:Today|Yesterday)?\s*\d{1,2}:\d{2}\s*[AP]M/i)?.[0];
    if (timestamp) return cleanText(timestamp);
  }
  return "";
}

function senderFor(group, conversation) {
  const profileLink = group.querySelector('a[aria-label^="Open the profile page of "]');
  if (profileLink) {
    return profileLink.getAttribute("aria-label").replace("Open the profile page of ", "");
  }

  const bubble = group.querySelector('[role="presentation"]');
  if (bubble) {
    const groupRect = group.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    return bubbleRect.left + bubbleRect.width / 2 > groupRect.left + groupRect.width / 2
      ? "You"
      : conversation;
  }

  return "Unknown";
}

function isSharedContent(group) {
  return [...group.querySelectorAll("a[href]")].some((link) => {
    const href = link.getAttribute("href") || "";
    try {
      return /^\/(?:reel|reels|p|stories|tv)\//.test(new URL(href, location.origin).pathname);
    } catch {
      return false;
    }
  });
}

function extractMessages(surface, surfaceIndex) {
  const conversation = surfaceTitle(surface, surfaceIndex);
  const conversationId = surfaceId(surface, surfaceIndex);
  const groups = [...surface.querySelectorAll('[role="group"]')].filter((group) => (
    isVisible(group) && !group.parentElement?.closest('[role="group"]')
  ));

  return groups.flatMap((group) => {
    const sharedContent = isSharedContent(group);
    const text = sharedContent ? "[Shared reel/post]" : cleanText(group.innerText || "");
    if (!text || text.length > 4000) return [];

    const sender = senderFor(group, conversation);
    const timestampLabel = timestampFor(group, text);
    const fingerprint = hash(`${conversation}|${sender}|${timestampLabel}|${text}`);

    return [{
      id: fingerprint,
      schemaVersion: 4,
      conversationId,
      conversation,
      sender,
      timestampLabel,
      text,
      messageType: sharedContent ? "shared_content" : "text",
      surfaceType: location.pathname.startsWith("/direct/") ? "full" : "popup",
      pageUrl: location.href,
      capturedAt: new Date().toISOString()
    }];
  });
}

async function persist(messages, surfaceCount, { replaceConversations = false } = {}) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const previousCapture = stored[STORAGE_KEY]?.schemaVersion === 5 ? stored[STORAGE_KEY] : {};
  const conversations = { ...(previousCapture.conversations || {}) };
  let lastConversationId = "";
  const grouped = new Map();

  messages.forEach((originalMessage) => {
    const matchingThread = originalMessage.conversationId.startsWith("profile:")
      ? Object.values(conversations).find((item) => item.name === originalMessage.conversation && item.id.startsWith("thread:"))
      : null;
    const message = matchingThread
      ? { ...originalMessage, conversationId: matchingThread.id }
      : originalMessage;
    lastConversationId = message.conversationId;
    if (!grouped.has(message.conversationId)) grouped.set(message.conversationId, []);
    grouped.get(message.conversationId).push(message);
  });

  grouped.forEach((conversationMessages, conversationId) => {
    const existing = conversations[conversationId] || {
      id: conversationId,
      name: conversationMessages[0].conversation,
      messages: []
    };
    const byId = new Map(
      replaceConversations ? [] : existing.messages.map((item) => [item.id, item])
    );
    conversationMessages.forEach((message) => byId.set(message.id, message));
    conversations[conversationId] = {
      ...existing,
      name: conversationMessages[0].conversation,
      messages: [...byId.values()].slice(-MAX_MESSAGES),
      updatedAt: new Date().toISOString()
    };
  });

  const activeConversationId = lastConversationId
    || previousCapture.activeConversationId
    || "";

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      schemaVersion: 5,
      conversations,
      activeConversationId,
      surfaceCount,
      lastScanAt: new Date().toISOString(),
      pageUrl: location.href
    }
  });

}

function scrollContainerFor(surface) {
  const group = surface.querySelector('[role="group"]');
  let node = group?.parentElement;
  while (node && node !== surface.parentElement) {
    const style = getComputedStyle(node);
    if (node.scrollHeight > node.clientHeight + 20 && /(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadVisibleHistory(surface) {
  const scroller = scrollContainerFor(surface);
  if (!scroller) return extractMessages(surface, 0);

  let ordered = [];
  let stablePasses = 0;
  let previousHeight = -1;

  function mergeOlderChunk(current) {
    if (!current.length) return;
    const currentIds = new Set(current.map((message) => message.id));
    ordered = [...current, ...ordered.filter((message) => !currentIds.has(message.id))];
  }

  for (let pass = 0; pass < MAX_HISTORY_PASSES && stablePasses < 2; pass += 1) {
    mergeOlderChunk(extractMessages(surface, 0));
    const beforeHeight = scroller.scrollHeight;
    scroller.scrollTop = 0;
    await wait(HISTORY_WAIT_MS);
    mergeOlderChunk(extractMessages(surface, 0));
    const afterHeight = scroller.scrollHeight;
    stablePasses = scroller.scrollTop <= 2 && afterHeight === beforeHeight && afterHeight === previousHeight
      ? stablePasses + 1
      : 0;
    previousHeight = afterHeight;
  }
  scroller.scrollTop = scroller.scrollHeight;
  return ordered;
}

async function scan({ loadHistory = false } = {}) {
  if (historyScanInProgress && !loadHistory) return { surfaceCount: 0, messageCount: 0 };
  if (loadHistory) historyScanInProgress = true;
  try {
    const surfaces = findSurfaces();
    const messages = loadHistory
      ? (await Promise.all(surfaces.map(loadVisibleHistory))).flat()
      : surfaces.flatMap(extractMessages);
    await persist(messages, surfaces.length, { replaceConversations: loadHistory });
    return { surfaceCount: surfaces.length, messageCount: messages.length };
  } finally {
    if (loadHistory) historyScanInProgress = false;
  }
}

function scheduleScan() {
  if (historyScanInProgress) return;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scan().catch(console.error), SCAN_DELAY_MS);
}

new MutationObserver(() => {
  if (location.href !== lastPageUrl) lastPageUrl = location.href;
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "THEIR_FLAG_SCAN") return false;
  scan({ loadHistory: Boolean(message.loadHistory) }).then((result) => sendResponse({ ok: true, ...result })).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

document.querySelector("#their-flag-status")?.remove();
scheduleScan();
