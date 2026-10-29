#!/usr/bin/env python3
"""Functional proof, as opposed to the stealth bench.

probes.js runs in a page that is focused and visible, so it can show that the
overrides are *undetectable* but never that they *do anything*. This script
forces the page into a genuinely hidden/blurred state over CDP and reads the
state back, with and without the extension. Without it the page must admit it
is hidden; with it the page must keep claiming it is visible and focused.

    python3 verify_function.py            # both runs + verdict
"""
import json, os, subprocess, sys, tempfile, time
from cdp_driver import WS, http_json, CHROME

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)

# Installed before the page is backgrounded; reports what the page perceived.
SETUP = r"""
(() => {
  window.__seen = { visibilitychange: 0, blur: 0, pagehide: 0, freeze: 0, resume: 0,
                    elBlur: 0, elFocusout: 0, elFocus: 0, elFocusin: 0 };
  document.addEventListener('visibilitychange', () => window.__seen.visibilitychange++);
  window.addEventListener('blur', e => { if (e.target === window) window.__seen.blur++; });
  window.addEventListener('pagehide', () => { window.__seen.pagehide++; sessionStorage.setItem('pagehide', '1'); });
  document.addEventListener('freeze', () => window.__seen.freeze++);
  document.addEventListener('resume', () => window.__seen.resume++);
  for (const id of ['a', 'b']) {
    const el = document.createElement('input'); el.id = id; document.body.appendChild(el);
  }
  const a = document.getElementById('a');
  a.addEventListener('blur', () => window.__seen.elBlur++);
  a.addEventListener('focusout', () => window.__seen.elFocusout++);
  a.addEventListener('focus', () => window.__seen.elFocus++);
  a.addEventListener('focusin', () => window.__seen.elFocusin++);
  a.focus();
  // A frame loop started WHILE VISIBLE: its next callback is already queued
  // natively when the tab hides, which is the case that used to stall.
  window.__frames = 0;
  (function loop() { window.__frames++; requestAnimationFrame(loop); })();
  return 'armed';
})()
"""

READ = r"""
JSON.stringify({
  hasFocus: document.hasFocus(),
  hidden: document.hidden,
  visibilityState: document.visibilityState,
  frames: window.__frames,
  seen: window.__seen
})
"""

HIDDEN_FOR = 4.0   # seconds; at ~1 timer wake-up a second this is a handful of frames


def run(with_ext, port):
    ud = tempfile.mkdtemp(prefix="abv-")
    args = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--user-data-dir=" + ud, "--no-first-run", "--no-default-browser-check",
            "--disable-search-engine-choice-screen",
            "--remote-debugging-port=%d" % port, "--enable-unsafe-extension-debugging",
            "--remote-allow-origins=*", "--window-size=1100,800", "about:blank"]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = {"extension": bool(with_ext)}
    try:
        ver = None
        for _ in range(60):
            try:
                ver = http_json("http://127.0.0.1:%d/json/version" % port); break
            except Exception:
                time.sleep(0.4)
        if not ver:
            raise RuntimeError("devtools endpoint never came up")
        ws = WS(ver["webSocketDebuggerUrl"])
        if with_ext:
            ws.call("Extensions.loadUnpacked", {"path": EXT})
            time.sleep(1.5)

        tgt = ws.call("Target.createTarget", {"url": "http://127.0.0.1:8731/blank.html"})
        tid = tgt["targetId"]
        sess = ws.call("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        time.sleep(1.5)
        ws.call("Page.bringToFront", session=sess)

        ev = lambda expr: ws.call("Runtime.evaluate",
                                  {"expression": expr, "returnByValue": True},
                                  session=sess)["result"].get("value")
        out["armed"] = ev(SETUP)
        time.sleep(0.3)
        out["before"] = json.loads(ev(READ))

        # Force the page out of view. Preferred: the direct CDP override.
        # Fallback: open another tab in front of it — which is also what a
        # person does, and the only one that blurs the window as well.
        try:
            ws.call("Emulation.setPageVisibilityState", {"visibility": "hidden"}, session=sess)
            out["method"] = "Emulation.setPageVisibilityState"
        except Exception as e:
            out["method"] = "second-tab (setPageVisibilityState unavailable: %s)" % str(e)[:80]
            other = ws.call("Target.createTarget", {"url": "about:blank"})["targetId"]
            osess = ws.call("Target.attachToTarget", {"targetId": other, "flatten": True})["sessionId"]
            ws.call("Page.bringToFront", session=osess)
        # A frame can still land during the switch itself, so the count starts
        # a second after the page has gone, not at the moment it was asked to.
        time.sleep(1.0)
        out["hidden_at"] = json.loads(ev(READ))["frames"]
        time.sleep(HIDDEN_FOR)
        out["after"] = json.loads(ev(READ))

        # Frozen and thawed while hidden: both halves must reach the page.
        try:
            ws.call("Page.setWebLifecycleState", {"state": "frozen"}, session=sess)
            time.sleep(0.5)
            ws.call("Page.setWebLifecycleState", {"state": "active"}, session=sess)
            time.sleep(0.5)
        except Exception as e:
            out["lifecycle_error"] = str(e)[:120]

        # Back in front: the element's return pair is what the page sees now.
        ws.call("Page.bringToFront", session=sess)
        time.sleep(0.8)
        out["back"] = json.loads(ev(READ))

        # Focus genuinely moving inside the page must be delivered untouched.
        ev("window.__seen.elBlur = window.__seen.elFocusout = 0;"
           "document.getElementById('b').focus(); 'moved'")
        time.sleep(0.3)
        out["moved"] = json.loads(ev(READ))["seen"]

        # pagehide on navigation: the page records it in sessionStorage, read
        # back on the next page of the same origin.
        ws.call("Page.navigate", {"url": "http://127.0.0.1:8731/blank.html?next"}, session=sess)
        time.sleep(1.2)
        out["pagehide"] = ev("sessionStorage.getItem('pagehide')")

        # Off for this site: the page must be told the truth again.
        if with_ext:
            sw = next((t for t in ws.call("Target.getTargets")["targetInfos"]
                       if t["type"] == "service_worker" and t["url"].endswith("/background.js")), None)
            if not sw:
                out["site_off"] = "no service worker"
            else:
                swsess = ws.call("Target.attachToTarget", {"targetId": sw["targetId"], "flatten": True})["sessionId"]
                sw_eval = lambda expr: ws.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True,
                                                                     "returnByValue": True}, session=swsess)["result"]
                sw_eval("antiBlur.setOff('127.0.0.1', true)")
                t2 = ws.call("Target.createTarget", {"url": "http://127.0.0.1:8731/blank.html?off"})["targetId"]
                s2 = ws.call("Target.attachToTarget", {"targetId": t2, "flatten": True})["sessionId"]
                time.sleep(1.2)
                other2 = ws.call("Target.createTarget", {"url": "about:blank"})["targetId"]
                o2 = ws.call("Target.attachToTarget", {"targetId": other2, "flatten": True})["sessionId"]
                ws.call("Page.bringToFront", session=o2)
                time.sleep(1.0)
                out["site_off"] = ws.call("Runtime.evaluate", {"expression": "document.visibilityState",
                                                              "returnByValue": True}, session=s2)["result"].get("value")
                sw_eval("antiBlur.setOff('127.0.0.1', false)")
    except Exception as e:
        out["error"] = "%s: %s" % (type(e).__name__, e)
    finally:
        proc.kill(); proc.wait()
    return out


def main():
    httpd = subprocess.Popen([sys.executable, "-m", "http.server", "8731", "--bind", "127.0.0.1"],
                             cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    try:
        control = run(False, 9401)
        ext = run(True, 9402)
    finally:
        httpd.kill(); httpd.wait()

    print("hiding method:", control.get("method"), "|", ext.get("method"))
    for name, r in (("CONTROL (no extension)", control), ("EXTENSION", ext)):
        print("\n== %s ==" % name)
        if "error" in r:
            print("  ERROR:", r["error"]); continue
        for phase in ("before", "after", "back"):
            print("  %-6s %s" % (phase, json.dumps(r[phase])))
        print("  moved  %s" % json.dumps(r["moved"]))
        print("  pagehide=%s%s" % (r.get("pagehide"),
              ("  site_off=%s" % r["site_off"]) if "site_off" in r else ""))

    print("\n---- verdict ----")
    if "error" in control or "error" in ext:
        print("INCONCLUSIVE — a run errored; see above."); return 2
    ca, ea = control["after"], ext["after"]
    if ca["visibilityState"] != "hidden" and ca["hidden"] is not True:
        print("INCONCLUSIVE — the control page never actually went hidden, so this")
        print("run cannot discriminate. Control after:", json.dumps(ca))
        return 2

    def frames_while_hidden(r):
        return r["after"]["frames"] - r["hidden_at"]

    cb, eb = control["back"]["seen"], ext["back"]["seen"]
    checks = [
        ("page told it is visible and focused",
         ea["visibilityState"] == "visible" and ea["hidden"] is False and ea["hasFocus"] is True),
        ("visibilitychange / window blur not delivered",
         ea["seen"]["visibilitychange"] == 0 and ea["seen"]["blur"] == 0),
        ("frame loop keeps running while hidden (control %d, ext %d)"
         % (frames_while_hidden(control), frames_while_hidden(ext)),
         frames_while_hidden(control) == 0 and frames_while_hidden(ext) >= 2),
        ("focused input: leaving not delivered (control %d, ext %d)"
         % (cb["elBlur"] + cb["elFocusout"], eb["elBlur"] + eb["elFocusout"]),
         cb["elBlur"] + cb["elFocusout"] == 2 and eb["elBlur"] + eb["elFocusout"] == 0),
        ("focused input: return not delivered (control %d, ext %d)"
         % (cb["elFocus"] + cb["elFocusin"], eb["elFocus"] + eb["elFocusin"]),
         eb["elFocus"] + eb["elFocusin"] == cb["elFocus"] + cb["elFocusin"] - 2),
        ("focus moving to another input is delivered (control %d, ext %d)"
         % (control["moved"]["elBlur"] + control["moved"]["elFocusout"],
            ext["moved"]["elBlur"] + ext["moved"]["elFocusout"]),
         ext["moved"]["elBlur"] + ext["moved"]["elFocusout"] == 2
         and control["moved"]["elBlur"] + control["moved"]["elFocusout"] == 2),
        ("freeze and resume both delivered (control %d/%d, ext %d/%d)"
         % (cb["freeze"], cb["resume"], eb["freeze"], eb["resume"]),
         (eb["freeze"], eb["resume"]) == (cb["freeze"], cb["resume"])),
        ("pagehide delivered on navigation", ext.get("pagehide") == "1" and control.get("pagehide") == "1"),
        ("off for this site: page sees the truth (%s)" % ext.get("site_off"), ext.get("site_off") == "hidden"),
    ]
    for label, ok in checks:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
    ok = all(ok for _, ok in checks)
    print("\n%s" % ("PASS — every behaviour holds." if ok else "FAIL — see above."))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
