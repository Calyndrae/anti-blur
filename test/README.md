# Detection test bench

Two harnesses, answering two different questions. Both drive real Chrome — not
jsdom — and both compare a run **with** the extension against a control run
**without** it.

| | Question | Command |
| --- | --- | --- |
| `run.sh` | Can a website *detect* the extension? | `./run.sh` |
| `verify_function.py` | Does the spoof actually *work*? | `python3 verify_function.py` |

You need both. `run.sh` serves a page that is focused and visible, so it can
prove the overrides are indistinguishable from natives but can never show they
do anything. `verify_function.py` forces the page into a genuinely backgrounded
state and reads the result back.

## Why CDP instead of `--load-extension`

Branded Google Chrome ≥137 hard-rejects `--load-extension`. `cdp_driver.py`
launches Chrome with `--enable-unsafe-extension-debugging` and loads the
unpacked extension over the DevTools Protocol (`Extensions.loadUnpacked`).

## Layout

- `index.html` / `probes.js` — ~96 probes: value spoofing, `toString` and
  descriptor camouflage, own-property tells, brand checks, detached documents,
  event suppression, realm escapes through twelve kinds of iframe, multi-frame
  focus contradiction, timer and rAF behaviour.
- `frameprobe.js` — runs inside each child frame and reports back.
- `collector.py` — sink the page POSTs its JSON results to.
- `out/collected-{control,ext}.json` — raw results from the last run.

## Reading the output

Probes are classed `function` (does it work), `stealth` (is it undetectable) or
`info` (recorded, not judged). The summary line to watch is `stealthFail`, which
should be **0**: every stealth probe must produce the same answer with and
without the extension loaded.

One known-bad row: `G:window-capture-beats-doc-guard` fails in the control run
too, so it is measuring its own expectation wrongly rather than finding a defect.

## A caveat on shape-based probes

`patched` used to be inferred from "does this function look non-native" — an own
`prototype`, a missing brand check, swallowed synthetic events. Once those were
fixed the heuristic started calling patched realms pristine. The probes now
decide by escape *contradiction*: read the top document through the other
realm's natives and see whether the answer disagrees with what the top document
claims. From inside an opaque sandboxed frame the honest answer is `INFO` —
unknown — and that is what it reports.
