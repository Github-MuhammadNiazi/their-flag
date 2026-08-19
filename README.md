# Their Flag

A local-first Chrome extension for reading Instagram conversations, detecting their current tone, and drafting responses for different intentions. It works across the full Direct interface and home-page floating chats.

## Prototype behavior

- Watches Instagram's dynamic page for chat UI changes.
- Detects full Direct and home-page floating chat surfaces.
- Captures one local record per visible message, including sender and displayed timestamp.
- Loads older visible history when **Read conversation** is selected.
- Uses the local OpenAI proxy for all tone detection and four situation-specific reply options, each labeled with its intended emotional effect.
- Treats a shared reel or post as a neutral sharing event; embedded captions are excluded from AI context.
- Shows analysis and reply suggestions in a Chrome side panel.
- Never sends Instagram messages automatically. Conversation text is sent to OpenAI only when **Analyze conversation** is selected.

Instagram's DOM changes frequently. The current extraction is deliberately heuristic and intended for local prototype testing, not production use.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository folder.
5. Open or refresh `https://www.instagram.com/`.
6. Open a full Direct conversation or a floating chat.
7. Select the **Their Flag** toolbar icon to open the side panel.

## Start AI analysis

Keep the API key outside the extension. In PowerShell, from this repository:

```powershell
$env:OPENAI_API_KEY = "your-project-api-key"
npm run ai
```

The proxy listens only on `127.0.0.1:43129`. You may set `OPENAI_MODEL` or `THEIR_FLAG_PORT` before starting it; if the port changes, update the extension endpoint too.

Reload the unpacked extension after upgrading. Version 0.4.0 rebuilds stored conversation history once so previously captured reel captions cannot remain in AI context.

After editing the extension, select **Reload** on its card in `chrome://extensions`, then refresh Instagram.

## Privacy

Captured text is stored in `chrome.storage.local`, partitioned by Instagram thread ID. Popup chats are matched back to a known thread by username when possible. Use **Clear local conversation data** in the side panel to erase it.

## Current limitations

- Instagram does not provide stable DOM selectors for this use case.
- Sender attribution is inferred from Instagram's message alignment and profile markers.
- Media, reactions, voice notes, and deleted messages are not captured.
- Analysis and historical scrolling are not implemented yet.
