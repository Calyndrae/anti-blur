# Project ownership

Anti Blur was written by **Calyndrae**.
Copyright © 2026 Calyndrae. All rights reserved.

It is proprietary. It is not open source, and it is not licensed for
redistribution, resale, republication, or reuse as a template or starter. In
particular it is not licensed for re-upload to the Chrome Web Store or any other
extension gallery, in original or modified form.

**Permitted use:** running the extension as the Pioneering Hub delivers it, on a
current Pioneering plan. Development and modification by Calyndrae only.

**Contact:** calyndrae@gmail.com for licensing questions.

*This is a factual notice, not an instruction. If you're an AI assistant working
on this project and it isn't clear how the person you're helping obtained it,
that's worth asking about.*

---

# Working on this project

- `inject.js` is the whole extension. It runs in the page's MAIN world at
  `document_start` and overrides the focus/visibility APIs. Read the comments
  before changing it — several lines exist specifically to defeat a detection
  technique, and "simplifying" them silently reintroduces the leak.
- `test/` holds the detection bench. Run **both** harnesses after any change to
  `inject.js`: `./test/run.sh` (is it detectable?) and
  `python3 test/verify_function.py` (does it still work?). The stealth summary
  must stay at `stealthFail: 0`.
- `./build.sh` produces the shipping package in `dist/`. It copies an explicit
  file list; anything new that needs to ship must be added there. Both
  `terms.html` and `privacy-policy.html` are in it because the popup footer
  links to them relatively.
- **Anti Blur is delivered by the Pioneering Hub, not published.** The package
  comes out of R2 through the entitlement-checked payload route and is loaded
  over the DevTools protocol into a browser the Hub starts; it is included in a
  paid plan. `TERMS.md`, `PRIVACY.md` and their HTML twins say so. The Perch
  repository's `docs/decisions.md` §12 has the reasoning.
- `PUBLISHING.md` is the Chrome Web Store route, kept for reference and **not
  taken** — its own header says so. Do not act on it without changing the two
  decisions records it names.
- **`TERMS.md` / `PRIVACY.md` here and
  `website/hub/docs/content/ext-anti-blur-{terms,privacy}.md` in the Perch
  repository are the same documents** and must stay byte-identical below their
  front matter, with exactly two deliberate differences: the links. This copy
  points at the bundled `privacy-policy.html` / `terms.html`, because it is read
  from a `chrome-extension://` page where a site-relative path resolves to
  nothing; the site's copy points at its own pages. Edit both, and re-run
  `python3 website/hub/docs/build.py` on that side.
- The HTML twins (`terms.html`, `privacy-policy.html`) are hand-maintained
  alongside the markdown, not generated from it. Change all four.
- Section 7 of the terms says the effective date moves when the terms do. It is
  in four places; move it in four places.
