// SPDX-FileCopyrightText: 2026 Calyndrae <https://calyndrae.com/projects/anti-blur>
// SPDX-License-Identifier: LicenseRef-Proprietary
// Anti Blur — © 2026 Calyndrae. All rights reserved.
// Proprietary. Not licensed for redistribution, reuse, or re-upload to any
// extension gallery. Licensing: calyndrae@gmail.com

// Runs in the page's MAIN world at document_start.
// Because of `world: "MAIN"` in the manifest, our overrides land on the
// actual prototypes the page will use — no isolation gap to bridge.
//
// `match_origin_as_fallback` in the manifest extends this to about:blank,
// about:srcdoc, data: and blob: frames. Those inherit their parent's origin
// but get a *fresh* set of natives, so without it a page could read pristine
// copies out of a throwaway iframe and compare them against ours.

(function () {
    'use strict';

    // Exotic frames (sandboxed, data:) can be missing pieces of the DOM API.
    // Everything below is best-effort: a failure must never break the page.
    try {

    const origAEL = EventTarget.prototype.addEventListener;
    const fnToString = Function.prototype.toString;
    const getDesc = Object.getOwnPropertyDescriptor;

    // Originals, kept so every fake can defer to the real implementation.
    const realHasFocus = Document.prototype.hasFocus;
    const realGet = {};
    ['hidden', 'webkitHidden', 'visibilityState', 'webkitVisibilityState'].forEach(k => {
        const d = getDesc(Document.prototype, k);
        if (d && typeof d.get === 'function') realGet[k] = d.get;
    });

    // ─── Stack scrubbing ─────────────────────────────────────────────────────
    // A thrown error whose stack mentions chrome-extension://<id>/inject.js is
    // the single most damning tell available — it names the extension outright.
    // Strip our own frames before the error reaches page code.
    function scrub(err) {
        try {
            if (err && typeof err.stack === 'string' &&
                err.stack.indexOf('chrome-extension://') !== -1) {
                err.stack = err.stack.split('\n')
                    .filter(line => line.indexOf('chrome-extension://') === -1)
                    .join('\n');
            }
        } catch (e) {}
        return err;
    }

    // ─── toString / name camouflage ──────────────────────────────────────────
    // Every function or getter we install is registered here with the exact
    // native string it must report. A single Proxy over Function.prototype.toString
    // makes `fn.toString()` return "function … { [native code] }" for our fakes
    // and the real source for everything else — so the overrides are
    // indistinguishable from the originals under .toString() inspection.
    // Identity lookup only works inside one realm. A page can hand *our*
    // toString a fake belonging to an iframe's realm, which this map has never
    // seen, and read the source straight out. Every realm runs this same script
    // byte-for-byte, so the fake's source text is identical everywhere and works
    // as a realm-independent key — the second lookup closes that hole.
    const nativeStr = new WeakMap();
    const bySource = new Map();

    const setName = (fn, name) => {
        try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {}
    };

    // A plain concise method, deliberately not a Proxy. V8 prints a proxied
    // function as the anonymous "function () { [native code] }", with the name
    // missing — so a neighbouring realm asking for our toString's own source
    // would see that it is not the real one.
    const tsImpl = { toString() {
        if (this && nativeStr.has(this)) return nativeStr.get(this);
        let out;
        try {
            out = fnToString.call(this);
        } catch (err) {
            throw scrub(err);
        }
        const cloaked = bySource.get(out);
        return cloaked !== undefined ? cloaked : out;
    } }.toString;

    // It must report itself as native too, by identity here and by source text
    // from any other realm.
    const tsNative = fnToString.call(fnToString);
    nativeStr.set(tsImpl, tsNative);
    bySource.set(fnToString.call(tsImpl), tsNative);
    setName(tsImpl, fnToString.name);
    Object.defineProperty(Function.prototype, 'toString', {
        value: tsImpl, writable: true, enumerable: false, configurable: true
    });

    // Replace a prototype METHOD, preserving its descriptor shape, name and
    // native toString. Patching the prototype (not the instance) means the
    // document object gains no own-property tell.
    function cloakMethod(proto, name, impl) {
        const desc = getDesc(proto, name);
        if (!desc || typeof desc.value !== 'function') return;
        const native = fnToString.call(desc.value);
        nativeStr.set(impl, native);
        bySource.set(fnToString.call(impl), native);
        setName(impl, desc.value.name);
        Object.defineProperty(proto, name, Object.assign({}, desc, { value: impl }));
    }

    // Replace a prototype GETTER, preserving descriptor shape, getter name and
    // native toString.
    function cloakGetter(proto, name, getter) {
        const desc = getDesc(proto, name);
        if (!desc || typeof desc.get !== 'function') return;
        const native = fnToString.call(desc.get);
        nativeStr.set(getter, native);
        bySource.set(fnToString.call(getter), native);
        setName(getter, desc.get.name);
        Object.defineProperty(proto, name, Object.assign({}, desc, { get: getter }));
    }

    // ─── Who gets lied to ────────────────────────────────────────────────────
    // Only documents with a live browsing context. A document from
    // createHTMLDocument(), DOMParser or createDocument() natively reports
    // hidden/unfocused, and saying otherwise is a one-line detector.
    //
    // hasFocus() needs a further restriction: natively only the top document
    // and the frames actually containing the focused element return true.
    // Answering true in *every* frame is caught by embedding two same-origin
    // iframes and counting, so we reproduce the real chain instead.
    function inFocusChain(win) {
        try {
            if (win === win.top) return true;
            const frame = win.frameElement;   // null across origins
            if (!frame) return true;          // can't compare — keep protecting
            const owner = frame.ownerDocument;
            return owner.activeElement === frame && inFocusChain(owner.defaultView);
        } catch (e) { return true; }
    }

    // ─── Always-focused, always-visible state ────────────────────────────────
    // Declared as concise methods on purpose: unlike function expressions they
    // are non-constructable and carry no own `prototype`, which is exactly how
    // the native methods and getters they replace behave.
    //
    // Each one calls the original first. That costs nothing and buys the native
    // brand check for free — `getter.call(window)` still throws the genuine
    // "TypeError: Illegal invocation" instead of cheerfully returning a value.
    const fake = {
        hasFocus() {
            const real = realHasFocus.call(this);
            return (this.defaultView && inFocusChain(this.defaultView)) ? true : real;
        },
        hidden() {
            const real = realGet.hidden.call(this);
            return this.defaultView ? false : real;
        },
        webkitHidden() {
            const real = realGet.webkitHidden.call(this);
            return this.defaultView ? false : real;
        },
        visibilityState() {
            const real = realGet.visibilityState.call(this);
            return this.defaultView ? 'visible' : real;
        },
        webkitVisibilityState() {
            const real = realGet.webkitVisibilityState.call(this);
            return this.defaultView ? 'visible' : real;
        }
    };

    cloakMethod(Document.prototype, 'hasFocus', fake.hasFocus);
    cloakGetter(Document.prototype, 'visibilityState',       fake.visibilityState);
    cloakGetter(Document.prototype, 'webkitVisibilityState', fake.webkitVisibilityState);
    cloakGetter(Document.prototype, 'hidden',                fake.hidden);
    cloakGetter(Document.prototype, 'webkitHidden',          fake.webkitHidden);

    // ─── Capture-phase backstop ──────────────────────────────────────────────
    // We run before any page script, so these capture listeners fire first and
    // stop the page's own detection from ever seeing the event — including its
    // on* handlers (stopImmediatePropagation halts them before the target phase),
    // which is why we no longer need to redefine onblur/onvisibilitychange (those
    // own-property overrides were themselves a detection tell). Each guard fires
    // only for the window/document *itself*, so element focus/blur/hover are
    // untouched and interactions keep working.
    //
    // Untrusted events pass straight through. A page dispatching its own
    // synthetic blur is doing its own bookkeeping, not watching the user, and
    // swallowing those both breaks that page and hands a detector a free probe:
    // dispatchEvent() an event and see whether your own listener hears it.
    const swallow = e => {
        if (!e.isTrusted) return;
        e.stopImmediatePropagation();
        e.preventDefault();
    };

    // Window focus loss/gain: a real window event has target === window. Element
    // focus/blur passing through capture (target === element) is ignored.
    ['blur', 'focus'].forEach(ev =>
        origAEL.call(window, ev, e => { if (e.target === window) swallow(e); }, true)
    );

    // Tab/visibility changes and page lifecycle: only ever target document/window.
    ['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange',
     'msvisibilitychange', 'pagehide', 'freeze'].forEach(ev => {
        origAEL.call(window,   ev, swallow, true);
        origAEL.call(document, ev, swallow, true);
    });

    // Mouse leaving the page: suppress only when the pointer actually exits the
    // viewport, so element-to-element hover passes through untouched.
    origAEL.call(document, 'mouseleave', e => {
        if (e.target === document || e.target === document.documentElement || e.target === document.body) swallow(e);
    }, true);
    origAEL.call(document, 'mouseout', e => {
        if (!e.relatedTarget) swallow(e);
    }, true);

    } catch (e) { /* leave the page exactly as we found it */ }
})();
