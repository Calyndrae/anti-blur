# Publishing Anti Blur to the Chrome Web Store

> **This is not the route Anti Blur currently takes, and nothing here has been done.**
>
> Anti Blur is delivered by the Pioneering Hub: the package comes out of R2 through the
> entitlement-checked payload route and is loaded into a browser the Hub starts, over the
> DevTools protocol. It is not published anywhere, and it is included in a paid plan rather
> than being free. The reasoning is in the Perch repository, `docs/decisions.md` §12 — the
> short version is that a Web Store listing would make the extensions free to obtain and
> move the paywall to a runtime check inside an extension, which is the weakest place in the
> system to put one.
>
> **Kept, not deleted.** The listing copy, the permission justifications, the image specs
> and the review notes below are real work and are correct for what they describe. If the
> decision is ever revisited this is the head start. Until then, treat every step as
> hypothetical, and do not follow section 1 — registering a developer account and paying the
> fee commits to a route nobody has chosen.
>
> If you change this, change `docs/decisions.md` §12 and §14 in the Perch repository in the
> same edit, along with `TERMS.md` and `PRIVACY.md` here, which now say Hub delivery.

Everything below is ready to paste into the developer dashboard. Sourced from the current
Chrome Web Store docs (publishing flow, image specs, privacy tab, review process).

---

## 1. One-time account setup

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in
   with the Google account that will own the extension. **Pick this carefully** — an item
   cannot be moved between accounts later.
2. Pay the **one-time $5 USD registration fee**.
3. Fill in your publisher account details and **verify your contact email**. Google will not
   let you publish until the email is verified.

> Limit: 20 published extensions per account.

---

## 2. Build the package

```bash
cd /Users/trixarh/Downloads/anti-blur && ./build.sh
```

That produces `dist/anti-blur-1.0.0.zip` containing only what ships — `manifest.json`,
`inject.js`, `popup.html`, `privacy-policy.html`, `terms.html`, `LICENSE`, `icons/`. The
two legal pages are both in the package because the popup links to them relatively, so
dropping either turns a footer link into a dead one. It deliberately excludes
`.DS_Store`, `__MACOSX/`, `.claude/`, `store-assets/` and the markdown docs.

Your original `anti blur.zip` should **not** be used — it contains `__MACOSX/` resource-fork
junk that reviewers see as unexplained files.

---

## 3. Upload and fill the five tabs

**Add new item → upload `dist/anti-blur-1.0.0.zip`.**

### Package tab
Read-only after upload. Confirm version reads `1.0.0`.

### Store listing tab

| Field | Value |
| --- | --- |
| **Name** | `Anti Blur — Keep Pages Active` |
| **Short description** | Pulled automatically from the manifest (123/132 chars) |
| **Category** | Productivity |
| **Language** | English |
| **Homepage URL** | `https://calyndrae.com/projects/anti-blur` |
| **Support URL** | `https://calyndrae.com/projects/anti-blur` (or a mailto: link) |

**Detailed description** — paste this:

```
Websites can tell the moment you look away. Switch tabs, click into another window, or
move your mouse off the page, and the site knows — because the browser tells it, through
document.hasFocus(), document.hidden, document.visibilityState, and events like blur and
visibilitychange.

Anti Blur answers all of those the same way, every time: focused, visible, present. The
page carries on as though you never left.

WHAT THIS FIXES

• Videos and audio that pause the moment you switch tabs
• Slideshows, timers and progress that stall in a background tab
• Pages that reload or reset themselves when you come back
• "Time on page" and attention analytics that log every glance away
• Exit-intent popups that fire when your mouse leaves the window
• Animations and canvas work that freeze while you are reading something else

HOW IT WORKS

A single script runs on each page before the page's own code does, and adjusts the browser
APIs that report focus and visibility. That is the entire extension — about ninety lines,
one file.

PRIVACY

Anti Blur collects nothing. It has no servers, no storage, no analytics, no ad code, no
third-party libraries and no way to make a network request. Nothing about you or the pages
you visit leaves your device, because there is no code capable of sending it.

It asks for no permissions beyond running its script on pages. There is no account, no
subscription and no paid tier.

GOOD TO KNOW

• Works on all sites, in all frames, from the moment a page starts loading
• Requires Chrome 111 or newer
• Some sites use focus events to autosave drafts; if a site behaves oddly, turn the
  extension off for a moment from chrome://extensions
```

**Images** — all in `store-assets/`:

| Slot | File | Spec |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128, 96×96 artwork + 16px transparent padding ✓ |
| Screenshot 1 | `screenshot-1.png` | 1280×800 ✓ |
| Screenshot 2 | `screenshot-2.png` | 1280×800 ✓ |
| Screenshot 3 | `screenshot-3.png` | 1280×800 ✓ |
| Small promo tile | `promo-tile-440x280.png` | 440×280 ✓ |

Screenshots must be full-bleed with square corners and no padding — these are.

### Privacy tab

**Single purpose description:**

```
Anti Blur has one purpose: to prevent websites from detecting that the user has switched
tabs, moved focus to another window, or moved the mouse off the page. It does this by
adjusting the browser's focus and visibility APIs on each page so they consistently report
the page as focused and visible.
```

**Permission justification — `<all_urls>` host access:**

```
The extension's only function is to change how a web page perceives the user's focus and
visibility state. To do that, its script must run inside the page itself, before the page's
own scripts run. Focus and visibility detection is not specific to any category of site and
can appear on any page, so the script must be able to run on any site the user chooses to
visit. The script only reads and overrides standard browser APIs (document.hasFocus,
document.hidden, document.visibilityState and the related events). It does not read page
content, form input, credentials or browsing history, does not store anything, and cannot
make network requests. No other permission is requested: there is no background service
worker, no storage permission and no host permission for any remote server.
```

**Remote code:** select **No, I am not using remote code.**

**Data usage:** tick **nothing**. Then check all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** required. See §4 below.

### Distribution tab
Visibility **Public**, all regions, free. No in-app purchases.

### Test instructions tab
No login is needed, but reviewers appreciate a repro. Paste:

```
No account or setup required. To verify:
1. Install and open any page, e.g. https://example.com
2. Open DevTools console and run:  document.hasFocus()
3. Click onto another window so the page loses focus, then run it again from the console.
   Without the extension it returns false; with the extension it returns true.
4. Run: document.hidden — it stays false after switching to another tab.
```

---

## 4. Host the privacy policy

Google requires a **public URL** that loads without a login. Host these two pages on
calyndrae.com:

| File | Publish at |
| --- | --- |
| `privacy-policy.html` | `https://calyndrae.com/projects/anti-blur/privacy-policy` |
| `terms.html` | `https://calyndrae.com/projects/anti-blur/terms` |

`PRIVACY.md` and `TERMS.md` are the same text in Markdown if your site builds from Markdown.
Both pages cross-link to each other and to `https://calyndrae.com/projects/anti-blur`, so those
three URLs need to resolve once you publish.

> **Publish the policy and terms only — not the source.** The extension is proprietary (see
> `LICENSE`). Do not push this project to a public repository. If you keep it in git, make
> that repository **private**.

Paste the privacy URL into the Privacy tab. There is no Terms field in the dashboard — the
terms page is linked from the extension's own popup and from the privacy policy footer.

Paste that URL into the Privacy tab.

---

## 5. Submit and wait

Most extensions clear review in a few days; it can take a few weeks. **Expect the slower end
here.** Google explicitly flags for extra scrutiny:

- new developers and new items — that's you on both counts
- broad host permissions (`<all_urls>`) — that's this extension's core requirement

Points in your favour: no permissions beyond the content script, no service worker, no
remote code, no minification or obfuscation, and about ninety readable lines. Reviewers move
faster through code they can read in one sitting.

If review passes three weeks with no changes on your side, contact Chrome Web Store support.
After approval you have 30 days to publish if you chose deferred publishing.

---

## One thing to be aware of

Focus- and visibility-spoofing extensions sit in a category that reviewers associate with
defeating online exam proctoring, and listings that market themselves that way get rejected
and removed. The listing copy above deliberately stays on the legitimate ground this
extension genuinely occupies — media playback, background timers, exit-intent popups, and
attention analytics. Keep it there. Don't add "works with [proctoring tool]", "undetectable",
or exam-related keywords to the title, description or screenshots; that is the single fastest
route to a takedown, and it would also be the extension's most defensible feature turned into
its biggest liability.
