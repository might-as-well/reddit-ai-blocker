# AI Blocker for Reddit

Chrome extension that reduces AI-generated post bloat and repetitive spam patterns on Reddit feeds.

## Why this exists

Reddit is increasingly flooded with AI slop and constant self-promotion. It's all so boilerplate that in theory it should be simple to detect... especially for another LLM.

<img width="600" height="551" alt="ai-point" src="https://github.com/user-attachments/assets/b20a5f16-2d6c-4ae5-bc7e-080e155b4609" />

This project aims to give users practical filtering controls to reduce the AI brain numbing in your feed:

- Filter likely AI-generated writing patterns
- Optionally filter self-promotional posts more aggressively
- Keep the system transparent with debug labels and scoring reasons
- Intended to keep cost of tokens way down by combining LLM and local scoring

## Features

- Fast local scoring on every post
- Optional OpenAI classifier for borderline posts
- Self-promotion mode toggle
- Popup controls for quick enable/disable + self-promo filtering
- Options page for thresholds, keywords, and LLM settings
- Local debug output to inspect why a post was scored

## How it works

1. Content script extracts post text + structural signals (including `ul/li` list markup).
2. Local heuristics compute a score from AI/promo signals and human-style counter-signals.
3. Clearly matched posts are handled locally.
4. Borderline posts can be sent to an LLM classifier (if enabled).
5. Decisions are cached to reduce repeated API calls.

## Requirements

- Node.js `22.3.0` (see `.nvmrc`)
- Chrome (for loading unpacked extension)

## Setup

1. Install dependencies:
   - `nvm use` (if you use nvm)
   - `npm install`
2. Build:
   - `npm run build`
3. Optional watch mode during development:
   - `npm run watch`
4. Run tests:
   - `npm test`

## Run in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repo root
5. After code changes:
   - run `npm run build`
   - click **Reload** on the extension card

## Configuration

Use the popup for quick toggles:

- `Enabled`
- `Filter self-promotional posts`

Use the options page for advanced settings:

- Local threshold
- Custom keywords
- LLM enable/disable
- Model and confidence threshold
- Monthly LLM call cap

## Storage

- `chrome.storage.sync`:
  - filter settings (`enabled`, `threshold`, `filterSelfPromotion`, etc.)
- `chrome.storage.local`:
  - OpenAI API key
  - usage/cache/counter data

## Contributing

Contributions are welcome. This is an open-source project and we want practical improvements from real usage.

Please open a PR with:

- A clear title
- Reasoning for the change (problem + approach)
- How to test (step-by-step)

Use the PR template in `.github/pull_request_template.md`.

### Local contribution flow

1. Fork or branch from `main`
2. Make your changes
3. Run checks:
   - `nvm use` (requires nvm)
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
4. Verify in Chrome on real Reddit pages
5. Open a PR with the template completed

### Troubleshooting

- If tests fail because of Node/runtime mismatch, run `nvm use` before `npm test`.

## Limitations

- Heuristic + classifier systems can produce false positives/negatives
- Reddit UI changes can affect selectors/extraction
- LLM classification quality depends on prompt + model behavior

## CI

GitHub Actions runs on push/PR and checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
