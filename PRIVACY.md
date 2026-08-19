# Privacy Policy — Anti Blur

**Chrome extension · Effective 14 August 2026 · Version 1.0.0**

> **Anti Blur collects nothing.** It has no servers, makes no network requests, stores no
> data, and contains no analytics, tracking or advertising code. Everything it does happens
> locally in your browser and is discarded the moment you close the tab.

## What the extension does

Anti Blur runs a single script on the pages you visit. That script adjusts standard browser
APIs so that a website cannot tell when you switch tabs, click into another window, or move
your mouse off the page. Specifically it makes the page report itself as focused and visible,
and it stops `blur`, `visibilitychange` and related events from reaching the website's own code.

This is a purely local modification of how a web page perceives your browser. No information
about you, the page, or your activity leaves your device as a result.

## Data we collect

None. The categories below are the ones Google asks every Chrome Web Store developer to
declare. Anti Blur collects, transmits and stores *none* of them.

| Category | Collected? |
| --- | --- |
| Personally identifiable information (name, address, email, age, ID numbers) | **No** |
| Health information | **No** |
| Financial and payment information | **No** |
| Authentication information (passwords, credentials, tokens, PINs) | **No** |
| Personal communications (emails, texts, chat messages) | **No** |
| Location (region, IP address, GPS, place names) | **No** |
| Web history (pages visited, page titles, URLs, timestamps) | **No** |
| User activity (clicks, scrolls, keystrokes, mouse position) | **No** |
| Website content (text, images, videos, hyperlinks, files) | **No** |

## Permissions and why they exist

- **Access to the websites you visit** (`<all_urls>` content script). The extension's entire
  purpose is to change how a page perceives your focus, so its script has to run on the page
  itself. It runs on every site because focus and visibility detection can appear on any site.
  The script only reads and modifies browser APIs — it does not read page content, form fields,
  or anything you type.

Anti Blur requests no other permissions. It has no background service worker, no storage
permission, no host permission for any remote server, and no ability to make network requests.

## Data sharing and sale

Because no data is collected, none is shared, sold, rented, transferred, or disclosed to
anyone — including us. There are no third-party services, SDKs, libraries or analytics
providers of any kind in this extension. No data is used to determine creditworthiness or for
lending purposes.

## Remote code

The extension executes no remotely hosted code. All of its code is contained in the package you
install from the Chrome Web Store and can be inspected there.

## Children

Anti Blur is not directed at children and, since it collects no data, it collects no data from
children.

## Changes to this policy

If a future version of Anti Blur ever handles data differently, this policy will be updated
before that version is published, and the effective date above will change. Material changes
will be noted in the extension's Chrome Web Store listing.

## Contact

Questions about this policy or the extension: **calyndrae@gmail.com**

---

Anti Blur is provided as-is, free of charge. This policy applies only to the Anti Blur Chrome
extension and not to any website you visit while it is installed.
