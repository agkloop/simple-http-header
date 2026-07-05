# Simple HTTP Header

A tiny, open-source Chrome extension to modify HTTP request & response headers.
Think ModHeader, but **small, auditable, and privacy-first**.

- **Fast** — rules run in Chrome's native network stack via
  [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).
  Zero JavaScript executes per request.
- **Secure** — the extension is *declarative*: it tells Chrome what to do and
  **never reads, streams, or has access to your traffic**. No `webRequest`, no
  remote code, no external network calls, no analytics.
- **Simple** — vanilla JS, **no build step**, no dependencies. ~5 small files
  you can read in one sitting.

## Features

- Set / modify request headers
- Remove request headers
- Set / remove response headers
- Optional per-rule URL filter (e.g. `||example.com`, `/api/`)
- Named **profiles** (dev / staging / …) with a one-click active switch
- **Master on/off** toggle
- Light & dark mode

## Install (unpacked)

1. `git clone` this repo.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. **Load unpacked** → select the `simple-http-header/` folder.
5. Pin the icon, open the popup, add rules.

Works in any Chromium browser (Chrome, Edge, Brave, Arc).

## Usage

- **＋** adds a rule row. Each row: enable checkbox · `req`/`res` chip (click to
  toggle) · `set`/`remove` chip (click to toggle) · header name · value · url
  filter.
- The **⋮** button manages profiles: type `new`, `rename`, or `delete`.
- The badge shows the active rule count, or `off` when the master switch is off.

Verify quickly: add a `set` request header `X-Debug: 1`, then visit
<https://httpbin.org/headers> — the echoed JSON should include your header.

### URL filters

Each rule has an optional **url filter** that scopes it to matching URLs — leave
it blank to apply everywhere. Click the **?** in the popup for the same cheatsheet.

| Filter | Matches |
| --- | --- |
| *(blank)* | all sites |
| `\|\|example.com` | `example.com` and all subdomains, any path |
| `\|https://` | only HTTPS requests |
| `/api/` | any URL containing `/api/` |
| `example.com` | any URL containing that text |
| `.json\|` | URLs ending in `.json` |
| `*/graphql` | `*` wildcard; path ending in `/graphql` |

Matching is case-insensitive. `|` anchors the start/end of the URL, `||` anchors
a domain, `*` is a wildcard, `^` matches a separator. This is Chrome's native
[`urlFilter` syntax](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#property-RuleCondition-urlFilter).

## Security model & the `<all_urls>` permission

To edit headers on any site, `declarativeNetRequest`'s `modifyHeaders` action
requires host permissions, so the manifest requests `host_permissions:
["<all_urls>"]`. This looks broad, but with DNR it is the *safe* shape:

- The extension **cannot read** request/response contents, cookies, or bodies.
  It only registers declarative rules that the browser applies itself.
- Contrast with `webRequest`-based tools, which stream every request through
  extension JavaScript.

Header values are stored in **`chrome.storage.local`, never `storage.sync`** —
so auth tokens or secrets you put in a header stay on this machine and are never
replicated to your Google account.

Header names are validated against the RFC 7230 token charset and values are
rejected if they contain CR/LF, preventing header-injection.

## Development

```bash
npm test        # runs the pure rule-logic tests (node --test, no deps)
```

No bundler. Edit files under `src/`, then hit the reload icon on the extension
card in `chrome://extensions`.

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions |
| `src/background.js` | service worker: syncs state → DNR dynamic rules, badge |
| `src/storage.js` | state read/write (`chrome.storage.local`) |
| `src/rules.js` | validation + Rule → DNR conversion (pure, tested) |
| `src/popup.*` | the single-view UI |

## License

MIT — see [LICENSE](LICENSE).
