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
  window.__seen = { visibilitychange: 0, blur: 0, pagehide: 0 };
  document.addEventListener('visibilitychange', () => window.__seen.visibilitychange++);
  window.addEventListener('blur', e => { if (e.target === window) window.__seen.blur++; });
  window.addEventListener('pagehide', () => window.__seen.pagehide++);
  return 'armed';
})()
"""

READ = r"""
JSON.stringify({
  hasFocus: document.hasFocus(),
  hidden: document.hidden,
  visibilityState: document.visibilityState,
  seen: window.__seen
})
"""


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

        ev = lambda expr: ws.call("Runtime.evaluate",
                                  {"expression": expr, "returnByValue": True},
                                  session=sess)["result"].get("value")
        out["armed"] = ev(SETUP)
        out["before"] = json.loads(ev(READ))

        # Force the page out of view. Preferred: the direct CDP override.
        # Fallback: open another tab in front of it.
        try:
            ws.call("Emulation.setPageVisibilityState", {"visibility": "hidden"}, session=sess)
            out["method"] = "Emulation.setPageVisibilityState"
        except Exception as e:
            out["method"] = "second-tab (setPageVisibilityState unavailable: %s)" % str(e)[:80]
            other = ws.call("Target.createTarget", {"url": "about:blank"})["targetId"]
            osess = ws.call("Target.attachToTarget", {"targetId": other, "flatten": True})["sessionId"]
            ws.call("Page.bringToFront", session=osess)
        time.sleep(1.5)

        out["after"] = json.loads(ev(READ))
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
        for phase in ("before", "after"):
            print("  %-6s %s" % (phase, json.dumps(r[phase])))

    print("\n---- verdict ----")
    if "error" in control or "error" in ext:
        print("INCONCLUSIVE — a run errored; see above."); return 2
    ca, ea = control["after"], ext["after"]
    if ca["visibilityState"] != "hidden" and ca["hidden"] is not True:
        print("INCONCLUSIVE — the control page never actually went hidden, so this")
        print("run cannot discriminate. Control after:", json.dumps(ca))
        return 2
    ok = (ea["visibilityState"] == "visible" and ea["hidden"] is False
          and ea["seen"]["visibilitychange"] == 0)
    print("control  went hidden : %s (visibilitychange fired %dx)"
          % (ca["visibilityState"], ca["seen"]["visibilitychange"]))
    print("extension held state : %s (visibilitychange fired %dx)"
          % (ea["visibilityState"], ea["seen"]["visibilitychange"]))
    print("\n%s" % ("PASS — the spoof works and the event was suppressed."
                    if ok else "FAIL — the extension did not hold the state."))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
