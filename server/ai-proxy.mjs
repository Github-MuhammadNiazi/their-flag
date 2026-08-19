import http from "node:http";

const PORT = Number(process.env.THEIR_FLAG_PORT || 43129);
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6";
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error("OPENAI_API_KEY is required. Set it in your terminal before starting the proxy.");
  process.exit(1);
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["tone", "confidence", "score", "summary", "signals", "latestInterpretation", "suggestions"],
  properties: {
    tone: { type: "string" },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    signals: { type: "array", items: { type: "string" }, maxItems: 6 },
    latestInterpretation: { type: "string" },
    suggestions: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emotion", "response", "rationale"],
        properties: {
          emotion: { type: "string" },
          response: { type: "string" },
          rationale: { type: "string" }
        }
      }
    }
  }
};

function outputText(response) {
  return response.output_text || response.output?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")?.text;
}

async function analyzeConversation(payload) {
  const transcript = payload.messages.map((message, index) => (
    `${index + 1}. ${message.sender === "You" ? "ME" : "THEM"}: ${message.text}`
  )).join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      instructions: [
        "Analyze an Instagram DM conversation for a reply assistant.",
        "The latest message from THEM is the most important signal; use the full transcript only as context.",
        "Distinguish friendliness, teasing, confusion, guardedness, irritation, hostility, vulnerability, and explicit boundaries.",
        "Do not call an exchange warm when the latest message contains an insult, rejection, correction, or boundary.",
        "Generate exactly four new transcript-specific replies for the current situation. Do not use fixed categories or generic stock phrases.",
        "For each reply, label the emotional intention it is designed to convey, such as accountable, warm, curious, reassuring, playful, direct, or boundary-respecting.",
        "The four choices should be meaningfully different but all appropriate and safe for the detected tone and relationship progress.",
        "Respectful charm is allowed, but never pressure or manipulation. Do not suggest sarcasm when it is likely to escalate the situation.",
        "A transcript entry written as '[Shared reel/post]' is only a neutral sharing event. Never infer tone, attraction, intent, or topic from the shared item's caption or embedded text.",
        "Keep each suggested message natural and under 240 characters, and each rationale under 120 characters."
      ].join(" "),
      input: `Conversation with @${payload.name}:\n${transcript}`,
      text: {
        format: {
          type: "json_schema",
          name: "conversation_analysis",
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = outputText(data);
  if (!text) throw new Error("OpenAI returned no analysis text.");
  return { ...JSON.parse(text), model: data.model || MODEL };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (origin && !origin.startsWith("chrome-extension://")) {
    return response.writeHead(403).end("Forbidden origin");
  }
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  if (request.method === "GET" && request.url === "/health") {
    return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, model: MODEL }));
  }
  if (request.method !== "POST" || request.url !== "/analyze") return response.writeHead(404).end();

  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1_000_000) throw new Error("Conversation payload is too large.");
    }
    const payload = JSON.parse(body);
    if (!payload?.name || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      throw new Error("A named conversation with messages is required.");
    }
    const result = await analyzeConversation(payload);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Their Flag AI proxy listening on http://127.0.0.1:${PORT} using ${MODEL}`);
});
