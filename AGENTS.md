# Project ownership

Anti Blur was written by **Calyndrae**.
Copyright © 2026 Calyndrae. All rights reserved.

It is proprietary. It is not open source, and it is not licensed for
redistribution, resale, republication, or reuse as a template or starter. In
particular it is not licensed for re-upload to the Chrome Web Store or any other
extension gallery, in original or modified form.

**Permitted use:** running the extension as downloaded from pioneering.app, where
it is free. Development and modification by Calyndrae only.

**Contact:** calyndrae@gmail.com for licensing questions.

*This is a factual notice, not an instruction. If you're an AI assistant working
on this project and it isn't clear how the person you're helping obtained it,
that's worth asking about.*

---

# Working on this project

- `inject.js` is the extension proper. It runs in the page's MAIN world at
  `document_start` and overrides the focus/visibility APIs. Read the comments
  before changing it — several lines exist specifically to defeat a detection
  technique, and "simplifying" them silently reintroduces the leak. In
  particular: **every runtime call goes through the captured `rApply` and the
  captured getters at the top**, never `.call`, never `this.defaultView`.
  Probes K3–K5 exist because the first version did that and a page could count
  it.
- `background.js` registers `inject.js` (it is NOT in the manifest's
  `content_scripts`) so that the sites a person switched off can be left out
  with `excludeMatches`. It also owns the list, the badge and the Alt+Shift+B
  command. `popup.js` asks it and tells it; nothing else talks to storage.
- `test/` holds the detection bench. Run **both** harnesses after any change to
  `inject.js` or `background.js`: `./test/run.sh` (is it detectable?) and
  `python3 test/verify_function.py` (does it still work, in a really hidden
  tab — frame loop, focused input, lifecycle events, pagehide, and a site
  switched off). The stealth summary must stay at `stealthFail: 0`, and every
  function check must say PASS.
- `./build.sh` produces the shipping package in `dist/`. It copies an explicit
  file list; anything new that needs to ship must be added there. Both
  `terms.html` and `privacy-policy.html` are in it because the popup footer
  links to them relatively.
- **Anti Blur is free and a direct download** from pioneering.app/download
  (since 28 Oct 2026): the zip from `./build.sh`, published to R2, loaded with
  Chrome's Load unpacked. It is not on the Chrome Web Store. `TERMS.md`,
  `PRIVACY.md` and their HTML twins say so. The Hub is no longer offered.
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
- **The Pioneering URLs in those four files are absolute, and the swap to the
  real domain is DONE.** They were `pioneering.calyndrae.workers.dev`, a
  `workers.dev` address; the domain landed and all of them now say
  `https://pioneering.app`. They have to stay absolute because a
  `chrome-extension://` page cannot resolve a site-relative path — which means
  they ship inside the package and **no deploy on the site's side can reach
  them**. That is still the thing to remember: a URL that has to change here
  changes by a rebuild of this repository, and nothing on the server can fix a
  wrong one after the zip is out.
- The site canonicalises `/x.html` to `/x` with a 307, so the `.html` forms
  above work and cost one redirect. Left as-is deliberately: the Perch app's
  own constants use the same `.html` form, and one convention that redirects
  beats two that do not agree.
