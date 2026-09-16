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
// Node-level parameters ExpVis has no way to set at all, and so must never
// appear. Everything else a node can carry — timeline_variables, sample,
// randomize_order, repetitions — is now either derived from the canvas or set
// in the phase settings, and is asserted per case in phaseCases() instead of
// banned outright. `loop_function` in particular would need a function the GUI
// has nowhere to put, and `conditional_function` needs a condition it cannot
// express.
var __FORBIDDEN = ['conditional_function', 'loop_function'];
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

// Phase factoring (one procedure + a timeline_variables table) needs a phase
// whose trials are structurally identical, which none of the five built-in
// templates has — they are all heterogeneous or single-trial, so nothing in
// them exercises this path. These cases build one on the spot.
function phaseCases() {
  var out = {};
  function build(pid, spec) {
    return spec.map(function (v) {
      addTrial(pid);
      var t = findTrial(editor.selectedTrial);
      v.forEach(function (c) {
        addComponent(t.id, c[0], c[0] === 'keyboard' ? 'r' : 's');
        var comp = t.components[t.components.length - 1];
        Object.keys(c[1] || {}).forEach(function (k) { comp[k] = c[1][k]; });
      });
      return t;
    });
  }
  function run(label, spec) {
    resetEditor();
    addPhase('trials');
    build(editor.phases[0].id, spec);
    var code = _compileExperiment({}).code;
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      // a factored node holds the one procedure, not one entry per condition
      trialsPerNode: inspectStructure(code).trialsPerNode,
      forbiddenParams: inspectStructure(code).forbiddenParams
    };
  }
  // Two trials, same shape, different words and answers: one procedure.
  run('homogeneous', [
    [['text', {content: 'RED'}], ['keyboard', {choices: ['a'], correctKey: 'a'}]],
    [['text', {content: 'BLUE'}], ['keyboard', {choices: ['a'], correctKey: 'l'}]]
  ]);
  // Same shape as each other but a fixation opens each trial — the varying
  // value sits inside the node's own timeline, not at its top level.
  run('homogeneous+fixation', [
    [['fixation', {trial_duration: 500}], ['text', {content: 'RED'}]],
    [['fixation', {trial_duration: 500}], ['text', {content: 'BLUE'}]]
  ]);
  // Trials that differ in shape have no single procedure to hoist.
  run('ragged', [
    [['text', {content: 'RED'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'BLUE'}]]
  ]);
  // Identical trials: nothing varies, so there is no table to build.
  run('identical', [
    [['text', {content: 'SAME'}]],
    [['text', {content: 'SAME'}]]
  ]);
  // A single trial is not a variable table either.
  run('one trial', [[['text', {content: 'ONLY'}]]]);

  // Node-level parameters, set the way the phase settings dialog sets them.
  // `nodeParams` is the exact text emitted between `timeline` and the closing
  // brace, so the mapping from a control to a jsPsych parameter is pinned here
  // rather than being re-checked by hand in a browser.
  function runSampled(label, spec, phaseProps, perTrial) {
    resetEditor();
    addPhase('trials');
    var made = build(editor.phases[0].id, spec);
    // Per-condition fields (group, weight) belong on the trials the editor
    // made, not on the spec they were built from.
    (perTrial || []).forEach(function (props, i) {
      Object.keys(props).forEach(function (k) { made[i][k] = props[k]; });
    });
    Object.keys(phaseProps).forEach(function (k) { editor.phases[0][k] = phaseProps[k]; });
    var code = _compileExperiment({}).code;
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      nodeParams: (code.match(/^  (?:sample|randomize_order|repetitions):.*$/gm) || [])
        .map(function (s) { return s.trim().replace(/,$/, ''); }),
      trialsPerNode: inspectStructure(code).trialsPerNode,
      forbiddenParams: inspectStructure(code).forbiddenParams
    };
  }
  function cond(word) {
    return [['text', {content: word}], ['keyboard', {choices: ['a'], correctKey: 'a'}]];
  }
  var three = [cond('A'), cond('B'), cond('C')];

  runSampled('sample without-replacement', three,
    {sample: {type: 'without-replacement', size: 2}});
  runSampled('sample with-replacement', three,
    {sample: {type: 'with-replacement', size: 1}});
  runSampled('sample fixed-repetitions', three,
    {sample: {type: 'fixed-repetitions', size: 3}});
  runSampled('sample custom', three,
    {sample: {type: 'custom', fn: 'function (order) { return order.reverse(); }'}});
  // Two groups: indices are bucketed from each trial's own group number.
  var four = [cond('A'), cond('B'), cond('C'), cond('D')];
  runSampled('sample alternate-groups', four,
    {sample: {type: 'alternate-groups', randomizeGroupOrder: true}},
    [{group: 0}, {group: 0}, {group: 1}, {group: 1}]);
  // Group numbers with a gap must be closed up. Passed through as typed they
  // would become an empty group, and jsPsych alternates up to the smallest
  // group — so the experiment would run zero trials.
  runSampled('sample alternate-groups, gapped numbering', four,
    {sample: {type: 'alternate-groups', randomizeGroupOrder: false}},
    [{group: 0}, {group: 0}, {group: 7}, {group: 7}]);
  // Weights are per condition, so they only appear when one is set.
  runSampled('sample with weights', [cond('A'), cond('B')],
    {sample: {type: 'with-replacement', size: 2}},
    [{weight: 3}, {weight: 1}]);
  runSampled('randomize_order', three, {randomize_order: true});
  // The classic 48-trial block: one condition per repetition, drawn each time.
  runSampled('repetitions + sample', three,
    {sample: {type: 'with-replacement', size: 1}, repetitions: 48});
  // repetitions stands on its own — it repeats the block whatever it holds.
  runSampled('repetitions on a ragged phase', [
    [['text', {content: 'A'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'B'}]]
  ], {repetitions: 2});
  // …but sampling has nothing to draw from without a table, and jsPsych would
  // ignore it, so it must not be emitted. Gated the same way the badge is.
  runSampled('sample ignored without a table', [
    [['text', {content: 'A'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'B'}]]
  ], {sample: {type: 'with-replacement', size: 1}, repetitions: 2});
  return out;
}

// Media is the one path none of the five templates touches — no template has an
// image, a sound or a video — so nothing here was covered before. jsPsych's
// Preload plugin is only useful if it runs before the trials that need the
// asset, and the asset is declared as a variable the preload trial refers to, so
// there are two orderings to hold: declarations, then preload, then first use.
function mediaCases() {
  var out = {};
  function run(label, setup, wantPaths) {
    resetEditor();
    eval(setup);
    var code = _compileExperiment({}).code;
    var preload = code.indexOf('type: jsPsychPreload');
    var phase = code.indexOf('// ── ');
    var inPreload = preload >= 0 ? code.slice(preload, phase) : '';
    var referenced = [];
    (code.match(/'(?:img|snd|vid)\\/[^']*'/g) || []).forEach(function (q) {
      var p = q.slice(1, -1);
      if (referenced.indexOf(p) < 0) referenced.push(p);
    });
    var preloaded = [];
    (inPreload.match(/'(?:img|snd|vid)\\/[^']*'/g) || []).forEach(function (q) {
      var p = q.slice(1, -1);
      if (preloaded.indexOf(p) < 0) preloaded.push(p);
    });
    // The preview runs from a blob URL, where a relative path has nothing to
    // resolve against, so it is compiled with the bytes written in instead. Same
    // compiler, same experiment — only the spelling of an asset differs.
    var inline = _compileExperiment({inlineAssets: true}).code;
    out[label] = {
      paths: referenced,
      pathsMatch: JSON.stringify(referenced) === JSON.stringify(wantPaths || []),
      preloadFirst: preload >= 0 && phase >= 0 && preload < phase,
      // every path the trials use is in the preload list
      allPreloaded: referenced.every(function (p) { return preloaded.indexOf(p) >= 0; }),
      // and nothing is preloaded that no trial uses
      noExtraPreloads: preloaded.every(function (p) { return referenced.indexOf(p) >= 0; }),
      noInlineData: code.indexOf('data:') < 0,
      noOldIndirection: code.indexOf('EXP_MEDIA_') < 0,
      inlineHasData: inline.indexOf('data:') >= 0 && inline.indexOf('img/') < 0,
      preloadTagBeforeImages: (function () {
        var html = generateCode();
        var p = html.indexOf('plugin-preload');
        var i = html.indexOf('plugin-image-');
        return p >= 0 && (i < 0 || p < i);
      })(),
    };
  }
  run('image trial', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';",
    ['img/blue.png']);
  run('image in a later phase', "addPhase('instructions'); addTrial(editor.phases[0].id);"
    + "addComponent(findTrial(editor.selectedTrial).id,'text','s');"
    + "addPhase('trials'); addTrial(editor.phases[1].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';",
    ['img/blue.png']);
  run('image + button', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'button','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';"
    + "t.components[1].choices=['Yes','No'];",
    ['img/blue.png']);
  // Each kind gets its own folder, so a name collision across kinds is fine.
  run('audio and video', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'audio','s'); addComponent(t.id,'video','s');"
    + "addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:audio/mp3;base64,AAAA';"
    + "t.components[0].fileName='beep.mp3';"
    + "t.components[1].fileData='data:video/mp4;base64,BBBB';"
    + "t.components[1].fileName='clip.mp4';",
    ['snd/beep.mp3', 'vid/clip.mp4']);
  run('animation frames', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial); addComponent(t.id,'animation','r');"
    + "t.components[0].frames=[{fileData:'data:image/png;base64,AAAA',fileName:'f1.png'},"
    + "{fileData:'data:image/png;base64,BBBB',fileName:'f2.png'}];",
    ['img/f1.png', 'img/f2.png']);
  // Two different files that share a name must both survive the archive, so the
  // second gets a suffix rather than overwriting the first.
  run('same file name, different bytes', "addPhase('trials');"
    + "['AAAA','BBBB'].forEach(function (d, i) {"
    + "addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,'+d;"
    + "t.components[0].fileName='face.png';"
    + "t.components[1].choices=['f','j']; });",
    ['img/face.png', 'img/face_2.png']);
  // The same file twice is one archive entry, one path, one preload entry.
  run('same file used twice', "addPhase('trials');"
    + "['x','y'].forEach(function () {"
    + "addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';"
    + "t.components[1].choices=['f','j']; });",
    ['img/blue.png']);
  // A name with characters that cannot go in a path or a JS string.
  run('awkward file name', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName=\\\"my face (1)'s.png\\\";",
    ['img/my_face_1_s.png']);
  // A bracket before the extension must not leave a trailing underscore.
  run('bracket before extension', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName=\\\"face (1).png\\\";",
    ['img/face_1.png']);
  return out;
}

// A trial can have nothing to show. Every HTML plugin writes its `stimulus`
// straight into the page — `'<div …>' + trial.stimulus + '</div>'` — so a trial
// that omits the parameter puts the literal word "undefined" on the participant's
// screen. survey-text is the same with `preamble`, and its guard is `!== null`,
// which an absent property does not satisfy either.
//
// The canned "press any key" prompt is the other half: it exists for a trial that
// shows nothing AND asks nothing, and must not overwrite a prompt the researcher
// deliberately cleared.
function contentlessCases() {
  var out = {};
  function run(label, spec) {
    resetEditor();
    addPhase('trials');
    addTrial(editor.phases[0].id);
    var t = findTrial(editor.selectedTrial);
    spec.forEach(function (c) {
      var cat = ['keyboard', 'button', 'slider', 'textInput', 'animation'].indexOf(c[0]) >= 0
        ? 'r' : 's';
      addComponent(t.id, c[0], cat);
      var comp = t.components[t.components.length - 1];
      Object.keys(c[1] || {}).forEach(function (k) { comp[k] = c[1][k]; });
    });
    var code = _compileExperiment({}).code;
    var trial = code.slice(code.indexOf('// ── '), code.indexOf('timeline.push'));
    out[label] = {
      // The plugin concatenates this value, so it has to be present and a string.
      hasStimulus: /^\\s*(stimulus|preamble): /m.test(trial),
      emptyStimulus: /^\\s*(stimulus|preamble): ''/m.test(trial),
      prompt: (trial.match(/^\\s*prompt: (.*?),?$/m) || [null, null])[1],
      saysUndefined: code.indexOf('undefined') >= 0,
    };
  }
  // Nothing at all: the one case the canned prompt is for.
  run('no components', []);
  // A fixation then a key wait. The screen is blank by design, and the prompt
  // was cleared — nothing should be invented.
  run('fixation + keyboard, prompt cleared',
    [['fixation', {trial_duration: 500}], ['keyboard', {prompt: '', choices: ['a']}]]);
  // A keyboard with its prompt left alone keeps it.
  run('fixation + keyboard, prompt kept',
    [['fixation', {trial_duration: 500}], ['keyboard', {choices: ['a']}]]);
  // A survey with no preamble: textInput renders `preamble` the same way.
  run('survey with no preamble', [['textInput', {}]]);
  // A button with no stimulus — covered before, kept here so it stays covered.
  run('button with no stimulus', [['button', {choices: ['Go']}]]);
  return out;
}

window.addEventListener('load', function () {
  var out = { ok: true, templates: {}, cases: {}, media: {}, contentless: {}, errors: [] };
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
    try {
      out.cases = phaseCases();
    } catch (e) {
      out.ok = false;
      out.cases = { error: String(e.message) + ' @ ' + String(e.stack).split('\\n')[1] };
    }
    try {
      out.media = mediaCases();
    } catch (e) {
      out.ok = false;
      out.media = { error: String(e.message) + ' @ ' + String(e.stack).split('\\n')[1] };
    }
    try {
      out.contentless = contentlessCases();
    } catch (e) {
      out.ok = false;
      out.contentless = { error: String(e.message) + ' @ ' + String(e.stack).split('\\n')[1] };
    }
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


def normalise(code):
    """Blank out the one thing in the output that changes on its own.

    The generated file carries the date it was produced. Left in, the baseline
    goes red every midnight and the harness teaches people to ignore it — which
    is worse than not having one.
    """
    return re.sub(r"(Generated by ExpVis on )\d{4}-\d{2}-\d{2}", r"\1<DATE>", code)


def cmd_save():
    res = run_probe()
    if not res["ok"]:
        print(json.dumps(res, indent=1)[:2000])
        sys.exit("refusing to save a baseline from a failing run")
    os.makedirs(GOLDEN, exist_ok=True)
    for name, t in res["templates"].items():
        with open(os.path.join(GOLDEN, name + ".html"), "w") as fh:
            fh.write(normalise(t["code"]))
    print(f"saved {len(res['templates'])} templates to tests/golden/")
    for name, t in res["templates"].items():
        print(f"  {name:16s} {len(t['code']):>6} chars   publish parity={t['publishedMatches']}")


def cmd_check():
    res = run_probe()
    if not res["ok"]:
        print(json.dumps(res, indent=1)[:2000])
        sys.exit("FAIL: the probe itself errored")
    media = res.get("media", {})
    if "error" in media:
        broken_media = [f"media cases threw: {media['error']}"]
    else:
        broken_media = []
        for name, c in media.items():
            if not c["pathsMatch"]:
                broken_media.append(f"media case {name}: paths {c['paths']}")
            if not c["preloadFirst"]:
                broken_media.append(f"media case {name}: preload is not before the trials")
            if not c["allPreloaded"]:
                broken_media.append(f"media case {name}: a used asset is not preloaded")
            if not c["noExtraPreloads"]:
                broken_media.append(f"media case {name}: an unused asset is preloaded")
            if not c["noInlineData"]:
                broken_media.append(f"media case {name}: the exported code still inlines bytes")
            if not c["noOldIndirection"]:
                broken_media.append(f"media case {name}: EXP_MEDIA_ indirection survived")
            if not c["inlineHasData"]:
                broken_media.append(f"media case {name}: the standalone build has no bytes")
            if not c["preloadTagBeforeImages"]:
                broken_media.append(f"media case {name}: preload plugin tag missing or "
                                    f"after an image plugin tag")

    contentless = res.get("contentless", {})
    if "error" in contentless:
        broken_contentless = [f"contentless cases threw: {contentless['error']}"]
    else:
        # Every trial must carry a stimulus string, and the canned prompt must
        # appear only where nothing else does.
        CANNED = "'<p>Press any key to continue</p>'"
        # A sentinel, because None already means "this case does not care".
        ABSENT = "<no prompt at all>"
        WANT = {
            "no components":                      {"empty": True,  "prompt": CANNED},
            "fixation + keyboard, prompt cleared": {"empty": True,  "prompt": ABSENT},
            "fixation + keyboard, prompt kept":    {"empty": True,  "prompt": "'Press a key'"},
            "survey with no preamble":             {"empty": True,  "prompt": None},
            "button with no stimulus":             {"empty": True,  "prompt": None},
        }
        broken_contentless = []
        for name, want in WANT.items():
            c = contentless.get(name)
            if not c:
                broken_contentless.append(f"contentless case {name}: missing")
                continue
            if c["saysUndefined"]:
                broken_contentless.append(f"contentless case {name}: the code says 'undefined'")
            if not c["emptyStimulus"]:
                broken_contentless.append(
                    f"contentless case {name}: no empty stimulus (hasStimulus={c['hasStimulus']})")
            if want["prompt"] == ABSENT:
                if c["prompt"] is not None:
                    broken_contentless.append(
                        f"contentless case {name}: invented a prompt ({c['prompt']}) where the "
                        f"researcher cleared it")
            elif want["prompt"] is not None and c["prompt"] != want["prompt"]:
                broken_contentless.append(
                    f"contentless case {name}: prompt {c['prompt']}, expected {want['prompt']}")

    cases = res.get("cases", {})
    if "error" in cases:
        broken_cases = [f"phase cases threw: {cases['error']}"]
    else:
        # What each synthetic phase must compile to. `factored` is the point:
        # a phase whose trials are one procedure becomes a table, and every
        # other shape must stay plain trials rather than being forced into one.
        WANT = {"homogeneous": True, "homogeneous+fixation": True,
                "ragged": False, "identical": False, "one trial": False}
        broken_cases = [
            f"phase case {name}: factored={cases[name]['factored']}, expected {want}"
            for name, want in WANT.items()
            if name in cases and cases[name]["factored"] != want
        ]
        # The phase settings, mapped to the exact jsPsych parameters they emit.
        # Written out in full rather than pattern-matched: a control that quietly
        # stops emitting, or starts emitting the wrong shape, is the failure this
        # is here to catch.
        WANT_PARAMS = {
            "sample without-replacement":
                ["sample: {type: 'without-replacement', size: 2}"],
            "sample with-replacement":
                ["sample: {type: 'with-replacement', size: 1}"],
            "sample fixed-repetitions":
                ["sample: {type: 'fixed-repetitions', size: 3}"],
            "sample custom":
                ["sample: {type: 'custom', fn: function (order) { return order.reverse(); }}"],
            "sample alternate-groups":
                ["sample: {type: 'alternate-groups', groups: [[0,1],[2,3]], "
                 "randomize_group_order: true}"],
            "sample alternate-groups, gapped numbering":
                ["sample: {type: 'alternate-groups', groups: [[0,1],[2,3]], "
                 "randomize_group_order: false}"],
            "sample with weights":
                ["sample: {type: 'with-replacement', size: 2, weights: [3, 1]}"],
            "randomize_order": ["randomize_order: true"],
            "repetitions + sample":
                ["sample: {type: 'with-replacement', size: 1}", "repetitions: 48"],
            "repetitions on a ragged phase": ["repetitions: 2"],
            # sample is dropped here, repetitions is not.
            "sample ignored without a table": ["repetitions: 2"],
        }
        for name, want in WANT_PARAMS.items():
            got = cases.get(name, {}).get("nodeParams")
            if got != want:
                broken_cases.append(f"phase case {name}: emitted {got}, expected {want}")
        for name, c in cases.items():
            if c["forbiddenParams"]:
                broken_cases.append(f"phase case {name}: {c['forbiddenParams']}")
            if name in ("homogeneous", "homogeneous+fixation") and c["trialsPerNode"] != [1]:
                broken_cases.append(
                    f"phase case {name}: node should hold the one procedure, "
                    f"got {c['trialsPerNode']}")

    bad = 0
    broken = list(broken_cases) + list(broken_media) + list(broken_contentless)
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
        same = want == normalise(t["code"])
        if not same:
            bad += 1
        print(f"  {'OK  ' if same else 'DIFF'} {name:16s} "
              f"{len(want)} -> {len(normalise(t['code']))} chars   "
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
