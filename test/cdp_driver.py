#!/usr/bin/env python3
"""Minimal stdlib CDP driver.

Chrome 137+ (branded) hard-blocks --load-extension. The supported automation
replacement is the CDP `Extensions.loadUnpacked` command behind
--enable-unsafe-extension-debugging. This script:
  1. launches Chrome with a throwaway profile + remote debugging,
  2. loads the unpacked extension over CDP (optional),
  3. opens the test page,
  4. waits for the page to POST its JSON to the collector,
  5. kills Chrome.
"""
import base64, json, os, socket, struct, subprocess, sys, tempfile, time, urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class WS:
    def __init__(self, url, timeout=30):
        assert url.startswith("ws://"), url
        hostport, _, path = url[5:].partition("/")
        host, _, port = hostport.partition(":")
        self.s = socket.create_connection((host, int(port)), timeout=timeout)
        self.s.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((
            "GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key)
        ).encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.s.recv(4096)
            if not chunk:
                raise EOFError("handshake failed")
            buf += chunk
        head, self.buf = buf.split(b"\r\n\r\n", 1)
        if b"101" not in head.split(b"\r\n")[0]:
            raise RuntimeError("bad handshake: %r" % head[:200])
        self._id = 0

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(1 << 16)
            if not chunk:
                raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        payload = text.encode()
        n = len(payload)
        hdr = bytearray([0x81])
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
        else:
            hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
        mask = os.urandom(4)
        hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def recv(self):
        acc = b""
        while True:
            b0, b1 = self._read(2)
            fin, op, masked, n = b0 & 0x80, b0 & 0x0F, b1 & 0x80, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            mk = self._read(4) if masked else None
            data = self._read(n)
            if mk:
                data = bytes(b ^ mk[i % 4] for i, b in enumerate(data))
            if op == 8:
                raise EOFError("ws closed")
            if op in (9, 10):
                continue
            acc += data
            if fin:
                return acc.decode("utf-8", "replace")

    def call(self, method, params=None, session=None, timeout=25):
        self._id += 1
        mid = self._id
        msg = {"id": mid, "method": method}
        if params:
            msg["params"] = params
        if session:
            msg["sessionId"] = session
        self.send(json.dumps(msg))
        deadline = time.time() + timeout
        while time.time() < deadline:
            m = json.loads(self.recv())
            if m.get("id") == mid:
                if "error" in m:
                    raise RuntimeError("%s -> %s" % (method, m["error"]))
                return m.get("result", {})
        raise TimeoutError(method)


def http_json(url, method="GET", timeout=10):
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode()
    return json.loads(body) if body.strip().startswith(("{", "[")) else body


def main():
    ext = sys.argv[1] if sys.argv[1] != "-" else None
    page_url = sys.argv[2]
    outfile = sys.argv[3]
    headless = "--headful" not in sys.argv
    port = 9333 + (0 if ext else 1)

    if os.path.exists(outfile):
        os.remove(outfile)
    ud = tempfile.mkdtemp(prefix="abt-profile-")
    args = [CHROME, "--user-data-dir=" + ud, "--no-first-run", "--no-default-browser-check",
            "--disable-search-engine-choice-screen", "--disable-session-crashed-bubble",
            "--remote-debugging-port=%d" % port, "--enable-unsafe-extension-debugging",
            "--remote-allow-origins=*", "--window-size=1100,800",
            "--disable-features=Translate,MediaRouter,OptimizationHints",
            "about:blank"]
    if headless:
        args.insert(1, "--headless=new")
        args.insert(2, "--disable-gpu")
        args.insert(3, "--no-sandbox")
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    report = {"launched": True, "headless": headless, "extension": ext}
    try:
        ver = None
        for _ in range(60):
            try:
                ver = http_json("http://127.0.0.1:%d/json/version" % port)
                break
            except Exception:
                time.sleep(0.4)
        if not ver:
            raise RuntimeError("devtools endpoint never came up")
        report["browser"] = ver.get("Browser")
        ws = WS(ver["webSocketDebuggerUrl"])

        if ext:
            report["loadUnpacked"] = ws.call("Extensions.loadUnpacked", {"path": ext})
            # confirm the extension really is present as a target/host
            time.sleep(1.0)

        tgt = ws.call("Target.createTarget", {"url": page_url})
        report["targetId"] = tgt.get("targetId")

        deadline = time.time() + 45
        while time.time() < deadline:
            if os.path.exists(outfile) and os.path.getsize(outfile) > 1000:
                time.sleep(2.0)  # let the later finalise passes overwrite
                break
            time.sleep(0.5)
        report["collected"] = os.path.exists(outfile) and os.path.getsize(outfile) or 0

        try:
            report["targets"] = [
                {"type": t["type"], "url": t["url"][:80]}
                for t in ws.call("Target.getTargets")["targetInfos"]
            ]
        except Exception as e:
            report["targets_err"] = str(e)
    except Exception as e:
        report["error"] = "%s: %s" % (type(e).__name__, e)
    finally:
        proc.kill()
        proc.wait()
    print(json.dumps(report, indent=1)[:3000])


if __name__ == "__main__":
    main()
