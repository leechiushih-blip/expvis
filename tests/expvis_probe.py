#!/usr/bin/env python3
"""Headless-Chrome probe for the ExpVis editor.

The editor is one big file with no test suite, so every verification in this
project has been "open it in a browser and assert something". This script makes
that repeatable, which a refactor of the data model needs: stage 1 must produce
byte-identical output to what came before.

    tests/expvis_probe.py save            # capture tests/golden/*.html
    tests/expvis_probe.py check           # compare against them
    tests/expvis_probe.py dump stroop     # print one template's output
"""

import html
import json
import os
import re
import subprocess
import sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = os.path.join(ROOT, "tests", "golden")
TEMPLATES = ["stroop", "simon", "flanker", "branch-demo", "randomize-demo"]

# Injected into the editor page. Runs each template, generates code, and leaves
# the result in a <pre id="PROBE_OUT"> for --dump-dom to pick up.
PROBE = """
<script>
window.addEventListener('load', function () {
  var out = { ok: true, templates: {}, errors: [] };
  window.addEventListener('error', function (e) { out.errors.push(String(e.message)); });
  try {
    localStorage.clear();
    %(templates)s.forEach(function (name) {
      try {
        loadTemplate(name);
        if (editor.device == null) editor.device = {name: 'Desktop', icon: '', w: 1280, h: 720};
        var code = generateCode();
        out.templates[name] = {
          code: code,
          publishedMatches: generatePublishedFile() === code,
          // structural facts, independent of the exact bytes
          nodeNames: (code.match(/var (\\w+) = \\{/g) || []).length,
          nestedTimelines: (code.match(/timeline: \\[/g) || []).length,
          repetitions: (code.match(/repetitions:/g) || []).length,
          conditional: (code.match(/conditional_function/g) || []).length,
          timelineVars: (code.match(/timeline_variables/g) || []).length
        };
      } catch (e) {
        out.ok = false;
        out.templates[name] = { error: String(e.message) + ' @ ' + String(e.stack).split('\\n')[1] };
      }
    });
  } catch (e) {
    out.ok = false;
    out.errors.push('FATAL ' + e.message);
  }
  var pre = document.createElement('pre');
  pre.id = 'PROBE_OUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>
""" % {"templates": json.dumps(TEMPLATES)}


def run_probe():
    src = open(os.path.join(ROOT, "index.html")).read()
    probe_path = os.path.join(ROOT, "_probe.html")
    with open(probe_path, "w") as fh:
        fh.write(src.replace("</body>", PROBE + "</body>"))
    try:
        dom = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--virtual-time-budget=15000", "--dump-dom",
             "file://" + probe_path.replace(" ", "%20")],
            capture_output=True, text=True, timeout=120,
        ).stdout
    finally:
        os.remove(probe_path)
    m = re.search(r'<pre id="PROBE_OUT">(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit("probe produced no output — the editor probably failed to load")
    return json.loads(html.unescape(m.group(1)))


def cmd_save():
    res = run_probe()
    if not res["ok"]:
        print(json.dumps(res, indent=1)[:2000])
        sys.exit("refusing to save a baseline from a failing run")
    os.makedirs(GOLDEN, exist_ok=True)
    for name, t in res["templates"].items():
        with open(os.path.join(GOLDEN, name + ".html"), "w") as fh:
            fh.write(t["code"])
    print(f"saved {len(res['templates'])} templates to tests/golden/")
    for name, t in res["templates"].items():
        print(f"  {name:16s} {len(t['code']):>6} chars   publish parity={t['publishedMatches']}")


def cmd_check():
    res = run_probe()
    if not res["ok"]:
        print(json.dumps(res, indent=1)[:2000])
        sys.exit("FAIL: the probe itself errored")
    bad = 0
    for name, t in res["templates"].items():
        path = os.path.join(GOLDEN, name + ".html")
        if not os.path.exists(path):
            print(f"  ?? {name}: no baseline")
            continue
        want = open(path).read()
        same = want == t["code"]
        if not same:
            bad += 1
        print(f"  {'OK  ' if same else 'DIFF'} {name:16s} "
              f"{len(want)} -> {len(t['code'])} chars"
              + ("" if t.get("publishedMatches") else "   !! publish != export"))
    sys.exit(f"{bad} template(s) differ from the baseline" if bad else None)


def cmd_dump(name):
    res = run_probe()
    t = res["templates"].get(name)
    if not t:
        sys.exit(f"no such template: {name}")
    print(t.get("code") or t.get("error"))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "save":
        cmd_save()
    elif cmd == "check":
        cmd_check()
    elif cmd == "dump":
        cmd_dump(sys.argv[2] if len(sys.argv) > 2 else "stroop")
    else:
        sys.exit(__doc__)
