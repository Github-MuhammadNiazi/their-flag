const STORAGE_KEY = "theirFlagCapture";
const MAX_MESSAGES = 2000;
const SCAN_DELAY_MS = 400;

let scanTimer;
let lastPageUrl = location.href;

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
    document.querySelectorAll("main").forEach((node) => candidates.add(node));
  }

  document.querySelectorAll('[role="dialog"]').forEach((node) => {
    const text = cleanText(node.textContent || "");
    const hasMessagingUi = node.querySelector('textarea, [contenteditable="true"]');
    if (text && hasMessagingUi) candidates.add(node);
  });

  return [...candidates].filter(isVisible);
}

function surfaceTitle(surface, index) {
  const heading = surface.querySelector('h1, h2, h3, [role="heading"]');
  const title = cleanText(heading?.textContent || "");
  return title || (location.pathname.startsWith("/direct/") ? "Instagram Direct" : `Floating chat ${index + 1}`);
}

function extractLines(surface, surfaceIndex) {
  const title = surfaceTitle(surface, surfaceIndex);
  const leaves = [...surface.querySelectorAll("span, div")].filter((node) => {
    if (node.children.length > 0 || !isVisible(node)) return false;
    const text = cleanText(node.textContent || "");
    return text.length >= 1 && text.length <= 2000;
  });

  const seen = new Set();
  return leaves.flatMap((node) => {
    const text = cleanText(node.textContent || "");
    if (!text || seen.has(text)) return [];
    seen.add(text);

    const senderHint = cleanText(
      node.closest('[aria-label]')?.getAttribute("aria-label") || ""
    ).slice(0, 160);
    const fingerprint = hash(`${title}|${senderHint}|${text}`);

    return [{
      id: fingerprint,
      conversation: title,
      text,
      senderHint,
      pageUrl: location.href,
      capturedAt: new Date().toISOString()
    }];
  });
}

async function persist(messages, surfaceCount) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const previous = stored[STORAGE_KEY]?.messages || [];
  const byId = new Map(previous.map((message) => [message.id, message]));
  messages.forEach((message) => byId.set(message.id, message));

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      messages: [...byId.values()].slice(-MAX_MESSAGES),
      surfaceCount,
      lastScanAt: new Date().toISOString(),
      pageUrl: location.href
    }
  });

  renderStatus(surfaceCount, byId.size);
}

function renderStatus(surfaceCount, messageCount) {
  let status = document.querySelector("#their-flag-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "their-flag-status";
    document.documentElement.append(status);
  }
  status.textContent = surfaceCount
    ? `Their Flag: ${surfaceCount} chat surface${surfaceCount === 1 ? "" : "s"}, ${messageCount} text items`
    : "Their Flag: waiting for a chat";
}

async function scan() {
  const surfaces = findSurfaces();
  const messages = surfaces.flatMap(extractLines);
  await persist(messages, surfaces.length);
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scan().catch(console.error), SCAN_DELAY_MS);
}

new MutationObserver(() => {
  if (location.href !== lastPageUrl) lastPageUrl = location.href;
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "THEIR_FLAG_SCAN") return false;
  scan().then(() => sendResponse({ ok: true })).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

scheduleScan();

