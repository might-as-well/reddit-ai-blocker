# AI Blocker for Reddit (Chrome Extension)

Hybrid Reddit filtering extension that hides likely AI-slop and self-promotional posts.

## Stack

- TypeScript source in `/Users/sushi/dev/ai-blocker/src`
- Compiled extension scripts in `/Users/sushi/dev/ai-blocker/dist`
- Manifest V3 with module service worker

## Build

1. Install deps: `npm install`
2. Build once: `npm run build`
3. Watch mode: `npm run watch`

## How filtering works

1. Local scoring runs on every post (fast + free).
2. Clearly bad posts are hidden immediately.
3. Borderline posts are optionally sent to OpenAI for classification.
4. LLM decisions are cached for 30 days.
5. Monthly LLM call cap prevents runaway cost.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/Users/sushi/dev/ai-blocker`.
5. Rebuild (`npm run build`) and click **Reload** after TS changes.

## Configure

1. In `chrome://extensions`, find **AI Blocker for Reddit**.
2. Click **Details** -> **Extension options**.
3. Set local threshold and custom keywords.
4. Optional: enable OpenAI, add API key, choose model, confidence threshold, and monthly cap.

## Notes

- API key is stored in extension local storage (`chrome.storage.local`).
- Non-secret preferences are stored in `chrome.storage.sync`.
- This remains heuristic/classifier based and may still produce false positives/negatives.
