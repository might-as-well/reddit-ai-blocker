# AI Blocker for Reddit

Chrome extension that reduces AI-generated post bloat and repetitive spam patterns on Reddit feeds.

## Why this exists

Reddit is increasingly flooded with templated AI-style posts and constant self-promotion. That can create ongoing mental toil when you just want signal over noise.

This project aims to give users practical filtering controls to reduce that fatigue:

- Filter likely AI-generated writing patterns
- Optionally filter self-promotional posts more aggressively
- Keep the system transparent with debug labels and scoring reasons

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

## Project structure

- `src/` TypeScript source
- `dist/` compiled extension scripts
- `views/` extension pages (`popup.html`, `options.html`)
- `css/` extension styles
- `templates/` HTML snippets used by content UI
- `manifest.json` Chrome extension config

## Requirements

- Node.js 18+ (or compatible)
- Chrome (for loading unpacked extension)

## Setup

1. Install dependencies:
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
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
4. Verify in Chrome on real Reddit pages
5. Open a PR with the template completed

## Limitations

- Heuristic + classifier systems can produce false positives/negatives
- Reddit UI changes can affect selectors/extraction
- LLM classification quality depends on prompt + model behavior

## CI

GitHub Actions runs on push/PR and checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
