# Anti Blur

> **Ownership** — Built by Calyndrae
> © 2026. All rights reserved. Proprietary; not open source and not licensed for
> redistribution, resale, or reuse as a template. See [LICENSE](LICENSE).
> Licensing enquiries: calyndrae@gmail.com

A Chrome extension that stops websites from detecting when you switch tabs, move
focus to another window, or move the mouse off the page. Videos keep playing,
timers keep running, and attention analytics get a flat line.

## How it works

`inject.js` runs in the page's MAIN world at `document_start`, before any page
script. It overrides `document.hasFocus()`, `document.hidden` and
`document.visibilityState` (plus the webkit-prefixed variants) so they always
report the page as focused and visible, and it installs capture-phase listeners
that stop `blur`, `visibilitychange`, `pagehide`, `freeze`, `mouseleave` and
`mouseout` from reaching page code.

The overrides are camouflaged: they report `[native code]` under `toString()`,
keep the native descriptor shape, carry no own `prototype`, perform the native
brand check, and never leak the extension's URL in a thrown stack trace.

No permissions beyond the content script. No service worker, no storage, no
network access, no analytics, no third-party code.

## Layout

| Path | What it is |
| --- | --- |
| `manifest.json`, `inject.js`, `popup.html` | The extension |
| `icons/` | Toolbar and store icons |
| `privacy-policy.html`, `PRIVACY.md` | Privacy policy, to host publicly |
| `store-assets/` | Screenshots and promo tile, plus the HTML they render from |
| `test/` | Detection bench — see `test/README.md` |
| `PUBLISHING.md` | Web Store submission guide and listing copy |
| `build.sh` | Builds the upload package into `dist/` |

## Build

```bash
./build.sh
```

Produces `dist/anti-blur-<version>.zip` containing only the runtime files.

## Test

Run both after any change to `inject.js`:

```bash
./test/run.sh
```

```bash
python3 test/verify_function.py
```

The first checks the extension is undetectable (`stealthFail` must be `0`); the
second checks the spoof actually works by forcing a genuinely backgrounded tab.

## Requirements

Chrome 111 or newer — `world: "MAIN"` in static content scripts landed in 111.
