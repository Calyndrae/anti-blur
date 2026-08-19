/* Single source of truth for the in-frame self-report.
 *
 * Loaded two ways:
 *   - <script src="frameprobe.js"> from blank.html (works even in an opaque-origin
 *     sandboxed http frame, where the parent cannot reach in to inject anything);
 *   - fetched as text by probes.js and inlined into srcdoc / data: / blob: frames,
 *     which cannot resolve a relative script URL.
 *
 * Frame identity comes from window.__ABT_ID, else location.hash.
 */
(function () {
  var ID = (typeof window.__ABT_ID === 'string' && window.__ABT_ID) ||
    (location.hash ? decodeURIComponent(location.hash.slice(1)) : '');
  if (!ID) return;

  var out = {};
  function t(k, f) { try { out[k] = f(); } catch (e) { out[k] = 'ERR:' + (e && e.name) + ':' + (e && e.message); } }

  t('href', function () { return String(location.href).slice(0, 90); });
  t('origin', function () { try { return String(document.origin || location.origin); } catch (e) { return 'opaque'; } });
  t('hasFocus', function () { return document.hasFocus(); });
  t('hidden', function () { return document.hidden; });
  t('visibilityState', function () { return document.visibilityState; });

  var dF = null, dH = null;
  t('descPresent', function () {
    dF = Object.getOwnPropertyDescriptor(Document.prototype, 'hasFocus');
    dH = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    return !!(dF && dH);
  });
  t('hasFocusStr', function () { return Function.prototype.toString.call(dF.value); });
  t('hasFocusOwn', function () { return Object.getOwnPropertyNames(dF.value).join(','); });
  t('hasFocusHasPrototype', function () { return Object.prototype.hasOwnProperty.call(dF.value, 'prototype'); });
  t('hiddenGetStr', function () { return Function.prototype.toString.call(dH.get); });
  t('hiddenGetHasPrototype', function () { return Object.prototype.hasOwnProperty.call(dH.get, 'prototype'); });
  t('brandThrows', function () { try { dH.get.call({}); return false; } catch (e) { return true; } });
  t('ftsStr', function () { return Function.prototype.toString.call(Function.prototype.toString); });
  t('ftsExtStack', function () {
    try { Function.prototype.toString.call(void 0); return 'no-throw'; }
    catch (e) { return /chrome-extension/.test(String(e.stack || '')) ? 'LEAK' : 'clean'; }
  });
  t('detachedHidden', function () { return document.implementation.createHTMLDocument('x').hidden; });
  t('synthVisFires', function () {
    var f = false;
    document.addEventListener('visibilitychange', function () { f = true; });
    document.dispatchEvent(new Event('visibilitychange'));
    return f;
  });
  t('synthBlurFires', function () {
    var f = false;
    window.addEventListener('blur', function () { f = true; });
    window.dispatchEvent(new Event('blur'));
    return f;
  });

  // Shape alone no longer settles this: a well-camouflaged fake has no own
  // `prototype`, brand-checks like the native, and lets synthetic events
  // through. Report the raw facts and let the parent decide by escape
  // contradiction; from inside an opaque frame the answer is honestly unknown.
  out.patched = null;
  try { parent.postMessage({ __abt: 1, id: ID, r: out }, '*'); } catch (e) { }
})();
