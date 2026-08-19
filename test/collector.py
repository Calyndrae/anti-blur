import http.server, os, sys, urllib.parse
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp'
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        run = (q.get('run') or ['unknown'])[0]
        tag = (q.get('tag') or ['?'])[0]
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n)
        path = os.path.join(OUT, 'collected-%s.json' % run.replace('/', '_'))
        with open(path, 'wb') as f: f.write(body)
        sys.stderr.write('COLLECTED run=%s tag=%s bytes=%d -> %s\n' % (run, tag, len(body), path)); sys.stderr.flush()
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
