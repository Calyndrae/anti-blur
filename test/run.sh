#!/bin/zsh
# ============================================================================
# Anti Blur adversarial test bench — control vs extension, in real Chrome.
#
#   ./run.sh                 # both passes + diff
#   ./run.sh --dump-dom-only # control pass only, via --dump-dom (no extension)
#
# WHY THE CDP DRIVER: branded Google Chrome >= 137 hard-rejects --load-extension
# ("--load-extension is not allowed in Google Chrome, ignoring." —
# chrome/browser/extensions/extension_service.cc). The supported automation
# path is the CDP command Extensions.loadUnpacked behind
# --enable-unsafe-extension-debugging, which is what cdp_driver.py does.
#
# Results land in ./out/ as collected-control.json / collected-ext.json.
# ============================================================================
set -e
HERE="${0:A:h}"
EXT="${HERE:h}"
PORT=8731
COLLECT=8732
OUT="$HERE/out"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"

cleanup() {
  [[ -n "$HTTPD_PID" ]] && kill "$HTTPD_PID" 2>/dev/null
  [[ -n "$COLL_PID"  ]] && kill "$COLL_PID"  2>/dev/null
}
trap cleanup EXIT INT TERM

# static server for the page
(cd "$HERE" && python3 -m http.server $PORT --bind 127.0.0.1 >"$OUT/httpd.log" 2>&1) &
HTTPD_PID=$!
# result sink: the page POSTs its JSON here (headful/CDP runs cannot use --dump-dom)
python3 "$HERE/collector.py" $COLLECT "$OUT" >"$OUT/collector.log" 2>&1 &
COLL_PID=$!
perl -e 'select(undef,undef,undef,1)'

if [[ "$1" == "--dump-dom-only" ]]; then
  UD="$(mktemp -d)"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=9000 \
    --user-data-dir="$UD" --no-first-run --no-default-browser-check \
    --dump-dom "http://127.0.0.1:$PORT/index.html" > "$OUT/control.dom.html" 2>/dev/null &
  p=$!; for i in $(seq 1 40); do kill -0 $p 2>/dev/null || break; perl -e 'select(undef,undef,undef,1)'; done
  kill -9 $p 2>/dev/null
  grep -o '<title>[^<]*</title>' "$OUT/control.dom.html"
  echo "DOM written to $OUT/control.dom.html"
  exit 0
fi

echo "== CONTROL (no extension) =="
python3 "$HERE/cdp_driver.py" - \
  "http://127.0.0.1:$PORT/index.html?run=control&collect=$COLLECT" "$OUT/collected-control.json"

echo "== EXTENSION ($EXT) =="
python3 "$HERE/cdp_driver.py" "$EXT" \
  "http://127.0.0.1:$PORT/index.html?run=ext&collect=$COLLECT" "$OUT/collected-ext.json"

echo
python3 - "$OUT/collected-control.json" "$OUT/collected-ext.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1])); e = json.load(open(sys.argv[2]))
cp = {p['id']: p for p in c['probes']}
print('control:', c['summary']); print('extension:', e['summary']); print()
print('%-46s %-9s %-6s %-6s' % ('PROBE', 'CLASS', 'CTRL', 'EXT'))
print('-' * 72)
for p in e['probes']:
    cv = cp.get(p['id'], {}).get('verdict', '-')
    mark = '  <<<' if cv != p['verdict'] else ''
    print('%-46s %-9s %-6s %-6s%s' % (p['id'][:46], p['cls'], cv, p['verdict'], mark))
print()
print('LEAKS (stealth probes that fail only with the extension loaded):')
for p in e['probes']:
    if p['cls'] == 'stealth' and p['verdict'] == 'FAIL':
        print('  * %-42s %s' % (p['id'], p['detail'].replace('\n', ' | ')[:150]))
PY
