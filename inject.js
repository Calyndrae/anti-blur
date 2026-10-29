// SPDX-FileCopyrightText: 2026 Calyndrae <https://calyndrae.com/projects/anti-blur>
// SPDX-License-Identifier: LicenseRef-Proprietary
// Anti Blur — © 2026 Calyndrae. All rights reserved.
// Proprietary. Not licensed for redistribution, reuse, or re-upload to any
// extension gallery. Licensing: calyndrae@gmail.com

// Runs in the page's MAIN world at document_start.
// Because of `world: "MAIN"`, our overrides land on the actual prototypes the
// page will use — no isolation gap to bridge.
//
// It is registered by background.js rather than listed in the manifest, so
// that a site the person has switched Anti Blur off for can be left out with
// `excludeMatches` — the only way to keep a MAIN-world script off a page
// before the page's own scripts run. `matchOriginAsFallback` extends it to
// about:blank, about:srcdoc, data: and blob: frames. Those inherit their
// parent's origin but get a *fresh* set of natives, so without it a page could
// read pristine copies out of a throwaway iframe and compare them against ours.

(function () {
    'use strict';

    // Exotic frames (sandboxed, data:) can be missing pieces of the DOM API.
    // Everything below is best-effort: a failure must never break the page.
    try {

    // ─── Pristine references ─────────────────────────────────────────────────
    // Everything the fakes touch at runtime is captured here, before any page
    // script exists, and invoked through a captured Reflect.apply.
    //
    // THIS IS NOT TIDINESS, IT IS A LEAK THAT WAS OPEN. A fake that runs
    // `real.call(this)` looks up Function.prototype.call AT CALL TIME, and one
    // that reads `this.defaultView` runs Document.prototype's getter at call
    // time. A page that replaces either with a counter, then reads
    // document.hidden, sees the counter move — and a native getter calls no
    // JavaScript at all, so any movement proves something sits in between. The
    // same holds for WeakMap/Map methods, String/Array methods in the stack
    // scrubber, Event getters in the guards and setTimeout in the frame bridge.
    // Nothing below this block reads a property the page can reach.
    const rApply = Reflect.apply;
    const getDesc = Object.getOwnPropertyDescriptor;
    const getProto = Object.getPrototypeOf;
    const hasOwn = Object.prototype.hasOwnProperty;
    const NativeError = Error;
    const fnToString = Function.prototype.toString;
    const origAEL = EventTarget.prototype.addEventListener;
    const wmHas = WeakMap.prototype.has, wmGet = WeakMap.prototype.get, wmSet = WeakMap.prototype.set;
    const mapGet = Map.prototype.get, mapSet = Map.prototype.set, mapHas = Map.prototype.has;
    const mapDelete = Map.prototype.delete, mapForEach = Map.prototype.forEach, mapClear = Map.prototype.clear;
    const strIndexOf = String.prototype.indexOf, strSplit = String.prototype.split;
    const arrFilter = Array.prototype.filter, arrJoin = Array.prototype.join;

    const getterOf = (obj, name) => {
        const d = obj && getDesc(obj, name);
        return d && typeof d.get === 'function' ? d.get : null;
    };
    const methodOf = (obj, name) => {
        const d = obj && getDesc(obj, name);
        return d && typeof d.value === 'function' ? d.value : null;
    };
    // Window's members live on the window object itself (it is a [Global]
    // interface); the prototype is the fallback, not the first place to look.
    const onWindow = (name, read) => read(window, name) || read(getProto(window), name);

    const D = Document.prototype;
    const realHasFocus = methodOf(D, 'hasFocus');
    const realGet = {};
    ['hidden', 'webkitHidden', 'visibilityState', 'webkitVisibilityState'].forEach(k => {
        realGet[k] = getterOf(D, k);
    });
    const realDefaultView = getterOf(D, 'defaultView');
    const realActiveElement = getterOf(D, 'activeElement');
    const realDocumentElement = getterOf(D, 'documentElement');
    const realBody = getterOf(D, 'body');
    const realTimeline = getterOf(D, 'timeline');
    const realTimelineTime = typeof AnimationTimeline === 'function'
        ? getterOf(AnimationTimeline.prototype, 'currentTime') : null;
    const realOwnerDocument = getterOf(Node.prototype, 'ownerDocument');
    const realFrameElement = onWindow('frameElement', getterOf);
    const realTarget = getterOf(Event.prototype, 'target');
    const realStopImmediate = methodOf(Event.prototype, 'stopImmediatePropagation');
    const realFocusRelated = typeof FocusEvent === 'function'
        ? getterOf(FocusEvent.prototype, 'relatedTarget') : null;
    const realMouseRelated = getterOf(MouseEvent.prototype, 'relatedTarget');
    const realRAF = onWindow('requestAnimationFrame', methodOf);
    const realCAF = onWindow('cancelAnimationFrame', methodOf);
    const realSetTimeout = onWindow('setTimeout', methodOf);
    const realClearTimeout = onWindow('clearTimeout', methodOf);
    const perf = window.performance;
    const realNow = methodOf(Performance.prototype, 'now');

    // ─── Stack scrubbing ─────────────────────────────────────────────────────
    // A thrown error whose stack mentions chrome-extension://<id>/inject.js is
    // the single most damning tell available — it names the extension outright.
    // Every fake calls the real implementation first, so handing one the wrong
    // receiver (`hiddenGetter.call(window)`) throws the genuine TypeError — from
    // inside OUR frame. callReal() scrubs that frame before it reaches the page.
    //
    // It used to be applied to toString alone, which left every getter and
    // hasFocus naming the extension in exactly the probe it was written for.
    const EXT = 'chrome-extension://';
    const ours = s => typeof s === 'string' && rApply(strIndexOf, s, [EXT]) !== -1;

    // V8 builds `error.stack` lazily, on first read, and if the page has set
    // Error.prepareStackTrace it is handed the raw call sites — ours included —
    // before any string exists to scrub. So the scrubber reads `.stack` first,
    // under a hook that drops our call sites and passes the rest to the page's.
    // That needs CallSite#getFileName, which is only reachable from inside a
    // hook; it is fetched once, here, before the page could have tampered with
    // the CallSite prototype.
    let csFileName = null;
    try {
        const had = rApply(hasOwn, NativeError, ['prepareStackTrace']);
        const prev = NativeError.prepareStackTrace;
        NativeError.prepareStackTrace = (e, sites) => sites;
        const sites = new NativeError().stack;
        // Put it back EXACTLY: an own property left behind with the value
        // undefined is itself visible in Object.getOwnPropertyNames(Error).
        if (had) NativeError.prepareStackTrace = prev;
        else delete NativeError.prepareStackTrace;
        if (sites && sites[0]) csFileName = methodOf(getProto(sites[0]), 'getFileName');
    } catch (e) {}

    function scrub(err) {
        try {
            if (err === null || typeof err !== 'object') return err;
            const hook = NativeError.prepareStackTrace;
            if (typeof hook === 'function' && csFileName) {
                NativeError.prepareStackTrace = function (e, sites) {
                    const kept = rApply(arrFilter, sites,
                        [site => !ours(rApply(csFileName, site, []))]);
                    return rApply(hook, this, [e, kept]);
                };
                try { void err.stack; } finally { NativeError.prepareStackTrace = hook; }
                return err;
            }
            const stack = err.stack;
            if (ours(stack)) {
                err.stack = rApply(arrJoin, rApply(arrFilter, rApply(strSplit, stack, ['\n']),
                    [line => !ours(line)]), ['\n']);
            }
        } catch (e) {}
        return err;
    }

    // Call the real implementation with the caller's receiver and arguments,
    // so validation, brand checks and their errors stay the browser's own.
    function callReal(fn, self, args) {
        try {
            return rApply(fn, self, args);
        } catch (err) {
            throw scrub(err);
        }
    }

    // ─── toString / name camouflage ──────────────────────────────────────────
    // Every function or getter we install is registered here with the exact
    // native string it must report. A replacement Function.prototype.toString
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
        if (this && rApply(wmHas, nativeStr, [this])) return rApply(wmGet, nativeStr, [this]);
        const out = callReal(fnToString, this, []);
        const cloaked = rApply(mapGet, bySource, [out]);
        return cloaked !== undefined ? cloaked : out;
    } }.toString;

    const register = (impl, native) => {
        rApply(wmSet, nativeStr, [impl, native]);
        rApply(mapSet, bySource, [rApply(fnToString, impl, []), native]);
    };

    // It must report itself as native too, by identity here and by source text
    // from any other realm.
    register(tsImpl, rApply(fnToString, fnToString, []));
    setName(tsImpl, fnToString.name);
    Object.defineProperty(Function.prototype, 'toString', {
        value: tsImpl, writable: true, enumerable: false, configurable: true
    });

    // Replace a METHOD, preserving its descriptor shape, name and native
    // toString. Patching the prototype (not the instance) means the document
    // object gains no own-property tell. Window's methods are already own
    // properties of window, so replacing them there adds nothing either.
    function cloakMethod(owner, name, impl) {
        const desc = getDesc(owner, name);
        if (!desc || typeof desc.value !== 'function') return;
        register(impl, rApply(fnToString, desc.value, []));
        setName(impl, desc.value.name);
        Object.defineProperty(owner, name, Object.assign({}, desc, { value: impl }));
    }

    // Replace a prototype GETTER, preserving descriptor shape, getter name and
    // native toString.
    function cloakGetter(proto, name, getter) {
        const desc = getDesc(proto, name);
        if (!desc || typeof desc.get !== 'function') return;
        register(getter, rApply(fnToString, desc.get, []));
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
    const viewOf = doc => rApply(realDefaultView, doc, []);

    function inFocusChain(win) {
        try {
            if (win === win.top) return true;   // `top` is unforgeable
            // Our own window's getter is the captured one; a parent window is
            // another realm, whose own properties are its page's business.
            const frame = win === window ? rApply(realFrameElement, win, []) : win.frameElement;
            if (!frame) return true;            // null across origins — keep protecting
            const owner = rApply(realOwnerDocument, frame, []);
            return rApply(realActiveElement, owner, []) === frame && inFocusChain(viewOf(owner));
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
            const real = callReal(realHasFocus, this, arguments);
            const win = viewOf(this);
            return (win && inFocusChain(win)) ? true : real;
        },
        hidden() {
            const real = callReal(realGet.hidden, this, arguments);
            return viewOf(this) ? false : real;
        },
        webkitHidden() {
            const real = callReal(realGet.webkitHidden, this, arguments);
            return viewOf(this) ? false : real;
        },
        visibilityState() {
            const real = callReal(realGet.visibilityState, this, arguments);
            return viewOf(this) ? 'visible' : real;
        },
        webkitVisibilityState() {
            const real = callReal(realGet.webkitVisibilityState, this, arguments);
            return viewOf(this) ? 'visible' : real;
        }
    };

    cloakMethod(D, 'hasFocus', fake.hasFocus);
    cloakGetter(D, 'visibilityState',       fake.visibilityState);
    cloakGetter(D, 'webkitVisibilityState', fake.webkitVisibilityState);
    cloakGetter(D, 'hidden',                fake.hidden);
    cloakGetter(D, 'webkitHidden',          fake.webkitHidden);

    const reallyHidden = () => rApply(realGet.visibilityState, document, []) === 'hidden';

    // ─── Animation frames in a background tab ────────────────────────────────
    // Telling a page it is visible does not make Chrome draw it. In a hidden
    // tab requestAnimationFrame never fires at all — measured: zero callbacks
    // in ten hidden seconds — so anything driven by a frame loop (progress,
    // game ticks, a "time watched" counter) simply stops, while the page is
    // being told it is on screen. That contradiction is also a detector.
    //
    // While the tab is really hidden, frame callbacks are run by a timer
    // instead. Chrome throttles a hidden page's timers to about one wake-up a
    // second, and after five minutes to about one a minute, so this is a slow
    // heartbeat and not 60fps — but a loop that keeps moving, not one that has
    // stopped. Nothing here can lift that throttling: it is the browser's, and
    // the ways around it (a worker clock) trip the page's Content Security
    // Policy and report themselves to the site.
    //
    // THE CALLBACK IS HANDED TO setTimeout DIRECTLY, never called from a
    // function of ours, so no frame of this script is ever on the stack while
    // page code runs. setTimeout passes the timestamp argument itself.
    //
    // THE LOOP THAT MATTERS WAS ASKED FOR WHILE VISIBLE. A frame loop
    // re-requests from inside its callback, so when the tab hides, its next
    // callback is already queued natively — and Chrome holds it until the tab
    // is visible again. Bridging only calls made while hidden would never
    // reach it. So callbacks requested while visible are remembered with the
    // frame time they were requested in (document.timeline.currentTime, which
    // equals the rAF timestamp and moves once per frame — measured), and at
    // the moment the tab hides, those still queued are cancelled natively and
    // handed to the timer. "Still queued" is "no frame has started since": a
    // later frame time means it ran. The rule can only err towards missing a
    // callback, never towards running one twice.
    //
    // Ids stay the browser's own. A bridged request still reserves a native id
    // (with a callback that only retires our bookkeeping when the tab returns),
    // so ids keep counting up by one exactly as they would natively.
    const FRAME_MS = 16;
    const queued = new Map();    // id -> [callback, frame time] requested while visible
    const bridged = new Map();   // id -> timeout id, run by a timer while hidden

    const frameTime = () => {
        if (!realTimeline || !realTimelineTime) return null;
        try {
            const timeline = rApply(realTimeline, document, []);
            return timeline ? rApply(realTimelineTime, timeline, []) : null;
        } catch (e) { return null; }
    };

    function bridge(id, callback) {
        const due = rApply(realNow, perf, []) + FRAME_MS;
        rApply(mapSet, bridged, [id, rApply(realSetTimeout, window, [callback, FRAME_MS, due])]);
    }

    // The tab has just gone hidden: hand what it queued to the timer.
    function migrate() {
        const now = frameTime();
        if (now !== null) {
            rApply(mapForEach, queued, [(entry, id) => {
                if (entry[1] !== now) return;            // a frame has run it
                rApply(realCAF, window, [id]);
                bridge(id, entry[0]);
            }]);
        }
        rApply(mapClear, queued, []);
    }

    const frames = {
        requestAnimationFrame(callback) {
            if (typeof callback !== 'function' || !reallyHidden()) {
                // Visible, or an argument the browser will reject itself.
                const id = callReal(realRAF, this, arguments);
                const t = frameTime();
                if (t !== null) {
                    // Forget everything a frame has started since.
                    rApply(mapForEach, queued, [(entry, key) => {
                        if (entry[1] !== t) rApply(mapDelete, queued, [key]);
                    }]);
                    rApply(mapSet, queued, [id, [callback, t]]);
                }
                return id;
            }
            let id;
            id = callReal(realRAF, this, [() => { rApply(mapDelete, bridged, [id]); }]);
            bridge(id, callback);
            return id;
        },
        cancelAnimationFrame(handle) {
            const result = callReal(realCAF, this, arguments);
            rApply(mapDelete, queued, [handle]);
            if (rApply(mapHas, bridged, [handle])) {
                rApply(realClearTimeout, window, [rApply(mapGet, bridged, [handle])]);
                rApply(mapDelete, bridged, [handle]);
            }
            return result;
        }
    };

    if (realRAF && realCAF && realSetTimeout && realClearTimeout && realNow && perf &&
        realGet.visibilityState) {
        cloakMethod(window, 'requestAnimationFrame', frames.requestAnimationFrame);
        cloakMethod(window, 'cancelAnimationFrame', frames.cancelAnimationFrame);
    }

    // ─── Capture-phase backstop ──────────────────────────────────────────────
    // We run before any page script, so these capture listeners fire first and
    // stop the page's own detection from ever seeing the event — including its
    // on* handlers (stopImmediatePropagation halts them before the target phase),
    // which is why we no longer need to redefine onblur/onvisibilitychange (those
    // own-property overrides were themselves a detection tell).
    //
    // Untrusted events pass straight through. A page dispatching its own
    // synthetic blur is doing its own bookkeeping, not watching the user, and
    // swallowing those both breaks that page and hands a detector a free probe:
    // dispatchEvent() an event and see whether your own listener hears it.
    const stop = e => rApply(realStopImmediate, e, []);
    const swallow = e => { if (e.isTrusted) stop(e); };   // isTrusted is unforgeable
    const targetOf = e => rApply(realTarget, e, []);

    // ─── Focus: the window, and the element that had it ──────────────────────
    // Leaving the window does not only blur the window. Measured, in order:
    //   blur + focusout on the focused element   relatedTarget null,
    //                                             activeElement still that element,
    //                                             real hasFocus() already false
    //   blur on window
    // and on the way back: focus on window, then focus + focusin on the same
    // element. Swallowing only the window's pair left the element's, so a page
    // watching its own input for focusout still saw the person leave.
    //
    // The three facts above are what tell this apart from focus genuinely
    // moving: to another element (relatedTarget is that element), or by
    // blur() (activeElement drops to <body>, and hasFocus() stays true). Both
    // of those pass through untouched. The return pair is swallowed only for
    // the element whose departure was hidden, so the page never sees a focus
    // it was not told it had lost.
    let restoring = null;
    const relatedOf = e => realFocusRelated ? rApply(realFocusRelated, e, []) : null;

    const leaving = e => {
        if (!e.isTrusted) return;
        const t = targetOf(e);
        if (t === window) { stop(e); return; }
        if (relatedOf(e) !== null) return;
        if (rApply(realActiveElement, document, []) !== t) return;
        if (rApply(realHasFocus, document, [])) return;
        restoring = t;
        stop(e);
    };
    const returning = last => e => {
        if (!e.isTrusted) return;
        const t = targetOf(e);
        if (t === window) { stop(e); return; }
        if (restoring === null) return;
        if (t === restoring && relatedOf(e) === null) {
            stop(e);
            if (last) restoring = null;
            return;
        }
        restoring = null;
    };

    origAEL.call(window, 'blur', leaving, true);
    origAEL.call(window, 'focusout', leaving, true);
    origAEL.call(window, 'focus', returning(false), true);
    origAEL.call(window, 'focusin', returning(true), true);

    // ─── Visibility ──────────────────────────────────────────────────────────
    // Tab and visibility changes only ever target the document. The real
    // transition is also the moment queued frame callbacks move to the timer.
    //
    // pagehide AND freeze ARE NO LONGER SWALLOWED, and that is deliberate.
    // pagehide fires on navigation, closing and the back/forward cache — not on
    // switching tabs — and it is where pages save a draft or send their last
    // beacon; hiding it lost people's work and told the page nothing about
    // where they were looking. freeze is followed by resume, which was never
    // swallowed, so a page saw a resume with no freeze before it. A frozen
    // page runs no script either way; it may as well get to save first.
    const onVisibility = e => {
        if (!e.isTrusted) return;
        stop(e);
        if (reallyHidden()) migrate();
    };
    ['visibilitychange', 'webkitvisibilitychange'].forEach(ev => {
        origAEL.call(window,   ev, onVisibility, true);
        origAEL.call(document, ev, onVisibility, true);
    });

    // Mouse leaving the page: suppress only when the pointer actually exits the
    // viewport, so element-to-element hover passes through untouched.
    origAEL.call(document, 'mouseleave', e => {
        const t = targetOf(e);
        if (t === document || t === rApply(realDocumentElement, document, []) ||
            t === rApply(realBody, document, [])) swallow(e);
    }, true);
    origAEL.call(document, 'mouseout', e => {
        if (!rApply(realMouseRelated, e, [])) swallow(e);
    }, true);

    } catch (e) { /* leave the page exactly as we found it */ }
})();
