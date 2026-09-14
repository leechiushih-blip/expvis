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
// Evaluate the generated experiment against a stub of the jsPsych surface it
// expects. This is the only way to assert its SHAPE rather than its bytes: that
// every phase became one node pushed in canvas order, that each node collects
// the trials the canvas shows, and that no node carries a node-level parameter
// ExpVis no longer supports. A syntax error in the generated code throws here.
var __PLUGINS = ['jsPsychHtmlKeyboardResponse', 'jsPsychHtmlButtonResponse',
  'jsPsychHtmlSliderResponse', 'jsPsychSurveyText', 'jsPsychPreload', 'jsPsychAnimation',
  'jsPsychImageKeyboardResponse', 'jsPsychImageButtonResponse', 'jsPsychImageSliderResponse'];
var __FORBIDDEN = ['timeline_variables', 'repetitions', 'sample', 'conditional_function',
  'randomize_order', 'loop_function'];
function inspectStructure(code) {
  var stub = {
    run: function (tl) { stub._timeline = tl; },
    data: {displayData: function () {}},
    randomization: {sampleWithoutReplacement: function (a, n) { return a.slice(0, n); }},
    pluginAPI: {compareKeys: function () { return false; }},
    timelineVariable: function (n) { return '__TV__' + n; }
  };
  var src = 'var initJsPsych = function () { return __stub; };\\nvar jsPsych = __stub;\\n' +
    __PLUGINS.map(function (p) { return 'var ' + p + ' = {};'; }).join('\\n') + '\\n' + code;
  new Function('__stub', src)(stub);
  var tl = stub._timeline || [];
  var forbidden = [];
  JSON.stringify(tl, function (k, v) {
    if (__FORBIDDEN.indexOf(k) >= 0 && forbidden.indexOf(k) < 0) forbidden.push(k);
    return v;
  });
  return {
    // one entry per phase node; the number is how many trials it collects
    trialsPerNode: tl.map(function (n) { return n && n.timeline ? n.timeline.length : null; }),
    forbiddenParams: forbidden
  };
}

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
          // Structural facts, independent of the exact bytes. Regexes over the
          // generated text were tried first and were worse than useless — they
          // cannot tell a node from a trial, and they tripped over nested
          // brackets. Evaluating the code is exact.
          // Inspect the experiment JS itself, not the HTML shell around it.
          structure: inspectStructure(_compileExperiment({}).code)
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
    broken = []
    for name, t in res["templates"].items():
        struct = t["structure"]
        # Invariants that must hold whatever the bytes are.
        if struct["forbiddenParams"]:
            broken.append(f"{name}: node-level parameter(s) {struct['forbiddenParams']}")
        if any(n is None or n == 0 for n in struct["trialsPerNode"]):
            broken.append(f"{name}: a phase node collects no trials ({struct['trialsPerNode']})")
        if not t.get("publishedMatches"):
            broken.append(f"{name}: publish != export")

        path = os.path.join(GOLDEN, name + ".html")
        if not os.path.exists(path):
            print(f"  ?? {name}: no baseline")
            continue
        want = open(path).read()
        same = want == t["code"]
        if not same:
            bad += 1
        print(f"  {'OK  ' if same else 'DIFF'} {name:16s} "
              f"{len(want)} -> {len(t['code'])} chars   "
              f"phases={struct['trialsPerNode']}")
    if broken:
        print()
        for b in broken:
            print("  !! " + b)
        sys.exit(f"{len(broken)} structural problem(s)")
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
