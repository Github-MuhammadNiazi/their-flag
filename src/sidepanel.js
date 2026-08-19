const STORAGE_KEY = "theirFlagCapture";
const $ = (selector) => document.querySelector(selector);
const elements = {conversation:$("#conversation-name"),historyStatus:$("#history-status"),messages:$("#message-count"),list:$("#message-list"),analysisCard:$("#analysis-card"),suggestionsCard:$("#suggestions-card"),toneName:$("#tone-name"),toneScore:$("#tone-score"),toneSummary:$("#tone-summary"),toneMeter:$("#tone-meter"),toneSignals:$("#tone-signals"),suggestionList:$("#suggestion-list"),intents:$("#intent-tabs"),lastScan:$("#last-scan"),scan:$("#scan-button"),clear:$("#clear-button")};
let currentCapture = {};
let currentIntent = "rizz";

const SIGNALS = {
  warm: /\b(love|cute|sweet|glad|happy|haha|lol|lmao|thanks|miss|amazing|nice|good|hey+|hi+)\b|[❤️🥰😍😊😂✨]/i,
  tense: /\b(angry|annoyed|upset|hate|stop|leave|wrong|never|always|whatever|fine|problem|sorry|hurt|disappointed|weird|sarcastic|rude|uncomfortable)\b|\b(no need|don['’]?t know who you are|why are you|not funny)\b|[😡😤]/i,
  vulnerable: /\b(worried|scared|anxious|sad|tired|alone|overthink|insecure|need you|promise)\b|[😢😭]/i,
  playful: /\b(tease|joke|funny|bet|sure you did|obviously|wow|bruh)\b|[😉😏😂🙃]/i,
  curious: /\?|\b(why|what|how|when|where|really|tell me)\b/i
};

function conversationMessages(capture) {
  const id = capture.activeConversationId || "";
  const conversation = capture.conversations?.[id];
  return {id, name:conversation?.name || "", messages:conversation?.messages || [], cachedAnalysis:conversation?.analysis};
}

function contextKey(messages) {
  return messages.map((message) => message.id).join("|");
}

function analyze(messages) {
  const recent = messages.slice(-20);
  const incoming = recent.filter((message) => message.sender !== "You");
  const lastIncoming = incoming.at(-1)?.text || "";
  const boundary = /\b(no need|don['’]?t know who you are|stop|leave me|not interested|uncomfortable|that(?:'s| is) weird|being sarcastic|why are you)\b/i.test(lastIncoming);
  const correction = /\b(i am (?:asking|inquiring)|i said|you said|what i meant|just asking|actually)\b/i.test(lastIncoming);
  const scores = Object.fromEntries(Object.entries(SIGNALS).map(([key, pattern]) => [key, recent.reduce((sum, message, index) => {
    const recencyWeight = index >= recent.length - 2 ? 2 : 1;
    const incomingWeight = message.sender !== "You" ? 2 : 0.6;
    return sum + (pattern.test(message.text) ? recencyWeight * incomingWeight : 0);
  }, 0)]));
  if (boundary) scores.tense += 8;
  if (correction) scores.tense += 3;
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  let tone = "Neutral / early-stage", summary = "The exchange is still light on context. A low-pressure reply that gives them something easy to answer is the safest move.", score = 46;
  if (boundary) {tone="Guarded / mildly irritated";summary="Their latest reply sets a boundary and corrects how your message landed. Drop the sarcasm, acknowledge the mismatch, and clarify your intent without flirting harder.";score=20;}
  else if (scores.tense > 0 && scores.tense >= scores.warm) {tone="Tense or guarded";summary="The latest replies show friction. Acknowledge their reaction first, avoid defending the joke, and keep the next message short.";score=28;}
  else if (scores.vulnerable > 0) {tone="Vulnerable / seeking safety";summary="They may be looking for emotional safety more than a solution. Be specific, steady, and avoid jokes until they feel heard.";score=42;}
  else if (scores.playful > 0 || scores.warm >= 2) {tone="Warm and playful";summary="The conversation has positive momentum. You can be a little bolder while keeping the reply personal and easy to engage with.";score=82;}
  else if (scores.curious > 0) {tone="Curious and open";summary="They are giving you an opening. Answer directly, then add one specific question or playful hook to keep the exchange moving.";score=68;}
  const confidence = messages.length < 6 ? "Early read" : total >= 10 ? "High confidence" : total >= 4 ? "Moderate confidence" : "Low confidence";
  return {tone,summary,score,confidence,signals:Object.entries(scores).filter(([,value])=>value>0).map(([key])=>key),lastIncoming:lastIncoming||recent.at(-1)?.text||"",boundary,correction,messageCount:messages.length};
}

function suggestionsFor(intent, analysis) {
  if (analysis.suggestions?.[intent]) return analysis.suggestions[intent];
  const cautious = analysis.boundary || analysis.tone.startsWith("Tense") || analysis.tone.startsWith("Vulnerable");
  const hasQuestion = analysis.lastIncoming.includes("?");
  const sarcasmIssue = /sarcastic|not funny|rude/i.test(analysis.lastIncoming);
  const strangerIssue = /don['’]?t know who you are|who are you/i.test(analysis.lastIncoming);
  const contextualRepair = sarcasmIssue
    ? "Fair point—the sarcasm was unnecessary. I meant to keep it light, not make you uncomfortable."
    : strangerIssue
      ? "That’s fair—you don’t know me yet. I should’ve introduced myself properly instead of trying to be clever."
      : "Fair point. I can see how my last message landed badly, and that wasn’t my intention.";
  return {
    rizz: cautious ? [contextualRepair,"You’re right. Let me restart without the performance: I’d genuinely like to get to know you, if you’re open to that.","Point taken. No more clever lines—can I start again with a proper introduction?"] : [hasQuestion?"I’ll give you the honest answer—then you owe me one equally honest answer about yourself.":"That answer actually made me more curious about you. What’s the story behind it?","You have a way of making an ordinary chat feel unexpectedly interesting.",`I like the energy of “${analysis.lastIncoming.slice(0,55)}${analysis.lastIncoming.length>55?"…":""}” — tell me more.`],
    calm: [contextualRepair,"You’re right to call that out. I’m not going to argue with how it came across.","Let’s reset. I was trying to be light, but I missed the tone—what would you like to know?"],
    reassure: [contextualRepair,"I’m not trying to mock you or make you uncomfortable. I’ll be more direct from here.","Your reaction is fair. I’m listening, and I’m happy to restart on a more respectful note."],
    sarcasm: cautious ? ["Sarcasm is the wrong move here. Send a calm or reassuring reply instead.",contextualRepair,"I’m retiring the sarcasm for this conversation—it clearly didn’t land the way I intended."] : ["Wow, and here I was trying to be normal for once.",hasQuestion?"That question sounds suspiciously like you’re interested in my answer.":"Bold of you to make that sound so convincing.",`So we’re going with “${analysis.lastIncoming.slice(0,45)}${analysis.lastIncoming.length>45?"…":""}”? Brave choice.`]
  }[intent];
}

function renderSuggestions(analysis) {
  elements.suggestionList.replaceChildren(...suggestionsFor(currentIntent, analysis).map((text) => {
    const button = document.createElement("button");button.type="button";button.className="suggestion";button.textContent=text;
    button.addEventListener("click", async()=>{await navigator.clipboard.writeText(text);button.classList.add("copied");setTimeout(()=>button.classList.remove("copied"),1200);});
    return button;
  }));
}

function render(capture = {}) {
  currentCapture = capture;
  const {name,messages,cachedAnalysis} = conversationMessages(capture);
  const analysis = cachedAnalysis?.contextKey === contextKey(messages) ? cachedAnalysis : analyze(messages);
  elements.conversation.textContent = name ? `@${name}` : "No chat open";
  elements.messages.textContent = `${messages.length} message${messages.length===1?"":"s"}`;
  elements.historyStatus.textContent = messages.length
    ? `${messages.length} isolated messages · ${analysis.model ? "AI analysis ready" : "select Analyze to update AI"}`
    : "Open a conversation, then analyze its history.";
  elements.analysisCard.hidden = messages.length===0;elements.suggestionsCard.hidden=messages.length===0;
  if(messages.length){elements.toneName.textContent=analysis.tone;elements.toneScore.textContent=analysis.model?`${analysis.confidence} · AI`:analysis.confidence;elements.toneSummary.textContent=analysis.summary;elements.toneMeter.style.width=`${analysis.score}%`;elements.toneSignals.textContent=analysis.signals.length?`Signals: ${analysis.signals.join(", ")}`:"Signals: limited context";renderSuggestions(analysis);}
  elements.list.replaceChildren(...messages.slice(-30).reverse().map((message)=>{const item=document.createElement("li"),metadata=document.createElement("span");metadata.textContent=[message.sender,message.timestampLabel].filter(Boolean).join(" · ");item.append(metadata,document.createTextNode(message.text));return item;}));
  elements.lastScan.textContent=capture.lastScanAt?`Last read: ${new Date(capture.lastScanAt).toLocaleString()}`:"Not scanned yet";
}

async function load(){const stored=await chrome.storage.local.get(STORAGE_KEY);render(stored[STORAGE_KEY]);}
async function analyzeActiveWithAI() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const capture = stored[STORAGE_KEY] || {};
  const {id,name,messages} = conversationMessages(capture);
  if (!id || !messages.length) throw new Error("No captured conversation is active.");
  const response = await fetch("http://127.0.0.1:43129/analyze", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:id,name,messages:messages.map(({sender,text,timestampLabel})=>({sender,text,timestampLabel}))})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "AI analysis failed.");
  const latest = await chrome.storage.local.get(STORAGE_KEY);
  const latestCapture = latest[STORAGE_KEY] || capture;
  const conversation = latestCapture.conversations?.[id];
  if (!conversation || contextKey(conversation.messages) !== contextKey(messages)) throw new Error("The conversation changed during analysis. Read it again.");
  latestCapture.conversations[id] = {...conversation,analysis:{...result,contextKey:contextKey(messages),analyzedAt:new Date().toISOString()}};
  await chrome.storage.local.set({[STORAGE_KEY]:latestCapture});
}
elements.scan.addEventListener("click",async()=>{elements.scan.disabled=true;elements.scan.textContent="Analyzing with AI…";elements.historyStatus.textContent="Loading this chat only, then sending it to the local AI proxy…";try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!tab.url?.startsWith("https://www.instagram.com/")){elements.historyStatus.textContent="Switch to an open Instagram conversation first.";return;}const response=await chrome.tabs.sendMessage(tab.id,{type:"THEIR_FLAG_SCAN",loadHistory:true});if(!response?.surfaceCount){elements.historyStatus.textContent="No open conversation found. Open a DM and try again.";return;}await analyzeActiveWithAI();await load();}catch(error){elements.historyStatus.textContent=error.message.includes("fetch")?"AI proxy is offline. Start it with npm run ai, then retry.":error.message;}finally{elements.scan.disabled=false;elements.scan.textContent="Analyze conversation";}});
elements.intents.addEventListener("click",(event)=>{const button=event.target.closest("[data-intent]");if(!button)return;currentIntent=button.dataset.intent;elements.intents.querySelectorAll(".intent").forEach((intent)=>intent.classList.toggle("active",intent===button));renderSuggestions(analyze(conversationMessages(currentCapture).messages));});
elements.clear.addEventListener("click",async()=>{await chrome.storage.local.remove(STORAGE_KEY);render();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes[STORAGE_KEY])render(changes[STORAGE_KEY].newValue);});
load();
