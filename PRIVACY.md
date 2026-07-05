# Privacy Policy — Simple HTTP Header

_Last updated: 2026-07-06_

Simple HTTP Header is a browser extension that modifies HTTP request and
response headers using Chrome's declarative
[`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
API.

## What we collect

**Nothing.** The extension collects no personal data and transmits no data to
anyone.

- We do **not** collect, store, or transmit any personal or usage information.
- We do **not** use analytics, tracking, telemetry, or advertising.
- We make **no** network requests of our own.

## What the extension can and cannot access

Because it is *declarative*, the extension registers header rules that the
browser applies itself. It **cannot** read, log, or stream the contents of your
web requests or responses, your cookies, or your browsing history.

## Where your data lives

The rules and profiles you create — including any header values you type, which
may contain tokens or secrets — are stored **only** on your own device using
`chrome.storage.local`. This data:

- **never** leaves your machine,
- is **never** synced to your Google account (we deliberately do not use
  `chrome.storage.sync`),
- is removed when you uninstall the extension.

Exporting a profile writes JSON to your clipboard only when you explicitly click
"Copy". Nothing is shared automatically.

## Permissions and why they are needed

- `declarativeNetRequest` — to register the header-modification rules.
- `storage` — to save your rules and profiles locally on your device.
- `host_permissions: <all_urls>` — Chrome requires host access for
  `modifyHeaders` to apply to the sites you target. With `declarativeNetRequest`
  this grants the extension the ability to *modify headers only*; it does **not**
  grant the ability to read page content or traffic.

## Contact

Questions or concerns: open an issue at
<https://github.com/agkloop/simple-http-header/issues>.
