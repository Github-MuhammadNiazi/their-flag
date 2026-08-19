const STORAGE_KEY = "theirFlagCapture";

const elements = {
  surfaces: document.querySelector("#surface-count"),
  messages: document.querySelector("#message-count"),
  list: document.querySelector("#message-list"),
  empty: document.querySelector("#empty-state"),
  lastScan: document.querySelector("#last-scan"),
  scan: document.querySelector("#scan-button"),
  clear: document.querySelector("#clear-button")
};

function render(capture = {}) {
  const messages = capture.messages || [];
  elements.surfaces.textContent = capture.surfaceCount || 0;
  elements.messages.textContent = messages.length;
  elements.empty.hidden = messages.length > 0;
  elements.list.replaceChildren(...messages.slice(-12).reverse().map((message) => {
    const item = document.createElement("li");
    const conversation = document.createElement("span");
    conversation.textContent = message.conversation;
    item.append(conversation, document.createTextNode(message.text));
    return item;
  }));
  elements.lastScan.textContent = capture.lastScanAt
    ? `Last scan: ${new Date(capture.lastScanAt).toLocaleString()}`
    : "Not scanned yet";
}

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  render(stored[STORAGE_KEY]);
}

elements.scan.addEventListener("click", async () => {
  elements.scan.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url?.startsWith("https://www.instagram.com/")) {
    await chrome.tabs.sendMessage(tab.id, { type: "THEIR_FLAG_SCAN" });
  }
  elements.scan.disabled = false;
  await load();
});

elements.clear.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) render(changes[STORAGE_KEY].newValue);
});

load();

