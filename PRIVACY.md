# Privacy Policy — Anti Blur

**Chrome extension · Effective 29 October 2026 · Version 1.1.0**

> **Anti Blur collects nothing.** It has no servers, makes no network requests, and
> contains no analytics, tracking or advertising code. The one thing it keeps is the list of
> sites you have switched it off for, which stays in your browser and is never sent anywhere.

## What the extension does

Anti Blur runs a single script on the pages you visit. That script adjusts standard browser
APIs so that a website cannot tell when you switch tabs, click into another window, or move
your mouse off the page. Specifically it makes the page report itself as focused and visible,
and it stops `blur`, `visibilitychange` and related events from reaching the website's own code.

This is a purely local modification of how a web page perceives your browser. No information
about you, the page, or your activity leaves your device as a result.

## Data we collect

None. The categories below are the ones Google's extension policy asks a developer to
declare, used here as a checklist. Anti Blur collects and transmits *none* of them.

**What it stores, locally:** the hostnames of the sites you switched it off for — for
example `www.example.com` — and nothing else: not when, not how often, not which page. They
are kept by Chrome in the extension's own storage on your computer, so that the site stays
off after a restart. Switching a site back on removes it from the list, and removing the
extension deletes the list.

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

- **Access to the websites you visit** (`<all_urls>` host permission). The extension's
  entire purpose is to change how a page perceives your focus, so its script has to run on the
  page itself. It runs on every site because focus and visibility detection can appear on any
  site. The script only reads and modifies browser APIs — it does not read page content, form
  fields, or anything you type.
- **Scripting** (`scripting`). How that script is attached to pages, and how it is kept off
  the sites you switched Anti Blur off for.
- **Storage** (`storage`). The list of sites it is off for, described above.

It also has a background service worker, which keeps that list applied and shows "OFF" on the
toolbar icon for those sites. Anti Blur requests no other permissions and makes no network
requests.

## Data sharing and sale

Because no data is collected, none is shared, sold, rented, transferred, or disclosed to
anyone — including us. There are no third-party services, SDKs, libraries or analytics
providers of any kind in this extension. No data is used to determine creditworthiness or for
lending purposes.

## Remote code

The extension executes no remotely hosted code. All of its code is contained in the package
you load into the browser, where it can be inspected.

## Children

Anti Blur is not directed at children and, since it collects no data, it collects no data from
children.

## Changes to this policy

If a future version of Anti Blur ever handles data differently, this policy will be updated
before that version ships, and the effective date above will change. Material changes will
be noted in the [Pioneering changelog](https://pioneering.app/changelog).

## Contact

Questions about this policy or the extension: **calyndrae@gmail.com**

---

Anti Blur is provided as-is. This policy applies only to the Anti Blur Chrome extension and
not to any website you visit while it is running.
