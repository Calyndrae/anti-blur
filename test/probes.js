/* ============================================================================
 * Anti Blur — adversarial test bench
 * ----------------------------------------------------------------------------
 * Every probe records:
 *   cls = 'stealth'  -> PASS means "no evidence the extension exists".
 *                       On a CONTROL run (no extension) these must all PASS.
 *                       A FAIL here is a detection leak.
 *   cls = 'function' -> PASS means "the spoof actually works".
 *                       On a CONTROL run these are expected to FAIL/NA.
 *   cls = 'info'     -> raw signal, no verdict, for control-vs-extension diffing.
 * ========================================================================== */
(function () {
  'use strict';

  var RESULTS = [];
  var rowsEl = document.getElementById('rows');
  var preEl = document.getElementById('results');
  var statusEl = document.getElementById('status');

  function rec(id, cls, desc, verdict, detail, observed) {
    var r = {
      n: RESULTS.length + 1, id: id, cls: cls, desc: desc,
      verdict: verdict, detail: detail === undefined ? '' : String(detail),
      observed: observed === undefined ? null : observed
    };
    RESULTS.push(r);
    var tr = document.createElement('tr');
    tr.className = verdict;
    function td(t, cn) { var e = document.createElement('td'); e.textContent = t; if (cn) e.className = cn; tr.appendChild(e); }
    td(String(r.n), 'i'); td(id, 'i'); td(cls, 'i'); td(verdict, 'v'); td(desc, 'd'); td(r.detail, 'd');
    rowsEl.appendChild(tr);
    return r;
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return (fallback === undefined) ? ('ERR:' + e.name + ':' + e.message) : fallback; } }
  function isNativeStr(s) { return typeof s === 'string' && /\{\s*\[native code\]\s*\}\s*$/.test(s); }
  function hash(s) { var h = 5381, i; s = String(s); for (i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; } return h.toString(36); }
  function J(v) { return safe(function () { return JSON.stringify(v); }, '<unserializable>'); }

  var D = Document.prototype;
  var descOf = Object.getOwnPropertyDescriptor;
  var hasOwn = Object.prototype.hasOwnProperty;

  /* =========================================================================
   * A. RAW VALUES  (does the spoof do what it claims?)
   * ====================================================================== */
  var vals = {
    hasFocus: safe(function () { return document.hasFocus(); }),
    hidden: safe(function () { return document.hidden; }),
    visibilityState: safe(function () { return document.visibilityState; }),
    webkitHidden: safe(function () { return document.webkitHidden; }),
    webkitVisibilityState: safe(function () { return document.webkitVisibilityState; }),
    webkitHiddenExists: safe(function () { return 'webkitHidden' in document; }),
    webkitVisExists: safe(function () { return 'webkitVisibilityState' in document; }),
    wasDiscarded: safe(function () { return document.wasDiscarded; }),
    prerendering: safe(function () { return document.prerendering; })
  };
  rec('A1-values', 'function', 'document.hasFocus()===true && hidden===false && visibilityState==="visible"',
    (vals.hasFocus === true && vals.hidden === false && vals.visibilityState === 'visible') ? 'PASS' : 'FAIL',
    J(vals), vals);

  rec('A2-webkit', 'info', 'webkit-prefixed variants (only patched if the browser has them)',
    'INFO', 'webkitHidden=' + J(vals.webkitHidden) + ' exists=' + vals.webkitHiddenExists +
    ' | webkitVisibilityState=' + J(vals.webkitVisibilityState) + ' exists=' + vals.webkitVisExists, null);

  /* =========================================================================
   * B. toString / name / length / DESCRIPTOR CAMOUFLAGE
   * ====================================================================== */
  var targets = [
    { k: 'Document.prototype.hasFocus', get: function () { return descOf(D, 'hasFocus'); }, kind: 'method', ref: 'getElementById' },
    { k: 'Document.prototype.hidden(get)', get: function () { return descOf(D, 'hidden'); }, kind: 'getter', ref: 'URL' },
    { k: 'Document.prototype.visibilityState(get)', get: function () { return descOf(D, 'visibilityState'); }, kind: 'getter', ref: 'URL' },
    { k: 'Document.prototype.webkitHidden(get)', get: function () { return descOf(D, 'webkitHidden'); }, kind: 'getter', ref: 'URL' },
    { k: 'Document.prototype.webkitVisibilityState(get)', get: function () { return descOf(D, 'webkitVisibilityState'); }, kind: 'getter', ref: 'URL' },
    { k: 'Function.prototype.toString', get: function () { return descOf(Function.prototype, 'toString'); }, kind: 'method', ref: null }
  ];

  var refMethodDesc = descOf(D, 'getElementById');
  var refGetterDesc = descOf(D, 'URL');
  var refMethodFn = refMethodDesc.value;
  var refGetterFn = refGetterDesc.get;
  var NATIVE_FN_OWN_PROPS = Object.getOwnPropertyNames(refMethodFn).join(',');   // expected "length,name"
  var NATIVE_GET_OWN_PROPS = Object.getOwnPropertyNames(refGetterFn).join(',');

  rec('B0-reference', 'info', 'known-native reference shapes (Document.prototype.getElementById / .URL)',
    'INFO', 'methodOwnProps=[' + NATIVE_FN_OWN_PROPS + '] getterOwnProps=[' + NATIVE_GET_OWN_PROPS + ']' +
    ' methodDesc=' + J({ w: refMethodDesc.writable, e: refMethodDesc.enumerable, c: refMethodDesc.configurable }) +
    ' getterDesc=' + J({ set: refGetterDesc.set === undefined ? 'undefined' : typeof refGetterDesc.set, e: refGetterDesc.enumerable, c: refGetterDesc.configurable }), null);

  targets.forEach(function (t) {
    var d = safe(t.get, null);
    if (!d) { rec('B-' + t.k, 'info', t.k + ' — property absent in this browser', 'INFO', 'no descriptor', null); return; }
    var fn = t.kind === 'getter' ? d.get : d.value;
    if (typeof fn !== 'function') { rec('B-' + t.k, 'info', t.k + ' — not a function', 'INFO', String(fn), null); return; }

    var o = {
      toString: safe(function () { return Function.prototype.toString.call(fn); }),
      name: safe(function () { return fn.name; }),
      length: safe(function () { return fn.length; }),
      ownProps: safe(function () { return Object.getOwnPropertyNames(fn).join(','); }),
      hasPrototypeProp: safe(function () { return hasOwn.call(fn, 'prototype'); }),
      protoValue: safe(function () { return typeof fn.prototype; }),
      isConstructor: safe(function () { try { Reflect.construct(fn, []); return true; } catch (e) { return /not a constructor/.test(e.message) ? false : 'threw:' + e.message; } }),
      nameDesc: safe(function () { var nd = descOf(fn, 'name'); return nd ? J({ w: nd.writable, e: nd.enumerable, c: nd.configurable }) : 'none'; }),
      lengthDesc: safe(function () { var ld = descOf(fn, 'length'); return ld ? J({ w: ld.writable, e: ld.enumerable, c: ld.configurable }) : 'none'; }),
      propDesc: t.kind === 'getter'
        ? J({ hasGet: typeof d.get, set: d.set === undefined ? 'undefined' : typeof d.set, e: d.enumerable, c: d.configurable })
        : J({ w: d.writable, e: d.enumerable, c: d.configurable }),
      stringifyViaTemplate: safe(function () { return ('' + fn).slice(0, 60); }),
      objToString: safe(function () { return Object.prototype.toString.call(fn); })
    };

    // B1: toString reports [native code]
    rec('B1:' + t.k, 'stealth', t.k + ' — Function.prototype.toString.call() reports [native code]',
      isNativeStr(o.toString) ? 'PASS' : 'FAIL', 'toString=' + J(o.toString), o);

    // B2: own-property list matches a real native function ("prototype" must NOT be there)
    var expect = t.kind === 'getter' ? NATIVE_GET_OWN_PROPS : NATIVE_FN_OWN_PROPS;
    rec('B2:' + t.k, 'stealth', t.k + ' — Object.getOwnPropertyNames(fn) matches a native builtin (no "prototype", same order)',
      o.ownProps === expect ? 'PASS' : 'FAIL',
      'got=[' + o.ownProps + '] expected=[' + expect + '] hasOwn("prototype")=' + o.hasPrototypeProp +
      ' typeof fn.prototype=' + o.protoValue, o);

    // B3: builtin methods are not constructors
    rec('B3:' + t.k, 'stealth', t.k + ' — new fn() must throw "is not a constructor" like a real builtin',
      o.isConstructor === false ? 'PASS' : 'FAIL', 'Reflect.construct succeeded? ' + J(o.isConstructor), o);

    // B4: name / length
    var expectedName = ({
      'Document.prototype.hasFocus': 'hasFocus',
      'Document.prototype.hidden(get)': 'get hidden',
      'Document.prototype.visibilityState(get)': 'get visibilityState',
      'Document.prototype.webkitHidden(get)': 'get webkitHidden',
      'Document.prototype.webkitVisibilityState(get)': 'get webkitVisibilityState',
      'Function.prototype.toString': 'toString'
    })[t.k];
    rec('B4:' + t.k, 'stealth', t.k + ' — .name / .length / descriptor-of-name match native',
      (o.name === expectedName && o.length === 0 && o.nameDesc === '{"w":false,"e":false,"c":true}') ? 'PASS' : 'FAIL',
      'name=' + J(o.name) + ' (want ' + J(expectedName) + ') length=' + o.length + ' nameDesc=' + o.nameDesc + ' lengthDesc=' + o.lengthDesc, o);

    // B5: property descriptor shape vs the known-native reference
    var refShape = t.kind === 'getter'
      ? J({ hasGet: typeof refGetterDesc.get, set: refGetterDesc.set === undefined ? 'undefined' : typeof refGetterDesc.set, e: refGetterDesc.enumerable, c: refGetterDesc.configurable })
      : (t.k === 'Function.prototype.toString'
        ? J({ w: true, e: false, c: true })
        : J({ w: refMethodDesc.writable, e: refMethodDesc.enumerable, c: refMethodDesc.configurable }));
    rec('B5:' + t.k, 'stealth', t.k + ' — property descriptor shape matches native reference',
      o.propDesc === refShape ? 'PASS' : 'FAIL', 'got=' + o.propDesc + ' ref=' + refShape, o);
  });

  /* =========================================================================
   * C. OWN-PROPERTY TELLS on document / Document.prototype / window
   * ====================================================================== */
  var docOwn = safe(function () { return Object.getOwnPropertyNames(document); }, []);
  var docProtoKeys = safe(function () { return Reflect.ownKeys(D).map(String); }, []);
  var funcProtoKeys = safe(function () { return Reflect.ownKeys(Function.prototype).map(String); }, []);
  var winOwn = safe(function () {
    return Object.getOwnPropertyNames(window).filter(function (k) { return !/^(probeInput|rows|results|tbl|status|meta|frames)$/.test(k); });
  }, []);

  var SUSPECT = /^(hasFocus|hidden|visibilityState|webkitHidden|webkitVisibilityState|onblur|onfocus|onvisibilitychange|onpagehide|onfreeze|onmouseleave|onmouseout)$/;
  var docOwnSuspects = docOwn.filter(function (k) { return SUSPECT.test(k); });
  rec('C1-docOwn', 'stealth', 'Object.getOwnPropertyNames(document) contains no injected own props',
    docOwnSuspects.length === 0 ? 'PASS' : 'FAIL',
    'count=' + docOwn.length + ' suspects=' + J(docOwnSuspects) + ' all=' + J(docOwn), docOwn);

  var winSuspects = winOwn.filter(function (k) { return /^(__|_ab|antiblur|antiBlur|nativeStr|tsProxy|swallow|origAEL|cloak)/i.test(k); });
  rec('C2-winOwn', 'stealth', 'window has no leftover globals from the injected IIFE',
    winSuspects.length === 0 ? 'PASS' : 'FAIL', 'suspects=' + J(winSuspects) + ' windowOwnCount=' + winOwn.length, winSuspects);

  rec('C3-protoKeys', 'info', 'Reflect.ownKeys(Document.prototype) — full list + hash (diff control vs extension for added keys / reordering)',
    'INFO', 'n=' + docProtoKeys.length + ' hash=' + hash(docProtoKeys.join('|')) +
    ' idx(hasFocus)=' + docProtoKeys.indexOf('hasFocus') +
    ' idx(hidden)=' + docProtoKeys.indexOf('hidden') +
    ' idx(visibilityState)=' + docProtoKeys.indexOf('visibilityState'), docProtoKeys);

  rec('C4-funcProtoKeys', 'info', 'Reflect.ownKeys(Function.prototype) — order/content (toString must stay in place)',
    'INFO', 'n=' + funcProtoKeys.length + ' hash=' + hash(funcProtoKeys.join('|')) +
    ' idx(toString)=' + funcProtoKeys.indexOf('toString') + ' keys=' + J(funcProtoKeys), funcProtoKeys);

  // NOTE: in Chrome `onblur` legitimately IS an own accessor of `window`, so the
  // tell is not presence/absence but shape — an injected override shows up as a
  // data property or as an accessor whose get/set do not stringify as native.
  function handlerShape(obj, key) {
    var dd = descOf(obj, key);
    if (!dd) return 'absent';
    if (!dd.get) return 'data-property(w=' + dd.writable + ')';
    return 'accessor{get:' + (isNativeStr(safe(function () { return FTS0.call(dd.get); })) ? 'native' : 'NON-NATIVE') +
      ',set:' + (dd.set ? (isNativeStr(safe(function () { return FTS0.call(dd.set); })) ? 'native' : 'NON-NATIVE') : 'none') +
      ',e:' + dd.enumerable + ',c:' + dd.configurable + '}';
  }
  var FTS0 = Function.prototype.toString;
  var handlerPairs = [
    ['window.onblur', window, 'onblur', window, 'onresize'],
    ['window.onfocus', window, 'onfocus', window, 'onresize'],
    ['window.onpagehide', window, 'onpagehide', window, 'onresize'],
    ['Document.prototype.onvisibilitychange', D, 'onvisibilitychange', D, 'onclick'],
    ['Document.prototype.onfreeze', D, 'onfreeze', D, 'onclick'],
    ['Document.prototype.onmouseleave', D, 'onmouseleave', D, 'onclick'],
    ['Document.prototype.onmouseout', D, 'onmouseout', D, 'onclick']
  ];
  var handlerBad = [];
  var handlerDetail = handlerPairs.map(function (p) {
    var got = handlerShape(p[1], p[2]), ref = handlerShape(p[3], p[4]);
    if (got !== 'absent' && got !== ref) handlerBad.push(p[0] + ' got=' + got + ' ref=' + ref);
    return p[0] + '=' + got;
  }).join(' | ');
  rec('C5-onHandlerShape', 'stealth', 'on* handler properties keep the native accessor shape (no redefinition tell)',
    handlerBad.length === 0 ? 'PASS' : 'FAIL',
    handlerDetail + (handlerBad.length ? (' || MISMATCH: ' + handlerBad.join('; ')) : ''), null);

  rec('C6-docOwnHandler', 'stealth', 'no on* handler was turned into an own property of the document instance',
    docOwn.filter(function (k) { return /^on/.test(k); }).length === 0 ? 'PASS' : 'FAIL',
    'documentOwnOnProps=' + J(docOwn.filter(function (k) { return /^on/.test(k); })), null);

  /* =========================================================================
   * D. Function.prototype.toString SELF-CONSISTENCY / Proxy tells
   * ====================================================================== */
  var FTS = Function.prototype.toString;

  rec('D1-ftsSelf', 'stealth', 'Function.prototype.toString.toString() looks native',
    isNativeStr(safe(function () { return FTS.toString(); })) ? 'PASS' : 'FAIL',
    J(safe(function () { return FTS.toString(); })), null);

  rec('D2-ftsSelfCall', 'stealth', 'Function.prototype.toString.call(Function.prototype.toString) looks native',
    isNativeStr(safe(function () { return FTS.call(FTS); })) ? 'PASS' : 'FAIL',
    J(safe(function () { return FTS.call(FTS); })), null);

  function thisErr(v) {
    try { FTS.call(v); return { threw: false, name: null, msg: null, stack: null }; }
    catch (e) { return { threw: true, name: e.name, msg: e.message, stack: String(e.stack || '') }; }
  }
  var eU = thisErr(undefined), eN = thisErr(null), eO = thisErr({}), eS = thisErr('x');
  var wantMsg = /this.*be a Function|requires that/i;
  rec('D3-ftsThisErrors', 'stealth', 'FPT.toString.call(undefined|null|{}|"x") throws the same TypeError as native',
    (eU.threw && eN.threw && eO.threw && eS.threw && eU.name === 'TypeError' && wantMsg.test(eU.msg)) ? 'PASS' : 'FAIL',
    'undefined=' + eU.name + ':' + eU.msg + ' | null=' + eN.name + ' | obj=' + eO.name + ' | str=' + eS.name, null);

  // The Proxy's apply trap is a real JS function -> it appears as an extra stack frame,
  // and in a MAIN-world content script that frame carries a chrome-extension:// URL.
  var refThrow = (function () {
    try { descOf(D, 'URL').get.call(null); return ''; }
    catch (e) { return String(e.stack || ''); }
  })();
  var refLines = refThrow.split('\n').length;
  var ftsStackLines = (eU.stack || '').split('\n');
  var ftsLines = eU.stack ? ftsStackLines.length : -1;
  var stackHasExt = /chrome-extension:\/\//.test(eU.stack || '') || /inject\.js/.test(eU.stack || '');
  // Native shape in V8 is exactly:  "    at toString (<anonymous>)" as the first frame.
  // A Proxy apply trap inserts its own handler frame ahead of / instead of that.
  var firstFrameNative = /^\s*at toString \(<anonymous>\)\s*$/.test(ftsStackLines[1] || '');
  rec('D4-ftsStackFrames', 'stealth', 'error stack from FPT.toString.call(undefined) shows only the native frame — no Proxy trap frame, no chrome-extension:// URL',
    (!stackHasExt && firstFrameNative) ? 'PASS' : 'FAIL',
    'hasExtensionUrl=' + stackHasExt + ' firstFrameIsNativeToString=' + firstFrameNative +
    ' ftsStackLines=' + ftsLines + ' nativeRefStackLines=' + refLines +
    '\nfts.stack=' + (eU.stack || '') + '\nref.stack=' + refThrow, { ftsStack: eU.stack, refStack: refThrow });

  var ftsDesc = descOf(Function.prototype, 'toString');
  rec('D5-ftsDescriptor', 'stealth', 'Object.getOwnPropertyDescriptor(Function.prototype,"toString") looks native',
    (ftsDesc && ftsDesc.writable === true && ftsDesc.enumerable === false && ftsDesc.configurable === true &&
      typeof ftsDesc.value === 'function' && ftsDesc.get === undefined) ? 'PASS' : 'FAIL',
    J({ w: ftsDesc.writable, e: ftsDesc.enumerable, c: ftsDesc.configurable, t: typeof ftsDesc.value }), null);

  rec('D6-ftsMisc', 'stealth', 'FPT.toString misc invariants: ownKeys, proto, typeof, new fn(), Object#toString',
    (safe(function () { return Reflect.ownKeys(FTS).join(','); }) === 'length,name' &&
      Object.getPrototypeOf(FTS) === Function.prototype &&
      typeof FTS === 'function' &&
      Object.prototype.toString.call(FTS) === '[object Function]' &&
      safe(function () { try { new FTS(); return 'constructed'; } catch (e) { return /not a constructor/.test(e.message) ? 'ok' : 'other:' + e.message; } }) === 'ok') ? 'PASS' : 'FAIL',
    'ownKeys=' + J(safe(function () { return Reflect.ownKeys(FTS).map(String); })) +
    ' proto===Function.prototype:' + (Object.getPrototypeOf(FTS) === Function.prototype) +
    ' Object#toString=' + Object.prototype.toString.call(FTS) +
    ' new:' + safe(function () { try { new FTS(); return 'constructed'; } catch (e) { return e.message; } }), null);

  // Behavioural: does it still return real source for ordinary page functions?
  function pageFn(a, b) { return a + b; }
  rec('D7-ftsPassthrough', 'function', 'FPT.toString still returns real source for ordinary page functions',
    /return a \+ b/.test(safe(function () { return FTS.call(pageFn); })) ? 'PASS' : 'FAIL',
    J(safe(function () { return FTS.call(pageFn); })), null);

  // Bound / arrow / class round-trips
  rec('D8-ftsShapes', 'stealth', 'bound functions, classes and arrows still stringify normally',
    (isNativeStr(safe(function () { return FTS.call(pageFn.bind(null)); })) &&
      /class/.test(safe(function () { return FTS.call(class X { }); }))) ? 'PASS' : 'FAIL',
    'bound=' + J(safe(function () { return FTS.call(pageFn.bind(null)); })) +
    ' class=' + J(safe(function () { return FTS.call(class X { }).slice(0, 40); })), null);

  // Cost side-channel: a Proxy apply trap is dramatically slower than a builtin call.
  var tFts = (function () { var t0 = performance.now(), i; var f = function () { }; for (i = 0; i < 20000; i++) FTS.call(f); return performance.now() - t0; })();
  var tRef = (function () { var t0 = performance.now(), i; for (i = 0; i < 20000; i++) Object.prototype.toString.call({}); return performance.now() - t0; })();
  rec('D9-ftsTiming', 'info', 'timing side-channel: 20k FPT.toString calls vs 20k Object#toString calls',
    'INFO', 'fts=' + tFts.toFixed(2) + 'ms ref=' + tRef.toFixed(2) + 'ms ratio=' + (tFts / (tRef || 1)).toFixed(2), { tFts: tFts, tRef: tRef });

  /* =========================================================================
   * E. BRAND CHECKS — native DOM accessors validate their `this`
   * ====================================================================== */
  function brand(label, invoke) {
    var r = safe(function () { var v = invoke(); return { threw: false, value: v }; }, null);
    if (r && r.threw === false) return { ok: false, note: 'returned ' + J(r.value) };
    try { invoke(); return { ok: false, note: 'no throw' }; }
    catch (e) { return { ok: /Illegal invocation/i.test(e.message), note: e.name + ': ' + e.message }; }
  }
  [
    ['hasFocus', function () { return D.hasFocus.call({}); }],
    ['hasFocus(null)', function () { return D.hasFocus.call(null); }],
    ['hidden', function () { return descOf(D, 'hidden').get.call({}); }],
    ['visibilityState', function () { return descOf(D, 'visibilityState').get.call({}); }],
    ['visibilityState(window)', function () { return descOf(D, 'visibilityState').get.call(window); }],
    ['hidden(Document.prototype)', function () { return descOf(D, 'hidden').get.call(D); }]
  ].forEach(function (p) {
    var b = brand(p[0], p[1]);
    rec('E-brand:' + p[0], 'stealth', 'brand check: calling ' + p[0] + ' with a non-Document `this` must throw "Illegal invocation"',
      b.ok ? 'PASS' : 'FAIL', b.note, null);
  });

  /* =========================================================================
   * F. DETACHED / NON-RENDERED DOCUMENTS
   *    Per spec a Document with no browsing context is hidden and unfocused.
   * ====================================================================== */
  var det = safe(function () { return document.implementation.createHTMLDocument('x'); }, null);
  var xml = safe(function () { return document.implementation.createDocument(null, 'root', null); }, null);
  var parsed = safe(function () { return new DOMParser().parseFromString('<html><body></body></html>', 'text/html'); }, null);

  function detProbe(label, doc) {
    if (!doc || typeof doc !== 'object') { rec('F:' + label, 'info', label + ' unavailable', 'INFO', String(doc), null); return; }
    var o = {
      hidden: safe(function () { return doc.hidden; }),
      visibilityState: safe(function () { return doc.visibilityState; }),
      hasFocus: safe(function () { return doc.hasFocus ? doc.hasFocus() : 'n/a'; })
    };
    var native = (o.hidden === true && o.visibilityState === 'hidden' && (o.hasFocus === false || o.hasFocus === 'n/a'));
    rec('F:' + label, 'stealth', label + ' — a document with no browsing context must report hidden:true / "hidden" / hasFocus:false',
      native ? 'PASS' : 'FAIL', J(o), o);
  }
  detProbe('createHTMLDocument', det);
  detProbe('createDocument(XML)', xml);
  detProbe('DOMParser', parsed);

  /* =========================================================================
   * G. EVENT SUPPRESSION — synthetic dispatch
   *    A clean browser delivers synthetic events to page listeners. If they
   *    vanish, something is calling stopImmediatePropagation ahead of us.
   * ====================================================================== */
  function evProbe(id, target, type, EvCtor, init, expectSuppressedByExt, extraDesc) {
    var seen = { capture: false, bubble: false, onprop: false, direct: false };
    var l1 = function () { seen.capture = true; };
    var l2 = function () { seen.bubble = true; };
    target.addEventListener(type, l1, true);
    target.addEventListener(type, l2, false);
    var onKey = 'on' + type;
    var hadOn = false, prevOn = null;
    try { prevOn = target[onKey]; target[onKey] = function () { seen.onprop = true; }; hadOn = (typeof target[onKey] === 'function'); } catch (e) { }
    // a listener attached directly on the *dispatch target* itself
    var l3 = function () { seen.direct = true; };
    target.addEventListener(type, l3, false);

    var ev = safe(function () { return new EvCtor(type, init); }, null);
    var dispatchReturn = null;
    if (ev) dispatchReturn = safe(function () { return target.dispatchEvent(ev); });

    try { target.addEventListener; target.removeEventListener(type, l1, true); target.removeEventListener(type, l2, false); target.removeEventListener(type, l3, false); } catch (e) { }
    try { target[onKey] = prevOn; } catch (e) { }

    var anyFired = seen.capture || seen.bubble || seen.onprop || seen.direct;
    // stealth verdict: in a clean browser everything fires and dispatchEvent()===true (or false only if a page handler prevented it)
    var verdict = anyFired ? 'PASS' : 'FAIL';
    rec('G:' + id, 'stealth', 'synthetic ' + type + ' on ' + extraDesc + ' must reach page listeners (suppression = detection)',
      verdict, 'fired=' + J(seen) + ' onPropSupported=' + hadOn + ' dispatchEvent()=' + J(dispatchReturn) +
      (expectSuppressedByExt ? ' [extension targets this event]' : ''), { seen: seen, dispatchReturn: dispatchReturn });
    return seen;
  }

  evProbe('win-blur', window, 'blur', Event, { cancelable: true }, true, 'window');
  evProbe('win-focus', window, 'focus', Event, { cancelable: true }, true, 'window');
  evProbe('doc-visibilitychange', document, 'visibilitychange', Event, { bubbles: true, cancelable: true }, true, 'document');
  evProbe('win-visibilitychange', window, 'visibilitychange', Event, { bubbles: true, cancelable: true }, true, 'window');
  evProbe('doc-webkitvisibilitychange', document, 'webkitvisibilitychange', Event, { bubbles: true }, true, 'document');
  evProbe('win-pagehide', window, 'pagehide', Event, { cancelable: true }, true, 'window');
  evProbe('doc-pagehide', document, 'pagehide', Event, { cancelable: true }, true, 'document');
  evProbe('doc-freeze', document, 'freeze', Event, { cancelable: true }, true, 'document');
  evProbe('doc-mouseleave', document, 'mouseleave', MouseEvent, { cancelable: true }, true, 'document');
  evProbe('doc-mouseout-noRelated', document, 'mouseout', MouseEvent, { bubbles: true, cancelable: true, relatedTarget: null }, true, 'document (relatedTarget=null)');
  evProbe('doc-mouseout-withRelated', document, 'mouseout', MouseEvent, { bubbles: true, cancelable: true, relatedTarget: document.body }, false, 'document (relatedTarget=body)');
  evProbe('win-pageshow', window, 'pageshow', Event, {}, false, 'window (control event, not targeted)');
  evProbe('win-resize', window, 'resize', Event, {}, false, 'window (control event, not targeted)');

  // Element-level blur must survive (the guard checks e.target===window)
  (function () {
    var el = document.getElementById('probeInput');
    var got = false;
    el.addEventListener('blur', function () { got = true; }, true);
    el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    rec('G:element-blur', 'function', 'element-level blur must still be delivered (guard is window-only)',
      got ? 'PASS' : 'FAIL', 'fired=' + got, null);
  })();

  // Does an ancestor-of-document listener beat the extension's document-level mouse guards?
  (function () {
    var winSaw = false, docSaw = false;
    var a = function () { winSaw = true; }, b = function () { docSaw = true; };
    window.addEventListener('mouseout', a, true);
    document.addEventListener('mouseout', b, true);
    document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
    window.removeEventListener('mouseout', a, true);
    document.removeEventListener('mouseout', b, true);
    rec('G:window-capture-beats-doc-guard', 'function',
      'mouseout suppression must also hold for a listener on window (window is EARLIER in the capture path than document, so it beats a document-level guard)',
      winSaw ? 'FAIL' : 'PASS', 'windowCaptureSaw=' + winSaw + ' documentCaptureSaw=' + docSaw, { winSaw: winSaw, docSaw: docSaw });
  })();

  /* =========================================================================
   * H. BEHAVIOURAL / CONSISTENCY SIGNALS
   * ====================================================================== */
  rec('H1-perfVisibilityEntries', 'stealth', 'performance.getEntriesByType("visibility-state") must not contradict "always visible"',
    (function () {
      var e = safe(function () { return performance.getEntriesByType('visibility-state'); }, null);
      if (!e) return 'INFO';
      var bad = e.filter(function (x) { return x.name === 'hidden'; });
      return bad.length ? 'FAIL' : 'PASS';
    })(),
    J(safe(function () { return performance.getEntriesByType('visibility-state').map(function (x) { return x.name + '@' + Math.round(x.startTime); }); })), null);

  rec('H2-userActivation', 'info', 'navigator.userActivation (a tracker can correlate against a "focused" claim)',
    'INFO', J(safe(function () { return { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive }; })), null);

  rec('H3-lifecycle', 'info', 'document.wasDiscarded / prerendering / readyState / activeElement / visibility-related state',
    'INFO', J(safe(function () {
      return {
        wasDiscarded: document.wasDiscarded, prerendering: document.prerendering,
        readyState: document.readyState,
        activeElement: document.activeElement ? document.activeElement.tagName : null,
        hasFocus: document.hasFocus(),
        topIsSelf: window.top === window
      };
    })), null);

  rec('H4-addEventListenerIntegrity', 'stealth', 'EventTarget.prototype.addEventListener / dispatchEvent / Event.prototype.stopImmediatePropagation untouched',
    (isNativeStr(safe(function () { return FTS.call(EventTarget.prototype.addEventListener); })) &&
      isNativeStr(safe(function () { return FTS.call(EventTarget.prototype.dispatchEvent); })) &&
      isNativeStr(safe(function () { return FTS.call(Event.prototype.stopImmediatePropagation); })) &&
      Object.getOwnPropertyNames(EventTarget.prototype.addEventListener).join(',') === NATIVE_FN_OWN_PROPS) ? 'PASS' : 'FAIL',
    'AEL ownProps=' + Object.getOwnPropertyNames(EventTarget.prototype.addEventListener).join(','), null);

  /* =========================================================================
   * I. PRISTINE-REALM ESCAPE (async)
   * ====================================================================== */
  // frameprobe.js is the single source of truth for the in-frame self-report.
  // blank.html pulls it in with <script src>; here we slurp the same text so it
  // can be inlined into srcdoc / data: / blob: frames, which cannot resolve a
  // relative script URL. Sync XHR keeps the frame-construction order simple.
  var FRAME_PROBE_SRC = safe(function () {
    var x = new XMLHttpRequest();
    x.open('GET', 'frameprobe.js', false);
    x.send(null);
    if (x.status && x.status >= 400) throw new Error('HTTP ' + x.status);
    return x.responseText;
  }, '');
  rec('I-probeSrc', 'info', 'in-frame probe source loaded (shared by blank.html and the inlined exotic frames)',
    'INFO', FRAME_PROBE_SRC ? (FRAME_PROBE_SRC.length + ' bytes') : 'FAILED TO LOAD frameprobe.js', null);
  function frameProbeFor(id) { return 'window.__ABT_ID=' + JSON.stringify(id) + ';\n' + FRAME_PROBE_SRC; }

  var frameReports = Object.create(null);
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__abt === 1 && e.data.id) frameReports[e.data.id] = e.data.r;
  });

  var framesEl = document.getElementById('frames');
  function mk(attrs) {
    var f = document.createElement('iframe');
    Object.keys(attrs).forEach(function (k) { f.setAttribute(k, attrs[k]); });
    framesEl.appendChild(f);
    return f;
  }
  function inFrameDoc(id) { return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><scr' + 'ipt>' + frameProbeFor(id) + '</scr' + 'ipt></body></html>'; }
  function injectInto(f, id) {
    try {
      var d = f.contentDocument;
      if (!d) return 'no contentDocument';
      var s = d.createElement('script');
      s.textContent = frameProbeFor(id);
      (d.body || d.documentElement).appendChild(s);
      return 'injected';
    } catch (e) { return 'ERR:' + e.name + ':' + e.message; }
  }

  // --- I0: the synchronous race. Append an about:blank iframe and read its realm
  //         in the SAME task, before any subsequent microtask/task can run.
  var syncInfo = (function () {
    var f = document.createElement('iframe');
    framesEl.appendChild(f);
    var o = { note: 'read synchronously, same task as appendChild' };
    try {
      var w = f.contentWindow;
      var fd = descOf(w.Document.prototype, 'hasFocus');
      var hd = descOf(w.Document.prototype, 'hidden');
      var vd = descOf(w.Document.prototype, 'visibilityState');
      o.hasFocusHasPrototype = hasOwn.call(fd.value, 'prototype');
      o.hasFocusOwn = Object.getOwnPropertyNames(fd.value).join(',');
      o.hasFocusStr = w.Function.prototype.toString.call(fd.value);
      o.brandThrows = (function () { try { hd.get.call({}); return false; } catch (e) { return true; } })();
      // The escape itself: use the frame's natives on the TOP document.
      o.TOP_realHasFocus = fd.value.call(document);
      o.TOP_realHidden = hd.get.call(document);
      o.TOP_realVisibilityState = vd.get.call(document);
      // A realm counts as pristine only if reading the TOP document through it
      // contradicts what the top document itself claims. Shape-based signatures
      // (own `prototype`, missing brand check) no longer discriminate.
      o.pristine = !(o.TOP_realHasFocus === document.hasFocus() &&
                     o.TOP_realHidden === document.hidden &&
                     o.TOP_realVisibilityState === document.visibilityState);
    } catch (e) { o.err = e.name + ': ' + e.message; }
    o.frame = f;
    return o;
  })();

  rec('I0-syncRace', 'function', 'about:blank iframe read SYNCHRONOUSLY after appendChild: is its Document.prototype already patched?',
    (syncInfo.pristine === false) ? 'PASS' : 'FAIL',
    'pristine=' + syncInfo.pristine + ' hasOwn(prototype)=' + syncInfo.hasFocusHasPrototype +
    ' brandThrows=' + syncInfo.brandThrows +
    ' | escaped view of TOP document: hasFocus=' + J(syncInfo.TOP_realHasFocus) +
    ' hidden=' + J(syncInfo.TOP_realHidden) + ' visibilityState=' + J(syncInfo.TOP_realVisibilityState) +
    (syncInfo.err ? (' err=' + syncInfo.err) : ''),
    { hasFocusHasPrototype: syncInfo.hasFocusHasPrototype, brandThrows: syncInfo.brandThrows, pristine: syncInfo.pristine, TOP: { hasFocus: syncInfo.TOP_realHasFocus, hidden: syncInfo.TOP_realHidden, vis: syncInfo.TOP_realVisibilityState }, err: syncInfo.err });

  rec('I0b-escapedStateMatchesClaim', 'function', 'state read through the sync-grabbed frame realm agrees with the spoofed top-level claim',
    (syncInfo.TOP_realHasFocus === document.hasFocus() &&
      syncInfo.TOP_realHidden === document.hidden &&
      syncInfo.TOP_realVisibilityState === document.visibilityState) ? 'PASS' : 'FAIL',
    'viaFrame={hasFocus:' + J(syncInfo.TOP_realHasFocus) + ',hidden:' + J(syncInfo.TOP_realHidden) + ',vis:' + J(syncInfo.TOP_realVisibilityState) + '}' +
    ' top={hasFocus:' + J(document.hasFocus()) + ',hidden:' + J(document.hidden) + ',vis:' + J(document.visibilityState) + '}', null);

  // --- I1: cross-realm Function.prototype.toString bypass.
  //         Every realm keeps its own private WeakMap of "which functions must lie".
  //         A neighbouring realm's toString therefore prints our real source.
  var xrealm = (function () {
    var o = {};
    try {
      var w = syncInfo.frame.contentWindow;
      var otherFTS = w.Function.prototype.toString;
      o.topHasFocusViaOtherRealm = otherFTS.call(descOf(D, 'hasFocus').value);
      o.topHiddenGetterViaOtherRealm = otherFTS.call(descOf(D, 'hidden').get);
      o.topVisGetterViaOtherRealm = otherFTS.call(descOf(D, 'visibilityState').get);
      o.topFTSViaOtherRealm = otherFTS.call(FTS);
      o.leaked = !isNativeStr(o.topHasFocusViaOtherRealm) || !isNativeStr(o.topHiddenGetterViaOtherRealm) ||
        !isNativeStr(o.topVisGetterViaOtherRealm) ||
        // a real Function.prototype.toString stringifies WITH its name; a Proxy over it loses the name
        !/^function toString\(\) \{ \[native code\] \}$/.test(String(o.topFTSViaOtherRealm));
    } catch (e) { o.err = e.name + ': ' + e.message; }
    return o;
  })();
  rec('I1-crossRealmToString', 'stealth', 'a NEIGHBOURING realm\'s Function.prototype.toString must not print our patched functions\' real source',
    (xrealm.leaked === false) ? 'PASS' : 'FAIL',
    'hasFocus -> ' + J(xrealm.topHasFocusViaOtherRealm) +
    '\nhidden getter -> ' + J(xrealm.topHiddenGetterViaOtherRealm) +
    '\nvisibilityState getter -> ' + J(xrealm.topVisGetterViaOtherRealm) +
    '\nFunction.prototype.toString -> ' + J(xrealm.topFTSViaOtherRealm) +
    (xrealm.err ? ('\nerr=' + xrealm.err) : ''), xrealm);

  // --- I2: multi-frame focus contradiction.
  //         In a real browser at most ONE frame subtree can claim hasFocus().
  //         (built after frames load, below)

  // --- Frame matrix ---
  var FRAMES = [];
  function addFrame(id, build, accessible) { FRAMES.push({ id: id, build: build, accessible: accessible }); }

  addFrame('http-same-origin', function () { return mk({ src: 'blank.html#' + encodeURIComponent('http-same-origin') }); }, true);
  addFrame('no-src(about:blank)', function () { var f = mk({}); setTimeout(function () { injectInto(f, 'no-src(about:blank)'); }, 0); return f; }, true);
  addFrame('about:blank', function () { var f = mk({ src: 'about:blank' }); f.addEventListener('load', function () { injectInto(f, 'about:blank'); }); setTimeout(function () { injectInto(f, 'about:blank'); }, 30); return f; }, true);
  addFrame('srcdoc', function () { return mk({ srcdoc: inFrameDoc('srcdoc') }); }, true);
  addFrame('data:url', function () { return mk({ src: 'data:text/html;charset=utf-8,' + encodeURIComponent(inFrameDoc('data:url')) }); }, false);
  addFrame('blob:url', function () {
    var u = URL.createObjectURL(new Blob([inFrameDoc('blob:url')], { type: 'text/html' }));
    return mk({ src: u });
  }, true);
  addFrame('sandbox(allow-scripts)', function () { return mk({ sandbox: 'allow-scripts', srcdoc: inFrameDoc('sandbox(allow-scripts)') }); }, false);
  addFrame('sandbox(allow-scripts+same-origin)', function () { return mk({ sandbox: 'allow-scripts allow-same-origin', srcdoc: inFrameDoc('sandbox(allow-scripts+same-origin)') }); }, true);
  addFrame('sandbox(allow-scripts)+http', function () { return mk({ sandbox: 'allow-scripts', src: 'blank.html#' + encodeURIComponent('sandbox(allow-scripts)+http') }); }, false);
  addFrame('nested-about:blank', function () {
    var outer = mk({});
    setTimeout(function () {
      try {
        var d = outer.contentDocument;
        var inner = d.createElement('iframe');
        d.body.appendChild(inner);
        var s = inner.contentDocument.createElement('script');
        s.textContent = frameProbeFor('nested-about:blank');
        inner.contentDocument.documentElement.appendChild(s);
      } catch (e) { frameReports['nested-about:blank'] = { err: e.name + ':' + e.message }; }
    }, 60);
    return outer;
  }, true);
  addFrame('doc.write(about:blank)', function () {
    var f = mk({});
    setTimeout(function () {
      try {
        f.contentDocument.open();
        f.contentDocument.write(inFrameDoc('doc.write(about:blank)'));
        f.contentDocument.close();
      } catch (e) { frameReports['doc.write(about:blank)'] = { err: e.name + ':' + e.message }; }
    }, 60);
    return f;
  }, true);
  addFrame('javascript:url', function () {
    var f = mk({ src: 'javascript:"<scr" + "ipt>void 0;</scr" + "ipt>"' });
    setTimeout(function () { injectInto(f, 'javascript:url'); }, 60);
    return f;
  }, true);

  var frameEls = {};
  FRAMES.forEach(function (spec) { frameEls[spec.id] = safe(spec.build, null); });

  // Extra deep-focus frames for the multi-frame contradiction probe
  var focusA = mk({ src: 'blank.html#A' });
  var focusB = mk({ src: 'blank.html#B' });

  /* =========================================================================
   * Behavioural timers (need real elapsed time)
   * ====================================================================== */
  var rafTicks = 0, rafFirst = null, rafLast = null;
  (function loop(t) { rafTicks++; if (rafFirst === null) rafFirst = t; rafLast = t; requestAnimationFrame(loop); })(0);
  var t0 = performance.now();
  var timeoutStamps = [];
  (function tick() { timeoutStamps.push(performance.now() - t0); if (timeoutStamps.length < 12) setTimeout(tick, 0); })();

  /* =========================================================================
   * FINALISE
   * ====================================================================== */
  var finalised = 0;
  function finalise(tag) {
    finalised++;

    // ---- frame results
    var frameRows = [];
    FRAMES.forEach(function (spec) {
      var rep = frameReports[spec.id];
      var direct = null;
      var el = frameEls[spec.id];
      if (el) {
        direct = safe(function () {
          var w = el.contentWindow;
          var fd = descOf(w.Document.prototype, 'hasFocus');
          var hd = descOf(w.Document.prototype, 'hidden');
          return {
            reachable: true,
            hasFocusHasPrototype: hasOwn.call(fd.value, 'prototype'),
            hasFocusOwn: Object.getOwnPropertyNames(fd.value).join(','),
            hasFocusStr: w.Function.prototype.toString.call(fd.value),
            brandThrows: (function () { try { hd.get.call({}); return false; } catch (e) { return true; } })(),
            escapedTopHasFocus: fd.value.call(document),
            escapedTopHidden: hd.get.call(document),
            crossRealmSourceOfTopFake: w.Function.prototype.toString.call(descOf(D, 'hasFocus').value)
          };
        }, null);
        if (typeof direct === 'string') direct = { reachable: false, note: direct };
      }
      var patchedByReport = rep ? rep.patched : null;
      var patchedByDirect = (direct && direct.reachable)
        ? (direct.escapedTopHasFocus === document.hasFocus() && direct.escapedTopHidden === document.hidden)
        : null;
      var patched = (patchedByReport === null || patchedByReport === undefined) ? patchedByDirect : patchedByReport;
      frameRows.push({ id: spec.id, report: rep || null, direct: direct, patched: patched });
    });

    // Record the frame-dependent rows exactly once, on the 2nd pass, by which
    // point every iframe has had time to load and post its self-report back.
    if (finalised === 2) {
      frameRows.forEach(function (fr) {
        var id = 'I2:' + fr.id;
        if (fr.patched === true) {
          rec(id, 'function', 'realm escape via <iframe ' + fr.id + '> — is that realm patched too?', 'PASS',
            'patched=true' + (fr.report ? (' | inFrame: hasFocus=' + J(fr.report.hasFocus) + ' hidden=' + J(fr.report.hidden) + ' vis=' + J(fr.report.visibilityState) +
              ' hasOwn(prototype)=' + J(fr.report.hasFocusHasPrototype) + ' brandThrows=' + J(fr.report.brandThrows) + ' synthVisFires=' + J(fr.report.synthVisFires) +
              ' ftsExtStack=' + J(fr.report.ftsExtStack)) : ' | no in-frame report') +
            (fr.direct && fr.direct.reachable ? (' | fromParent: escapedTopHasFocus=' + J(fr.direct.escapedTopHasFocus) + ' escapedTopHidden=' + J(fr.direct.escapedTopHidden) +
              ' crossRealmSrcOfTopFake=' + J(String(fr.direct.crossRealmSourceOfTopFake).slice(0, 70))) : ''), fr);
        } else if (fr.patched === false) {
          rec(id, 'function', 'realm escape via <iframe ' + fr.id + '> — PRISTINE UNPATCHED NATIVES LEAKED', 'FAIL',
            'PRISTINE REALM' + (fr.report ? (' | inFrame: hasFocus=' + J(fr.report.hasFocus) + ' hidden=' + J(fr.report.hidden) + ' vis=' + J(fr.report.visibilityState) +
              ' hasOwn(prototype)=' + J(fr.report.hasFocusHasPrototype) + ' brandThrows=' + J(fr.report.brandThrows) + ' synthVisFires=' + J(fr.report.synthVisFires)) : ' | no in-frame report') +
            (fr.direct && fr.direct.reachable ? (' | escape yields TOP hasFocus=' + J(fr.direct.escapedTopHasFocus) + ' hidden=' + J(fr.direct.escapedTopHidden)) : ''), fr);
        } else {
          rec(id, 'info', 'realm escape via <iframe ' + fr.id + '> — no data (frame did not report and is not reachable)', 'INFO',
            J({ report: fr.report, direct: fr.direct }), fr);
        }
      });

      // Multi-frame focus contradiction
      var focusStates = safe(function () {
        return {
          top: document.hasFocus(),
          A: focusA.contentDocument ? focusA.contentDocument.hasFocus() : 'n/a',
          B: focusB.contentDocument ? focusB.contentDocument.hasFocus() : 'n/a',
          topActiveElement: document.activeElement ? document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '') : null
        };
      }, null);
      var trueCount = 0;
      if (focusStates && typeof focusStates === 'object') {
        ['top', 'A', 'B'].forEach(function (k) { if (focusStates[k] === true) trueCount++; });
      }
      rec('I3-multiFrameFocus', 'stealth',
        'impossible state: two sibling iframes + top all reporting hasFocus()===true at once (at most one subtree can be focused)',
        (trueCount <= 2) ? 'PASS' : 'FAIL',
        'trueCount=' + trueCount + ' ' + J(focusStates), focusStates);

      // Focus one iframe, then re-check
      var afterFocus = safe(function () {
        var inp = focusA.contentDocument.getElementById('i');
        if (inp) inp.focus();
        return { top: document.hasFocus(), A: focusA.contentDocument.hasFocus(), B: focusB.contentDocument.hasFocus(), topActive: document.activeElement ? document.activeElement.tagName : null };
      }, null);
      rec('I4-focusMoves', 'stealth', 'after focusing an input inside frame A, frame B must report hasFocus()===false',
        (afterFocus && afterFocus.B === false) ? 'PASS' : 'FAIL', J(afterFocus), afterFocus);

      // Behavioural timing
      var elapsed = performance.now() - t0;
      var gaps = [];
      for (var i = 1; i < timeoutStamps.length; i++) gaps.push(+(timeoutStamps[i] - timeoutStamps[i - 1]).toFixed(1));
      var medGap = gaps.slice().sort(function (a, b) { return a - b; })[Math.floor(gaps.length / 2)] || 0;
      rec('H5-rafAlive', 'stealth', 'visibilityState claims "visible" — requestAnimationFrame must actually be ticking',
        (rafTicks > 3) ? 'PASS' : 'FAIL',
        'rafTicks=' + rafTicks + ' over ' + elapsed.toFixed(0) + 'ms (first=' + J(rafFirst) + ' last=' + J(rafLast) + ')', { rafTicks: rafTicks, elapsed: elapsed });
      rec('H6-timerClamp', 'stealth', 'visibilityState claims "visible" — setTimeout(0) must not be clamped to ~1000ms (background throttling)',
        (medGap < 100) ? 'PASS' : 'FAIL', 'medianGap=' + medGap + 'ms samples=' + J(gaps), { medGap: medGap, gaps: gaps });
    }

    // ---- summary
    var summary = { pass: 0, fail: 0, info: 0, stealthFail: 0, functionFail: 0 };
    RESULTS.forEach(function (r) {
      if (r.verdict === 'PASS') summary.pass++;
      else if (r.verdict === 'FAIL') { summary.fail++; if (r.cls === 'stealth') summary.stealthFail++; else if (r.cls === 'function') summary.functionFail++; }
      else summary.info++;
    });
    var failIds = RESULTS.filter(function (r) { return r.verdict === 'FAIL'; }).map(function (r) { return r.id; });

    var out = {
      schema: 'anti-blur-testbench/1',
      finalisedAt: tag,
      href: location.href,
      ua: navigator.userAgent,
      summary: summary,
      failIds: failIds,
      values: vals,
      fingerprints: {
        documentOwnProps: docOwn,
        documentPrototypeKeys: docProtoKeys,
        documentPrototypeKeysHash: hash(docProtoKeys.join('|')),
        functionPrototypeKeys: funcProtoKeys,
        functionPrototypeKeysHash: hash(funcProtoKeys.join('|'))
      },
      frames: frameRows,
      probes: RESULTS
    };
    var json = JSON.stringify(out, null, 1);
    preEl.textContent = json;
    document.title = 'ABT|pass=' + summary.pass + '|fail=' + summary.fail + '|stealthFail=' + summary.stealthFail +
      '|funcFail=' + summary.functionFail + '|info=' + summary.info + '|done=' + tag;
    statusEl.textContent = 'done (' + tag + ') pass=' + summary.pass + ' fail=' + summary.fail;

    // Optional result exfil for HEADFUL runs, where --dump-dom is unavailable.
    // Inert unless the page is loaded with ?run=<label>&collect=<port>.
    var qs = {};
    location.search.slice(1).split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('='); qs[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    if (qs.run) {
      // fetch(), not sendBeacon(): the payload is well over sendBeacon's 64 KiB quota.
      // mode:'no-cors' + text/plain keeps it a "simple request" so there is no preflight.
      safe(function () {
        return fetch('http://127.0.0.1:' + (qs.collect || '8732') + '/collect?run=' +
          encodeURIComponent(qs.run) + '&tag=' + tag,
          { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: json })
          .catch(function () { });
      });
    }
  }

  setTimeout(function () { finalise('t1200'); }, 1200);
  setTimeout(function () { finalise('t2600'); }, 2600);
  setTimeout(function () { finalise('t4200'); }, 4200);
})();
