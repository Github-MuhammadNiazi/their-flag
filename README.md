# Their Flag

An early, local-first Chrome extension prototype for detecting Instagram messaging surfaces and capturing visible text. It works across `https://www.instagram.com/*`, including the full Direct interface and floating chat dialogs.

## Prototype behavior

- Watches Instagram's dynamic page for chat UI changes.
- Detects full Direct and floating dialog surfaces.
- Captures visible text items and deduplicates them locally.
- Shows capture diagnostics in a Chrome side panel.
- Does not send messages, call an AI service, or upload captured data.

Instagram's DOM changes frequently. The current extraction is deliberately heuristic and intended for local prototype testing, not production use.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository folder.
5. Open or refresh `https://www.instagram.com/`.
6. Open a full Direct conversation or a floating chat.
7. Select the **Their Flag** toolbar icon to open the side panel.

After editing the extension, select **Reload** on its card in `chrome://extensions`, then refresh Instagram.

## Privacy

Captured text is stored only in `chrome.storage.local` for this extension profile. Use **Clear local capture** in the side panel to erase it.

## Current limitations

- Instagram does not provide stable DOM selectors for this use case.
- Sender and timestamp attribution is not yet reliable.
- Media, reactions, voice notes, and deleted messages are not captured.
- Analysis and historical scrolling are not implemented yet.
