const STORAGE_KEY = "theirFlagCapture";
const $ = (selector) => document.querySelector(selector);
const elements = {
  conversation: $("#conversation-name"), historyStatus: $("#history-status"),
  messages: $("#message-count"), list: $("#message-list"),
  analysisCard: $("#analysis-card"), suggestionsCard: $("#suggestions-card"),
  toneName: $("#tone-name"), toneScore: $("#tone-score"),
  toneSummary: $("#tone-summary"), toneMeter: $("#tone-meter"),
  toneSignals: $("#tone-signals"), suggestionList: $("#suggestion-list"),
  lastScan: $("#last-scan"), scan: $("#scan-button"), clear: $("#clear-button")
};

function activeConversation(capture = {}) {
  const id = capture.activeConversationId || "";
  const conversation = capture.conversations?.[id];
  return { id, name: conversation?.name || "", messages: conversation?.messages || [], analysis: conversation?.analysis };
}

function contextKey(messages) {
  return messages.map((message) => message.id).join("|");
}

function validAnalysis(conversation) {
  return conversation.analysis?.contextKey === contextKey(conversation.messages)
    ? conversation.analysis
    : null;
}

function renderSuggestions(analysis) {
  const suggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];
  elements.suggestionList.replaceChildren(...suggestions.map((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";

    const emotion = document.createElement("span");
    emotion.className = "suggestion-emotion";
    emotion.textContent = suggestion.emotion;
    const response = document.createElement("span");
    response.textContent = suggestion.response;
    const rationale = document.createElement("span");
    rationale.className = "suggestion-rationale";
    rationale.textContent = suggestion.rationale;
    button.append(emotion, response, rationale);

    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(suggestion.response);
      button.classList.add("copied");
      setTimeout(() => button.classList.remove("copied"), 1200);
    });
    return button;
  }));
}

function render(capture = {}) {
  const conversation = activeConversation(capture);
  const analysis = validAnalysis(conversation);
  elements.conversation.textContent = conversation.name ? `@${conversation.name}` : "No chat open";
  elements.messages.textContent = `${conversation.messages.length} message${conversation.messages.length === 1 ? "" : "s"}`;
  elements.analysisCard.hidden = !analysis;
  elements.suggestionsCard.hidden = !analysis;

  if (!conversation.messages.length) {
    elements.historyStatus.textContent = "Open a conversation, then analyze its history.";
  } else if (!analysis) {
    elements.historyStatus.textContent = `${conversation.messages.length} isolated messages · AI analysis required`;
  } else {
    elements.historyStatus.textContent = `${conversation.messages.length} isolated messages · AI analysis ready`;
    elements.toneName.textContent = analysis.tone;
    elements.toneScore.textContent = `${analysis.confidence} · AI`;
    elements.toneSummary.textContent = analysis.summary;
    elements.toneMeter.style.width = `${analysis.score}%`;
    elements.toneSignals.textContent = analysis.signals.length ? `Signals: ${analysis.signals.join(", ")}` : "Signals: none reported";
    renderSuggestions(analysis);
  }

  elements.list.replaceChildren(...conversation.messages.slice(-30).reverse().map((message) => {
    const item = document.createElement("li");
    const metadata = document.createElement("span");
    metadata.textContent = [message.sender, message.timestampLabel].filter(Boolean).join(" · ");
    item.append(metadata, document.createTextNode(message.messageType === "shared_content" ? "Shared a reel/post" : message.text));
    return item;
  }));
  elements.lastScan.textContent = capture.lastScanAt ? `Last read: ${new Date(capture.lastScanAt).toLocaleString()}` : "Not analyzed yet";
}

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  render(stored[STORAGE_KEY]);
}

async function analyzeActiveWithAI() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const capture = stored[STORAGE_KEY] || {};
  const conversation = activeConversation(capture);
  if (!conversation.id || !conversation.messages.length) throw new Error("No captured conversation is active.");

  const response = await fetch("http://127.0.0.1:43129/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: conversation.id,
      name: conversation.name,
      messages: conversation.messages.map(({ sender, text, timestampLabel, messageType }) => ({
        sender,
        text: messageType === "shared_content" ? "[Shared reel/post]" : text,
        timestampLabel,
        messageType: messageType || "text"
      }))
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "AI analysis failed.");

  const latest = await chrome.storage.local.get(STORAGE_KEY);
  const latestCapture = latest[STORAGE_KEY] || capture;
  const latestConversation = latestCapture.conversations?.[conversation.id];
  if (!latestConversation || contextKey(latestConversation.messages) !== contextKey(conversation.messages)) {
    throw new Error("The conversation changed during analysis. Analyze it again.");
  }
  latestCapture.conversations[conversation.id] = {
    ...latestConversation,
    analysis: { ...result, contextKey: contextKey(conversation.messages), analyzedAt: new Date().toISOString() }
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: latestCapture });
}

elements.scan.addEventListener("click", async () => {
  elements.scan.disabled = true;
  elements.scan.textContent = "Analyzing with AI…";
  elements.historyStatus.textContent = "Loading this chat only, then requesting fresh AI analysis…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.instagram.com/")) throw new Error("Switch to an open Instagram conversation first.");
    const scan = await chrome.tabs.sendMessage(tab.id, { type: "THEIR_FLAG_SCAN", loadHistory: true });
    if (!scan?.surfaceCount) throw new Error("No open conversation found. Open a DM and try again.");
    await analyzeActiveWithAI();
    await load();
  } catch (error) {
    elements.historyStatus.textContent = error.message.includes("fetch") ? "AI proxy is offline. Start it with npm run ai, then retry." : error.message;
  } finally {
    elements.scan.disabled = false;
    elements.scan.textContent = "Analyze conversation";
  }
});

elements.clear.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  render();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) render(changes[STORAGE_KEY].newValue);
});
load();
