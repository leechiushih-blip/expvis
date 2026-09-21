#!/usr/bin/env python3
"""Headless-Chrome probe for the ExpVis editor.

The editor is one big file with no test suite, so every verification in this
project has been "open it in a browser and assert something". This script makes
that repeatable, which a refactor of the data model needs: stage 1 must produce
byte-identical output to what came before.

    tests/expvis_probe.py save            # capture tests/golden/*.html
    tests/expvis_probe.py check           # compare against them
    tests/expvis_probe.py dump stroop     # print one template's output
    tests/expvis_probe.py coverage        # write docs/JSPsych_TIMELINE_COVERAGE.md
"""

import html
import json
import os
import re
import subprocess
import sys

# Where Chrome lives. The macOS path used to be the whole of it, which meant
# the probe could not run anywhere else — including CI, where Chrome is at
# /usr/bin/google-chrome. CHROME overrides, for anything neither list knows.
def _find_chrome():
    import shutil

    override = os.environ.get("CHROME")
    if override:
        return override
    for path in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ):
        if os.path.exists(path):
            return path
    found = shutil.which("google-chrome") or shutil.which("chromium")
    return found or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


CHROME = _find_chrome()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = os.path.join(ROOT, "tests", "golden")
# The five structure demonstrations. Renamed from branch-demo /
# randomize-demo, which were named after components that no longer exist.
TEMPLATES = ["stroop", "simon", "flanker", "branching", "survey"]

# Injected into the editor page. Runs each template, generates code, and leaves
# the result in a <pre id="PROBE_OUT"> for --dump-dom to pick up.
PROBE = """
<script>
// Evaluate the generated experiment against a stub of the jsPsych surface it
// expects. This is the only way to assert its SHAPE rather than its bytes: that
// every block became one node pushed in canvas order, that each node collects
// the trials the canvas shows, and that no node carries a node-level parameter
// ExpVis no longer supports. A syntax error in the generated code throws here.
var __PLUGINS = ['jsPsychHtmlKeyboardResponse', 'jsPsychHtmlButtonResponse',
  'jsPsychHtmlSliderResponse', 'jsPsychSurveyText', 'jsPsychPreload', 'jsPsychAnimation',
  'jsPsychSurveyLikert', 'jsPsychSurveyMultiChoice', 'jsPsychSurveyMultiSelect',
  'jsPsychSurveyHtmlForm', 'jsPsychCategorizeImage', 'jsPsychCategorizeHtml',
  'jsPsychCloze', 'jsPsychFreeSort',
  'jsPsychAudioKeyboardResponse', 'jsPsychAudioButtonResponse',
  'jsPsychAudioSliderResponse', 'jsPsychVideoKeyboardResponse',
  'jsPsychVideoButtonResponse', 'jsPsychVideoSliderResponse',
  'jsPsychImageKeyboardResponse', 'jsPsychImageButtonResponse', 'jsPsychImageSliderResponse'];
// Node-level parameters that jsPsych reads but ExpVis does not derive from the
// canvas. Everything else a node can carry — timeline_variables, sample,
// randomize_order, repetitions — is derived or set in the block settings and is
// asserted per case in blockCases() instead.
//
// A case may carry one of these ONLY by declaring it in `expectParams`, and the
// check runs both ways: an undeclared parameter fails (something leaked), and a
// declared one that never appears fails too (a feature stopped working). The
// block-settings dialog builds loop_function and conditional_function, so those
// two are declared by the cases that ask for them; on_timeline_start /
// on_timeline_finish are still hand-written only, and so are declared by nobody.
var __NODE_PARAMS = ['name', 'loop_function', 'conditional_function',
                     'on_timeline_start', 'on_timeline_finish'];
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
  var observed = [];
  // Own keys of each NODE. Not a walk of the whole object: a trial's own
  // parameters are not node parameters, and a plugin's nested `questions[].name`
  // is neither — `name` on a node means something quite different from `name`
  // inside a survey question.
  tl.forEach(function (n) {
    if (!n || !n.timeline) return;      // a bare trial is not a node
    Object.keys(n).forEach(function (k) {
      if (__NODE_PARAMS.indexOf(k) >= 0 && observed.indexOf(k) < 0) observed.push(k);
    });
  });
  return {
    // one entry per block node; the number is how many trials it collects
    trialsPerNode: tl.map(function (n) { return n && n.timeline ? n.timeline.length : null; }),
    observedParams: observed.sort()
  };
}

// The two things a regex over the generated text cannot check: which properties
// a node actually carries, and how deep the `timeline` nesting goes. Evaluate it
// and look.
function nodeShape(code) {
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
  function depth(n) {
    if (!n || !Array.isArray(n.timeline)) return 0;
    var d = 0;
    n.timeline.forEach(function (c) { d = Math.max(d, depth(c)); });
    return 1 + d;
  }
  return {
    // own properties of each top-level node; null where the entry is a bare
    // trial rather than a node (the preload trial, for instance)
    nodeKeys: tl.map(function (n) { return n && n.timeline ? Object.keys(n).sort() : null; }),
    deepestTimeline: tl.reduce(function (m, n) { return Math.max(m, depth(n)); }, 0)
  };
}

// Block factoring (one procedure + a timeline_variables table) needs a block
// whose trials are structurally identical, which none of the five built-in
// templates has — they are all heterogeneous or single-trial, so nothing in
// them exercises this path. These cases build one on the spot.
function blockCases() {
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
  function run(label, spec, blockProps) {
    resetEditor();
    addBlock('trials');
    build(editor.blocks[0].id, spec);
    Object.keys(blockProps || {}).forEach(function (k) { editor.blocks[0][k] = blockProps[k]; });
    var code = _compileExperiment({}).code;
    var st = inspectStructure(code);
    var m = blockModes()[editor.blocks[0].id] || {};
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      // whether the trials COULD be one procedure, which is what the settings
      // dialog offers before the researcher asks for it
      uniform: !!m.uniform,
      // a factored node holds the one procedure, not one entry per condition
      trialsPerNode: st.trialsPerNode,
      observedParams: st.observedParams,
      expectParams: [],
      noTokens: code.indexOf('@@') < 0,
      // `type` selects the plugin and is read when the trial is instantiated,
      // before any timeline variable has a value. Whatever the block, the plugin
      // must never have been hoisted into the table.
      variablePlugin: /timelineVariable\\('type'\\)/.test(code),
      // The four fields jsPsych writes on every row. ExpVis must not write them
      // itself — `data: {trial_index: …}` collides with a reserved field, which
      // is why the provenance field was renamed trial_in_block.
      writesReserved: /^\\s*(trial_type|trial_index|time_elapsed|plugin_version):/m.test(code)
    };
  }
  // Two trials that share a shape are STILL two trials. The compiler cannot
  // tell them from two conditions of one procedure, so it does not guess — it
  // emits what the canvas shows and leaves the reading to the researcher.
  var HOMOGENEOUS = [
    [['text', {content: 'RED'}], ['keyboard', {choices: ['a'], correctKey: 'a'}]],
    [['text', {content: 'BLUE'}], ['keyboard', {choices: ['a'], correctKey: 'l'}]]
  ];
  run('homogeneous, default', HOMOGENEOUS);
  run('homogeneous, run as one procedure', HOMOGENEOUS, {conditions: true});
  // A fixation opens each trial, so the varying value sits inside the node's own
  // timeline rather than at its top level.
  var WITH_FIXATION = [
    [['fixation', {trial_duration: 500}], ['text', {content: 'RED'}]],
    [['fixation', {trial_duration: 500}], ['text', {content: 'BLUE'}]]
  ];
  run('fixation, run as one procedure', WITH_FIXATION, {conditions: true});
  // Asking for one procedure does not make one exist: trials of different
  // shapes still have no single procedure to hoist, so the block falls back.
  run('ragged, run as one procedure', [
    [['text', {content: 'RED'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'BLUE'}]]
  ], {conditions: true});
  // Identical trials have nothing to vary, whatever the mode.
  run('identical, run as one procedure', [
    [['text', {content: 'SAME'}]],
    [['text', {content: 'SAME'}]]
  ], {conditions: true});
  run('one trial, run as one procedure', [[['text', {content: 'ONLY'}]]],
    {conditions: true});
  // An animation is emitted as a whole trial rather than as properties, so it
  // leaves the compiler by a path of its own — and nothing covered that path.
  // It was silently broken: the trial was declared, the node's timeline never
  // named it, and the animation never ran.
  run('animation trial', [[['animation', {
    frames: [{fileData: 'data:image/png;base64,AAAA', fileName: 'f1.png'}],
    frame_time: 100
  }]]]);
  // A custom parameter the researcher wrote as JavaScript. It must REPLACE the
  // property the compiler would have written, not sit beside it: two `stimulus:`
  // keys in one object literal is valid JavaScript that keeps the last one.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    addComponent(t.id, 'keyboard', 'r');
    t.custom = [{name: 'stimulus',
      src: "function () {\\n  return '<p>' + jsPsych.evaluateTimelineVariable('name') + '</p>';\\n}"}];
    var code = _compileExperiment({}).code;
    out['custom parameter (replace)'] = {
      factored: false,
      uniform: false,
      trialsPerNode: inspectStructure(code).trialsPerNode,
      expectParams: [],
      noTokens: code.indexOf('@@') < 0,
      replacesGenerated: code.indexOf("stimulus: '<div") < 0,
      emitsTheSource: code.indexOf('evaluateTimelineVariable') >= 0,
      // one `stimulus:` key, not two
      stimulusKeys: (code.match(/^\\s*stimulus:/gm) || []).length,
      stillParses: true
    };
  })();
  // A custom parameter the compiler would NOT have written is appended.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    t.custom = [{name: 'on_load', src: 'function () { console.log("loaded"); }'}];
    var code = _compileExperiment({}).code;
    out['custom parameter (append)'] = {
      factored: false, uniform: false,
      trialsPerNode: inspectStructure(code).trialsPerNode,
      expectParams: [], noTokens: code.indexOf('@@') < 0,
      emitsTheSource: code.indexOf('console.log("loaded")') >= 0,
      stimulusKeys: (code.match(/^\\s*stimulus:/gm) || []).length,
      stillParses: true
    };
  })();
  // Two trials whose properties match but whose PLUGINS differ. The image-only
  // one runs on the image plugin, the one with a caption on the HTML plugin, and
  // because stimulus_width is 0 the two emit the same set of properties — so the
  // signature matches and they were hoisted, producing
  // `type: jsPsych.timelineVariable('type')`, which cannot resolve to anything.
  run('different plugins, run as one procedure', [
    [['image', {fileData: 'data:image/png;base64,AAAA', fileName: 'p1.png',
                stimulus_width: 0}], ['keyboard', {choices: ['a', 'l']}]],
    [['image', {fileData: 'data:image/png;base64,BBBB', fileName: 'p2.png',
                stimulus_width: 0}], ['text', {content: 'caption'}],
     ['keyboard', {choices: ['a', 'l']}]]
  ], {conditions: true});
  // A custom NODE parameter — the level the trial's custom parameters cannot
  // reach. loop_function and conditional_function belong to the node, so this is
  // where they become expressible. Same rule: it REPLACES the generated
  // parameter of the same name, because two keys in one object literal is valid
  // JavaScript that keeps the last one.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    addComponent(editor.selectedTrial, 'text', 's');
    editor.blocks[0].repetitions = 4;
    editor.blocks[0].custom = [
      {name: 'loop_function', src: 'function (data) { return false; }'},
      {name: 'repetitions', src: '2'}
    ];
    var code = _compileExperiment({}).code;
    var stCustom = inspectStructure(code);
    out['custom node parameter'] = {
      factored: false, uniform: false,
      trialsPerNode: stCustom.trialsPerNode,
      // A hand-written loop_function is the whole point of this case.
      observedParams: stCustom.observedParams,
      expectParams: ['loop_function'],
      noTokens: code.indexOf('@@') < 0,
      // trailing comma off, and sorted: the point is which keys exist and what
      // they say, not the order the node happens to list them in
      emitted: (code.match(/^\\s*(loop_function|repetitions):.*$/gm) || [])
        .map(function (x) { return x.trim().replace(/,$/, ''); }).sort()
    };
  })();
  // The block settings build the two node parameters that take a function.
  // These cases pin that they reach the node, the exact shape they take, and —
  // separately, because text can be right while the meaning is inverted — how
  // they behave when actually driven.
  (function () {
    function buildWith(loop, cond) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      addComponent(t.id, 'text', 's');
      addComponent(t.id, 'keyboard', 'r');
      t.components[1].choices = ['a', 'l'];
      t.components[1].correctKey = 'a';
      if (loop) editor.blocks[0].loop = loop;
      if (cond) editor.blocks[0].cond = cond;
      var code = _compileExperiment({}).code;
      return {code: code, st: inspectStructure(code)};
    }
    var LOOP = {field: 'correct', op: 'is', value: 'true', cap: 10};
    var COND = {field: 'correct', op: 'is', value: 'true'};
    var both = buildWith(LOOP, COND);
    out['block conditions'] = {
      factored: false, uniform: false,
      trialsPerNode: both.st.trialsPerNode,
      observedParams: both.st.observedParams,
      expectParams: ['conditional_function', 'loop_function'],
      noTokens: both.code.indexOf('@@') < 0,
      // The loop is asked "go round again?", so the researcher's "until" comes
      // out negated. The condition is asked "run at all?", so it does not.
      loopNegated: /loop_function:[\\s\\S]*?return !\\(last && last\\.correct === true\\);/
        .test(both.code),
      condNotNegated: /conditional_function:[\\s\\S]*?return \\(last && last\\.correct === true\\);/
        .test(both.code),
      // `.last(1)`, never the docs' `.values()[0]`: a round can open with a
      // fixation, and the first row would then carry no score. Asserted against
      // the generator's own output, not the assembled file — a regex running
      // from `loop_function:` would happily match the conditional's accessor
      // further down and pass on a broken loop.
      loopReadsLastRow:
        _loopFunctionSrc({loop: LOOP}).indexOf('data.last(1).values()[0]') >= 0,
      // jsPsych passes this one nothing, so it has to reach for jsPsych.data.
      condTakesNoArg: /conditional_function: function \\(\\) \\{/.test(both.code),
      condReadsGlobal: /conditional_function:[\\s\\S]*?jsPsych\\.data\\.get\\(\\)/
        .test(both.code),
      // No cap of ExpVis's: the emitted function is the plain literal the
      // docs use, and the counting closure that used to wrap it is gone
      noCapWrapper: both.code.indexOf('rounds') < 0
    };
    // With no cap the output is the plain function literal the docs use.
    var uncapped = buildWith({field: 'correct', op: 'is', value: 'true', cap: 0}, null);
    out['uncapped loop'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: uncapped.st.observedParams,
      expectParams: ['loop_function'],
      noTokens: true,
      plainLiteral: /loop_function: function \\(data\\) \\{/.test(uncapped.code),
      noCounter: uncapped.code.indexOf('rounds') < 0
    };
    // Drive the emitted function. Dropping the `!` or reading the first row
    // instead of the last both leave the text looking perfectly reasonable.
    (function () {
      // A fresh closure per assertion: the cap counts inside the closure, so a
      // shared instance would spend its rounds on the first assertion and the
      // rest would fail for the wrong reason.
      function make(cap) {
        return new Function('return (' +
          _loopFunctionSrc({loop: {field: 'correct', op: 'is', value: 'true', cap: cap}}) +
          ');')();
      }
      // `last(1)` slices, as the real DataCollection does, and `values()` is
      // there too so that an implementation reaching for `.values()[0]` reads
      // the FIRST row instead of throwing "not a function" — which would look
      // like a crash rather than the wrong row. The stub has to model the whole
      // surface, or the wrong implementation finds a path the right one never
      // takes.
      function round(rows) {
        return {
          last: function (n) { return {values: function () { return rows.slice(-n); }}; },
          values: function () { return rows; }
        };
      }
      var stopsOnCorrect = make(3)(round([{correct: true}])) === false;
      // Nothing stops it on its own: jsPsych has no limit and neither does the
      // emitted function. That is the observable consequence of dropping the cap.
      var calls = 0, r = true;
      var unbounded = make(3);
      while (r && calls < 50) { r = unbounded(round([{correct: false}])); calls++; }
      // LAST row, not first: a fixation, then the scored response
      var lastRowDecides =
        make(3)(round([{correct: true}, {correct: false}])) === true &&
        make(3)(round([{correct: false}, {correct: true}])) === false;
      var emptyRoundSafe = make(3)(round([])) === true;
      out['loop behaviour'] = {
        factored: false, uniform: false, trialsPerNode: [],
        observedParams: [], expectParams: [], noTokens: true,
        stopsOnCorrect: stopsOnCorrect,
        // 50 calls and still saying continue — there is no cap of ExpVis's left
        noCapOfItsOwn: r === true && calls === 50,
        capCalls: calls,
        lastRowDecides: lastRowDecides,
        emptyRoundSafe: emptyRoundSafe
      };
    })();
    // A hand-written loop_function still replaces the generated one: one key in
    // the object literal, and it is the researcher's. This pins the replace rule
    // at the node level for the very parameter the dialog now generates.
    (function () {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      addComponent(t.id, 'text', 's');
      addComponent(t.id, 'keyboard', 'r');
      t.components[1].choices = ['a', 'l'];
      t.components[1].correctKey = 'a';
      editor.blocks[0].loop = LOOP;
      editor.blocks[0].custom = [{name: 'loop_function',
                                  src: 'function (data) { return false; }'}];
      var code = _compileExperiment({}).code;
      out['hand-written loop overrides'] = {
        factored: false, uniform: false, trialsPerNode: [],
        observedParams: inspectStructure(code).observedParams,
        expectParams: ['loop_function'],
        noTokens: true,
        keyCount: (code.match(/loop_function:/g) || []).length,
        generatedOneGone: code.indexOf('rounds') < 0,
        isTheWrittenOne: /loop_function: function \\(data\\) \\{ return false; \\}/.test(code)
      };
    })();
  })();
  // The .jzip layout, asserted without an unzipper: buildJatosFiles() returns
  // the entry list, so the names and the manifest can be read directly. What
  // the zip wrapper then does with them is _zipBytes' job, tested by using it.
  (function () {
    resetEditor();
    editor.projectName = 'Probe Project';
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    addComponent(t.id, 'image', 's');
    t.components[1].fileData = 'data:image/png;base64,iVBORw0KGgo=';
    t.components[1].fileName = 'blue.png';
    t.components[1].stimulus_width = 0;
    var r = _compileExperiment({});
    var files = buildJatosFiles(r);
    var names = files.map(function (f) { return f.name; });
    var j = _jatosIds();
    var doc = String.fromCharCode.apply(null, files[1].data);
    var local = _buildJsPsychHTML(r.code, r.usedPlugins);
    var jas = JSON.parse(String.fromCharCode.apply(null, files[0].data));
    out['jzip layout'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      manifestName: names[0],
      htmlPath: names[1],
      assetPath: names[2],
      // the manifest and the directory it names have to agree, or JATOS looks
      // for the assets somewhere that does not exist
      dirMatchesStudy: jas.data.dirName === j.study && jas.data.uuid === j.study,
      htmlNamedAfterComponent: names[1] === j.study + '/' + j.component + '.html',
      // and the component's htmlFilePath has to be relative to that directory
      componentPathMatches:
        jas.data.componentList[0].htmlFilePath === j.component + '.html',
      // The stimulus src is a relative path, so the assets must sit in the SAME
      // directory as the HTML — not merely under the same study folder. Derived
      // from the HTML's own directory rather than from j.study, so pushing the
      // HTML one level deeper fails here instead of passing on a technicality.
      assetsBesideHtml: names[2] ===
        names[1].split('/').slice(0, -1).join('/') + '/' + r.assets[0].path,
      everyEntryIsBytes: files.every(function (f) { return f.data instanceof Uint8Array; }),
      htmlLoadsJatos: doc.indexOf('/assets/javascripts/jatos.js') >= 0,
      // the plain download must NOT carry the platform tag
      localDoesNotLoadJatos: local.indexOf('jatos.js') < 0,
      // minted once: a re-export has to reuse them, or JATOS gets a new study
      idsStable: buildJatosFiles(r)[1].name === names[1] &&
                 JSON.parse(String.fromCharCode.apply(null, buildJatosFiles(r)[0].data))
                   .data.uuid === jas.data.uuid,
    };
  })();
  // A fixation that follows a visual stimulus is emitted at the END of the
  // node, not where it sits in the component list — so [shape, fixation, shape]
  // is ONE screen holding both shapes plus a trailing fixation trial, two
  // trials and not three. The canvas groups by this same rule, which is why it
  // is pinned here: without it the canvas is free to promise a sequence the
  // experiment does not run.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'shape', 's');
    t.components[0].shape = 'circle';
    t.components[0].color = '#ff0000';
    addComponent(t.id, 'fixation', 's');
    t.components[1].trial_duration = 500;
    addComponent(t.id, 'shape', 's');
    t.components[2].shape = 'square';
    t.components[2].color = '#00ff00';
    var code = _compileExperiment({}).code;
    var st = inspectStructure(code);
    var node = (code.match(/var trials_timeline = \\{[\\s\\S]*?\\n\\};/) || [''])[0];
    out['fixation after a stimulus'] = {
      factored: false, uniform: false,
      trialsPerNode: st.trialsPerNode,
      observedParams: st.observedParams, expectParams: [], noTokens: true,
      // the screen, then the fixation — not shape / fixation / shape
      holdsTwoTrials: st.trialsPerNode.length === 1 && st.trialsPerNode[0] === 2,
      // Both shapes reached the one screen, in component order. Identified by
      // their colours: a square carries no shape CSS at all, so the styling
      // cannot tell them apart.
      bothStimuliOnIt: node.indexOf('#ff0000') >= 0 && node.indexOf('#00ff00') >= 0 &&
                       node.indexOf('#ff0000') < node.indexOf('#00ff00'),
      // the fixation is the timed trial, and it is emitted after that screen
      fixationIsTheTimedTrial: /choices: 'NO_KEYS'/.test(node) &&
                               node.lastIndexOf('NO_KEYS') > node.lastIndexOf('#00ff00'),
    };
  })();
  // A trial holding two response components — the state the reviewer reached
  // ("a trial that had multiple response types"), and one a project saved
  // before the one-response guard can still carry. The plugin and its
  // parameters have to come from the SAME component: the old behaviour let the
  // later component overwrite respInfo field by field while respType kept the
  // first, producing a keyboard plugin carrying a button's choices, which no
  // key can answer.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    addComponent(t.id, 'keyboard', 'r');
    t.components[1].choices = ['a', 'l'];
    t.components[1].correctKey = 'a';
    // pushed past addComponent's guard, which is how an old project looks
    t.components.push({id: 'cx1', type: 'button', cat: 'r', choices: ['Yes', 'No']});
    var code = _compileExperiment({}).code;
    var st = inspectStructure(code);
    var trial = (code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/) || [''])[0];
    out['two response components'] = {
      factored: false, uniform: false,
      trialsPerNode: st.trialsPerNode,
      observedParams: st.observedParams, expectParams: [], noTokens: true,
      pluginIsTheFirst: /type: jsPsychHtmlKeyboardResponse/.test(trial),
      // the parameters match that plugin, not the other component
      choicesAreTheFirsts: /choices: \["a","l"\]/.test(trial),
      // and the ignored component's parameters do not leak in
      secondDidNotLeak: trial.indexOf('Yes') < 0 && trial.indexOf('button_layout') < 0,
      // its scoring key still points at the component that was generated
      scoresAgainstIt: /correct_response: 'a'/.test(trial),
    };
  })();
  // What a trial may hold: one response component, and nothing beside an
  // animation. jsPsychAnimation clears the display element every frame, so it
  // cannot sit next to a stimulus either — before this rule, adding one beside
  // a text silently compiled the text away, and adding it beside a keyboard
  // dropped whichever came second. addComponent enforces both by giving the
  // newcomer a trial of its own.
  (function () {
    function shapeAfter(spec) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      spec.forEach(function (s) { addComponent(t.id, s[0], s[1]); });
      return editor.blocks[0].timeline.map(function (tr) {
        return tr.components.map(function (c) { return c.type; }).join('+');
      }).join(' | ');
    }
    out['one owner per trial'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // an animation added beside a stimulus gets its own trial
      animAfterStim: shapeAfter([['text', 's'], ['animation', 'x']]),
      // and a stimulus added beside an animation
      stimAfterAnim: shapeAfter([['animation', 'x'], ['text', 's']]),
      // a second response component, as before
      secondResponse: shapeAfter([['keyboard', 'r'], ['button', 'r']]),
      // two stimuli still share a screen: the rules are not a blanket ban
      twoStimuli: shapeAfter([['text', 's'], ['shape', 's']]),
    };
  })();
  // The survey family. Every one of these plugins takes a `questions` LIST —
  // which the editor only ever filled with a single entry, so the plugin's
  // ability to ask several on one page was unreachable. These pin that a page
  // carries several, that each plugin's per-question fields reach the output,
  // and that names are numbered rather than left to the plugin's default.
  (function () {
    function build(type, questions, html) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      addComponent(t.id, type, 'r');
      if (questions) t.components[0].questions = questions;
      if (html != null) t.components[0].html = html;
      var code = _compileExperiment({}).code;
      return (code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/) || [''])[0];
    }
    var likert = build('likert', [
      {prompt: 'One', labels: ['No', 'Maybe', 'Yes'], required: true},
      {prompt: 'Two', labels: ['No', 'Maybe', 'Yes']}]);
    var choice = build('multiChoice', [
      {prompt: 'Pick', options: ['A', 'B'], required: true},
      {prompt: 'Again', options: ['C', 'D'], horizontal: true}]);
    var multi = build('multiSelect', [{prompt: 'Any', options: ['X', 'Y']}]);
    var text = build('textInput', [
      {prompt: 'Name', placeholder: 'here', required: true},
      {prompt: 'Age'}]);
    var form = build('htmlForm', null, '<input name="rating">');
    function promptCount(trial) { return (trial.match(/prompt: /g) || []).length; }
    out['survey questions'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // each type reaches its own plugin
      plugins: [/jsPsychSurveyLikert/, /jsPsychSurveyMultiChoice/,
                /jsPsychSurveyMultiSelect/, /jsPsychSurveyText/,
                /jsPsychSurveyHtmlForm/]
        .every(function (re, i) {
          return re.test([likert, choice, multi, text, form][i]);
        }),
      // several questions, not one
      likertTwoQuestions: promptCount(likert) === 2,
      choiceTwoQuestions: promptCount(choice) === 2,
      textTwoQuestions: promptCount(text) === 2,
      // the per-type fields that make each plugin what it is
      //
      // FLAT, and this assertion used to demand the nested form. The plugin
      // declares `labels` as a flat STRING array and draws one radio per
      // element, so `[['No','Maybe','Yes']]` is one element: the scale rendered
      // as a single radio reading "No,Maybe,Yes". Measured plugin-level; the
      // behaviour tests in tests/behavior/ carry the rendered result.
      labelsAsOneRow: /labels: \\['No', 'Maybe', 'Yes'\\]/.test(likert) &&
                      likert.indexOf("labels: [[") < 0,
      optionsReached: /options: \\['A', 'B'\\]/.test(choice) &&
                      /options: \\['C', 'D'\\]/.test(choice),
      horizontalReached: /horizontal: true/.test(choice),
      requiredReached: /required: true/.test(likert) && /required: true/.test(text),
      // placeholder only where one was set — the second text question has none
      placeholderOnlyWhereSet: (text.match(/placeholder: /g) || []).length === 1,
      // numbered names, so the data keys are visible in the file
      namesNumbered: /name: 'Q0'/.test(likert) && /name: 'Q1'/.test(likert),
      // html-form carries html, not questions
      formHasHtml: /html: '<input name="rating">'/.test(form) &&
                    form.indexOf('questions') < 0,
      // no plugin may print the word "undefined" at a participant
      noUndefined: [likert, choice, multi, text, form]
        .every(function (x) { return x.indexOf('undefined') < 0; }),
      // and none of them takes trial_duration
      noTrialDuration: [likert, choice, multi, text, form]
        .every(function (x) { return x.indexOf('trial_duration') < 0; }),
    };
  })();
  // Feedback switches the trial onto jsPsych's OWN categorize plugin rather than
  // ExpVis growing a feedback mechanism of its own, and it does the scoring too.
  // Two conditions decide it: the response must be a keyboard (there is no
  // button or slider categorize variant) and the Correct Key must be a single
  // key (`key_answer` is one character). When either fails the feedback is left
  // out — and the canvas says so, which is asserted in the UI checks, not here.
  (function () {
    function build(spec, tweak) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      spec.forEach(function (s) {
        addComponent(t.id, s[0], s[1]);
        var c = t.components[t.components.length - 1];
        Object.keys(s[2] || {}).forEach(function (k) { c[k] = s[2][k]; });
      });
      if (tweak) tweak(t);
      return (_compileExperiment({}).code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/)
        || [''])[0];
    }
    var KB = ['keyboard', 'r', {choices: ['f', 'j'], correctKey: 'f'}];
    var IMG = ['image', 's', {fileData: 'data:image/png;base64,iVBORw0KGgo=',
                              fileName: 'p.png', stimulus_width: 0}];
    var TXT = ['text', 's', {content: 'word'}];
    function withFeedback(t) {
      t.components[t.components.length - 1].correct_text = 'Correct!';
    }
    var img = build([IMG, KB], withFeedback);
    var html = build([TXT, KB], withFeedback);
    var plain = build([IMG, KB]);
    var twoKeys = build([IMG, ['keyboard', 'r', {choices: ['f', 'j'], correctKey: 'f,j'}]],
      withFeedback);
    out['feedback uses categorize'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // an image alone gets the image variant, holding the picture as `stimulus`
      imageUsesImagePlugin: /type: jsPsychCategorizeImage/.test(img) &&
                            /stimulus: 'img\\/p.png'/.test(img),
      // anything else gets the html variant, holding the rendered screen
      htmlUsesHtmlPlugin: /type: jsPsychCategorizeHtml/.test(html) &&
                          html.indexOf("'<div") >= 0,
      // the feedback parameters are the plugin's own, emitted only when set
      feedbackEmitted: /correct_text: 'Correct!'/.test(img) &&
                       img.indexOf('incorrect_text') < 0,
      keyAnswerEmitted: /key_answer: 'f'/.test(img),
      // the plugin scores it, so ExpVis must NOT add its own data + on_finish
      pluginDoesTheScoring: img.indexOf('data: {correct_response') < 0 &&
                            img.indexOf('on_finish') < 0,
      // no feedback: exactly what it was before
      withoutFeedbackUnchanged: /type: jsPsychImageKeyboardResponse/.test(plain) &&
                                /data: \\{correct_response: 'f'\\}/.test(plain),
      // two correct keys: categorize cannot score it, so it is not used
      severalKeysRefuse: /type: jsPsychImageKeyboardResponse/.test(twoKeys),
    };
  })();
  // A plugin parameter written where the plugin does not run was dropped in
  // silence: a medium sharing the screen with anything else falls back to the
  // HTML path, which has no `trial_ends_after_audio` / `controls` / `start`.
  // The researcher filled in a field and the file came back without it. It is
  // named now — and only when there is something to name, so the two cases
  // where nothing is lost stay quiet.
  (function () {
    function build(spec, setup) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      spec.forEach(function (s) {
        addComponent(t.id, s[0], s[1]);
        var c = t.components[t.components.length - 1];
        Object.keys(s[2] || {}).forEach(function (k) { c[k] = s[2][k]; });
      });
      if (setup) setup(t);
      return _compileExperiment({}).code;
    }
    var KB = ['keyboard', 'r', {choices: ['f', 'j']}];
    var TXT = ['text', 's', {content: 'listen'}];
    var AUD = ['audio', 's', {fileData: 'data:audio/wav;base64,AAAA', fileName: 'tone.wav'}];
    var VID = ['video', 's', {fileData: 'data:video/mp4;base64,AAAA', fileName: 'clip.mp4'}];
    // alone: the audio plugin takes the parameter, so there is nothing dropped
    var alone = build([AUD, KB], function (t) {
      t.components[0].trial_ends_after_audio = true;
    });
    // sharing the screen AND the value moved off its default: the loss is real
    var shared = build([AUD, TXT, KB], function (t) {
      t.components[0].trial_ends_after_audio = true;
    });
    // sharing the screen but nothing was changed: nothing to warn about
    var untouched = build([AUD, TXT, KB]);
    var vid = build([VID, TXT, KB], function (t) {
      t.components[0].controls = true;
    });
    out['dropped parameters are named'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      aloneIsSilent: alone.indexOf('does not exist') < 0,
      untouchedIsSilent: untouched.indexOf('does not exist') < 0,
      namesTheAudioParam: /shares the screen/.test(shared) &&
                          /trial_ends_after_audio/.test(shared),
      namesTheVideoParam: /shares the screen/.test(vid) &&
                          /controls/.test(vid),
      namesTheRemedy: /trial of its own/.test(shared),
      // the warning is a comment, not something the participant ever sees
      staysAComment: shared.indexOf('// !! This audio') >= 0,
    };
  })();
  // The Inspector skipped `correctKey` entirely, so the field had no GUI path
  // at all: a project built from scratch could not score anything, and the
  // feedback chain — which needs exactly one key — was reachable only through
  // a template or a hand-written parameter. It is an ordinary field now, and
  // the retired 'Key Hint' label alongside it is gone.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'keyboard', 'r');
    var kb = t.components[0];
    kb.choices = ['a', 'l'];
    editor.selComp = kb.id;
    renderInspector();
    var html = document.getElementById('inspector').innerHTML;
    out['correct key is editable'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // an input that writes the field back, the way every other field does
      hasInput: html.indexOf("'" + t.id + "','" + kb.id + "','correctKey'") >= 0,
      // labelled in words, not by the raw field name
      labelled: html.indexOf('Correct Key') >= 0,
      // the retired label is not rendered as a field of its own
      retiredHintGone: html.indexOf('Key Hint') < 0
    };
  })();
  // The first task plugin. Cloze builds its own page — the text, a field per
  // blank, and the submit button — so it has no `stimulus` and owns the trial.
  // Its blanks use the plugin's own %%notation%%, which is passed through as
  // written rather than translated into anything of ExpVis's.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'cloze', 'x');
    // Doubled percents: this text goes through the same format, so what JS
    // receives is the plugin's own notation — ONE percent sign per marker,
    // which is what its source splits on. The docs' examples double it.
    t.components[0].text = 'The %%capital%% of France is %%Paris/Lyon%%.';
    t.components[0].button_text = 'Done';
    t.components[0].check_answers = true;
    t.components[0].case_sensitivity = false;
    var code = _compileExperiment({}).code;
    var trial = (code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/) || [''])[0];
    // a cloze with no blank at all: legal, but never what was meant
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t2 = findTrial(editor.selectedTrial);
    addComponent(t2.id, 'cloze', 'x');
    t2.components[0].text = 'No blanks here.';
    var bare = _compileExperiment({}).code;
    out['cloze page'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      plugin: /type: jsPsychCloze/.test(trial),
      // the %% notation reaches the file unchanged — it is the plugin's syntax,
      // including the / between two accepted answers
      notationKept: /%%capital%%/.test(trial) && /%%Paris\\/Lyon%%/.test(trial),
      paramsEmitted: /button_text: 'Done'/.test(trial) &&
                     /check_answers: true/.test(trial) &&
                     /case_sensitivity: false/.test(trial),
      // defaults are left out so jsPsych applies its own documented ones.
      // `stimulus` must be absent: this plugin has no such parameter.
      defaultsOmitted: trial.indexOf('allow_blanks') < 0 &&
                       trial.indexOf('stimulus') < 0,
      // a page with nothing to fill in says so rather than shipping silently
      // Doubled, because PROBE goes through a percent-format: this reaches JS
      // as two percent signs. And no bare percent ANYWHERE in this string,
      // comments included — a percent followed by a dash reads as a format
      // spec, and the probe dies before it ever runs.
      noBlankWarns: /has no %% blank/.test(bare),
    };
  })();
  // The second task plugin. Free-sort's `stimuli` is an ARRAY OF IMAGES — the
  // plugin's own parameter type, not HTML — so it holds pictures the way
  // animation holds frames, and the two share an uploader. It writes no
  // `response`: where each picture ended up is in `final_locations`.
  (function () {
    function build(stimuli) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      addComponent(t.id, 'freeSort', 'x');
      var c = t.components[0];
      if (stimuli) c.stimuli = stimuli;
      c.prompt = 'Sort these';
      c.sort_area_shape = 'square';
      c.stim_width = 80;
      var code = _compileExperiment({}).code;
      return {
        trial: (code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/) || [''])[0],
        code: code,
        assets: _compileExperiment({}).assets.map(function (a) { return a.path; })
      };
    }
    var full = build([{fileData: 'data:image/png;base64,AAAA', fileName: 'a.png'},
                      {fileData: 'data:image/png;base64,BBBB', fileName: 'b.png'}]);
    var trial = full.trial;
    var empty = build([]).code;
    out['free sort'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      plugin: /type: jsPsychFreeSort/.test(trial),
      // every picture is emitted, by path, in the order it was uploaded
      allImagesEmitted: /stimuli: \\['img\\/a.png', 'img\\/b.png'\\]/.test(trial),
      // and they reach the export bundle too
      assetsCarried: full.assets.length === 2 &&
                     full.assets.join(',') === 'img/a.png,img/b.png',
      // only what the researcher changed from the plugin's defaults is written,
      // so jsPsych applies its own documented values for the rest
      onlyChanged: /stim_width: 80/.test(trial) &&
                   /sort_area_shape: 'square'/.test(trial) &&
                   trial.indexOf('stim_height') < 0 &&
                   trial.indexOf('sort_area_height') < 0 &&
                   trial.indexOf('prompt_location') < 0,
      // it has neither a response nor a stimulus parameter
      noResponseOrStimulus: trial.indexOf('choices') < 0 &&
                            trial.indexOf('stimulus:') < 0,
      // an area with nothing to sort says so
      emptyWarns: /has no images/.test(empty),
    };
  })();
  // Audio and video run on their own plugins, as image does. Those plugins exist
  // for a reason the HTML path cannot match: they wait for the media before the
  // trial's clock starts. Their parameters are the plugin's own.
  (function () {
    function build(spec, setup) {
      resetEditor();
      addBlock('trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      spec.forEach(function (s) {
        addComponent(t.id, s[0], s[1]);
        var c = t.components[t.components.length - 1];
        Object.keys(s[2] || {}).forEach(function (k) { c[k] = s[2][k]; });
      });
      if (setup) setup(t);
      return (_compileExperiment({}).code.match(/var trials_trial_1 = \\{[\\s\\S]*?\\n\\};/)
        || [''])[0];
    }
    var KB = ['keyboard', 'r', {choices: ['f', 'j'], correctKey: 'f'}];
    var AUD = ['audio', 's', {fileData: 'data:audio/wav;base64,AAAA', fileName: 'tone.wav'}];
    var VID = ['video', 's', {fileData: 'data:video/mp4;base64,AAAA', fileName: 'clip.mp4'}];
    var IMG = ['image', 's', {fileData: 'data:image/png;base64,AAAA',
                              fileName: 'p.png', stimulus_width: 0}];
    var TXT = ['text', 's', {content: 'listen'}];
    var audio = build([AUD, KB], function (t) {
      t.components[0].trial_ends_after_audio = true;
      t.components[0].response_allowed_while_playing = false;
    });
    var video = build([VID, KB], function (t) {
      t.components[0].start = 2;
      t.components[0].stop = 5;
    });
    var image = build([IMG, KB]);
    // audio with something else on the screen: no plugin can do that, so it
    // falls back to HTML — and that fallback is the common case, not the rare one
    var fallback = build([AUD, TXT, KB]);
    out['audio and video'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      audioPlugin: /type: jsPsychAudioKeyboardResponse/.test(audio) &&
                   /stimulus: 'snd\\/tone.wav'/.test(audio),
      // the media plugin's own parameters, and only when they were changed
      audioParams: /trial_ends_after_audio: true/.test(audio) &&
                   /response_allowed_while_playing: false/.test(audio),
      videoPlugin: /type: jsPsychVideoKeyboardResponse/.test(video),
      // a video plugin's `stimulus` is an ARRAY; an audio plugin's is not
      videoStimulusIsArray: /stimulus: \\['vid\\/clip.mp4'\\]/.test(video),
      videoParams: /start: 2/.test(video) && /stop: 5/.test(video) &&
                   video.indexOf('controls') < 0 &&
                   video.indexOf('autoplay') < 0,
      // image is untouched by any of this
      imageStillItsOwn: /type: jsPsychImageKeyboardResponse/.test(image),
      // the HTML fallback carries the medium without a playback bar
      fallbackHasNoControls: /type: jsPsychHtmlKeyboardResponse/.test(fallback) &&
                             fallback.indexOf('<audio ') >= 0 &&
                             fallback.indexOf('controls') < 0,
    };
  })();
  // A `data` override must keep the scoring key. The on_finish the editor
  // generates reads data.correct_response; an override that drops it leaves an
  // experiment that runs, writes a `correct` column, and marks every row false.
  // The researcher's own correct_response wins; anything that is not a literal
  // the compiler can rewrite is merged at run time instead.
  (function () {
    function compileWithData(src) {
      resetEditor();
      addBlock('Trials');
      addTrial(editor.blocks[0].id);
      var t = findTrial(editor.selectedTrial);
      addComponent(t.id, 'text', 's');
      addComponent(t.id, 'keyboard', 'r');
      t.components[1].choices = ['a', 'l'];
      t.components[1].correctKey = 'a';
      t.custom = [{name: 'data', src: src}];
      return _compileExperiment({}).code;
    }
    function dataLine(src) {
      var m = compileWithData(src).match(/^\\s*data: .*$/m);
      return m ? m[0].trim() : '';
    }
    var plain = dataLine("{stimulus_type: 'congruent'}");
    out['data override keeps the scoring key'] = {
      factored: false, uniform: false, trialsPerNode: [], expectParams: [],
      noTokens: true,
      merged: plain,
      keyCount: (plain.match(/correct_response\\s*:/g) || []).length,
      researcherWins: dataLine("{correct_response: 'x'}"),
      emptyLiteral: dataLine("{}"),
      notALiteral: dataLine('myData'),
      // the researcher's own line breaks have to survive the merge
      multilineKept: /data: \\{[^}]*\\n[^}]*\\}/.test(
        compileWithData("{\\n    a: 1,\\n    b: 2\\n  }"))
    };
  })();
  // The custom-parameter controls take an expression, and the common mistake is
  // a statement. The message has to name it: "Unexpected token 'if'" is what the
  // engine says, not what the researcher needs to hear.
  (function () {
    var said = null;
    var realAlert = window.alert;
    window.alert = function (m) { said = String(m); };
    var errStatement = _jsExpressionError('if (x) { return true; }', 'loop_function');
    var errFunction = _jsExpressionError('function (data) { return false; }', 'loop_function');
    var errArrow = _jsExpressionError('(data) => data.values().length < 3', 'loop_function');
    window.alert = realAlert;
    out['expression validation'] = {
      factored: false, uniform: false, trialsPerNode: [], expectParams: [],
      noTokens: true,
      rejectsStatement: !!errStatement,
      namesTheValue: !!errStatement && errStatement.indexOf('loop_function: <your text>') >= 0,
      suggestsAFunction: !!errStatement && errStatement.indexOf('function (data)') >= 0,
      acceptsFunction: !errFunction,
      acceptsArrow: !errArrow
    };
  })();
  // The run has to leave a durable record. displayData() only draws a table;
  // the export used to end there, so closing the tab discarded everything.
  (function () {
    var code = _compileExperiment({}).code;
    // localSave lives on DataCollection: jsPsych.data.get().localSave(...)
    var call = (code.match(/jsPsych\\.data\\.get\\(\\)\\.localSave\\(([^\\n]*)/) || [])[1] || '';
    out['data is saved'] = {
      factored: false, uniform: false, trialsPerNode: [], expectParams: [],
      noTokens: true,
      callsLocalSave: !!call,
      // format first: localSave(format, filename), not the other way round
      formatFirst: /^\\s*'csv'\\s*,/.test(call),
      hasFilename: /\\.csv'/.test(call)
    };
  })();
  // Two conditions whose fixations jitter over different ranges. The jittered
  // duration is a value spanning several lines, and a table row is one line, so
  // factoring used to emit `{trial_duration: trial_duration: function () { …`
  // — JavaScript that does not parse, from an experiment the GUI accepts.
  run('jittered fixations, run as one procedure', [
    [['fixation', {trial_duration: 500, durationMin: 500, durationMax: 900, durationStep: 200}]],
    [['fixation', {trial_duration: 600, durationMin: 600, durationMax: 1000, durationStep: 200}]]
  ], {conditions: true});

  // Node-level parameters, set the way the block settings dialog sets them.
  // `nodeParams` is the exact text emitted between `timeline` and the closing
  // brace, so the mapping from a control to a jsPsych parameter is pinned here
  // rather than being re-checked by hand in a browser.
  function runSampled(label, spec, blockProps, perTrial, noMode) {
    resetEditor();
    addBlock('trials');
    var made = build(editor.blocks[0].id, spec);
    // Per-condition fields (group, weight) belong on the trials the editor
    // made, not on the spec they were built from.
    (perTrial || []).forEach(function (props, i) {
      Object.keys(props).forEach(function (k) { made[i][k] = props[k]; });
    });
    if (!noMode) editor.blocks[0].conditions = true;
    Object.keys(blockProps).forEach(function (k) { editor.blocks[0][k] = blockProps[k]; });
    var code = _compileExperiment({}).code;
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      nodeParams: (code.match(/^  (?:sample|randomize_order|repetitions):.*$/gm) || [])
        .map(function (s) { return s.trim().replace(/,$/, ''); }),
      trialsPerNode: inspectStructure(code).trialsPerNode,
      observedParams: inspectStructure(code).observedParams,
      expectParams: [],
      noTokens: code.indexOf('@@') < 0
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
  // Sampling belongs to a variable table. Without the mode there is no table,
  // and jsPsych would ignore the parameter — so it must not be emitted.
  runSampled('sampling without the mode', three,
    {sample: {type: 'with-replacement', size: 1}}, null, true);
  // repetitions stands on its own — it repeats the block whatever it holds.
  runSampled('repetitions on a ragged block', [
    [['text', {content: 'A'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'B'}]]
  ], {repetitions: 2});
  // …but sampling has nothing to draw from without a table, and jsPsych would
  // ignore it, so it must not be emitted. Gated the same way the badge is.
  // Layout Preview draws the device box at its real pixel size, so a desktop
  // preset is wider than the window drawing it. The zoom has to make the whole
  // layout visible without lying about its scale.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    editor.device = {name: 'Desktop', icon: '', w: 1280, h: 720};

    expandPreview();
    var box = document.getElementById('exp-prev-zoom');
    var frame = document.getElementById('exp-prev-frame');
    var scroll = document.getElementById('exp-prev-scroll');
    var overlay = document.getElementById('exp-prev-close');
    var ov = overlay && overlay.closest('div[style*="z-index:2200"]');

    var devW = editor.device.w, devH = editor.device.h;
    var availW = scroll.clientWidth - 48;
    var availH = scroll.clientHeight - 48;
    var z0 = Number(box.value) / 100;
    var frameW0 = frame.offsetWidth;

    // Moving it has to move the picture. Deliberately two values that cannot
    // coincide and cannot coincide with the fitted default either — asserting
    // "smaller than the default" assumes what the default came out as, and the
    // window it is computed in is not ours to predict.
    box.value = '30';
    box.oninput();
    var wLow = frame.offsetWidth;
    box.value = '90';
    box.oninput();
    var wHigh = frame.offsetWidth;
    var zLow = 0.3, zHigh = 0.9;

    // and Fit has to come back
    document.getElementById('exp-prev-fit').onclick();
    var zFit = Number(box.value) / 100;

    if (ov) ov.remove();

    // A device SMALLER than the area, which is the only way the cap is
    // exercised: with a large device the fit is already below 100%%, so an
    // uncapped scale-up would never show. Without this the assertion below
    // passes for the wrong reason.
    // Deliberately smaller than the preview area in BOTH directions — not a
    // device anyone ships, but the fit is what is under test here, and a
    // two-dimension fit is the only way to reach the cap. (A real phone is
    // taller than this window, so it would still be scaled down.)
    editor.device = {name: 'Tiny', icon: '', w: 320, h: 240};
    expandPreview();
    var boxS = document.getElementById('exp-prev-zoom');
    var ovS = document.getElementById('exp-prev-close');
    var ovWrap = ovS && ovS.closest('div[style*="z-index:2200"]');
    var zSmall = Number(boxS.value) / 100;
    var scrollS = document.getElementById('exp-prev-scroll');
    var availSmallW = scrollS.clientWidth - 48;
    var availSmallH = scrollS.clientHeight - 48;
    if (ovWrap) ovWrap.remove();

    out['layout preview zoom'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      hasASlider: !!box && box.type === 'range',
      rangeIsSane: Number(box.min) < 100 && Number(box.max) > 100,
      // the whole point: at the default, the device box fits in the area
      defaultFitsWidth: devW * z0 <= availW + 1,
      defaultFitsHeight: devH * z0 <= availH + 1,
      // it actually did something — a 1280-wide box in a narrower area cannot
      // be shown at 100%% and fit
      defaultIsBelowFullWhenNeeded: (devW <= availW && devH <= availH) || z0 < 1,
      // The DEFAULT is never above 100%%: a phone blown up to fill a desktop
      // window stops being a picture of what the participant sees. Sliding up
      // past it afterwards is the researcher's call. The small device is the
      // case that exercises it — the area is bigger than the device there.
      defaultNeverAboveFull: z0 <= 1 && zFit <= 1 && zSmall === 1,
      // …and the fixture really is roomy enough for the cap to be the thing
      // under test rather than the fit
      smallDeviceWouldHaveRoomToGrow: availSmallW > 320 && availSmallH > 240,
      // the painted footprint follows the zoom, so the scroll area is honest
      frameFollowsZoom: Math.abs(frameW0 - devW * z0) <= 1 &&
                        Math.abs(wLow - devW * zLow) <= 1 &&
                        Math.abs(wHigh - devW * zHigh) <= 1,
      sliderZoomsBothWays: wHigh > wLow,
      fitReturnsToTheDefault: zFit === z0
    };
  })();

  // A model name is the provider's fact, not ours, and the version of it
  // written into this file has a shelf life. These assert the three things
  // that keep an expired copy from becoming a dead end: the field takes
  // anything, the list is only a suggestion, and a refusal says what to do.
  (function () {
    resetEditor();
    // The dialog is built by JS, so it has to be opened to be inspected.
    showAIGenerate();
    var field = document.getElementById('ai-model');
    var list = document.getElementById('ai-model-list');
    var selects = document.querySelectorAll('select#ai-model');
    var suggestions = list ? list.querySelectorAll('option').length : 0;
    var overlay = document.querySelector('div[style*="z-index:3000"]');

    var openai = _aiProviders.openai;
    var refused = _aiErrorMessage(404, 'model not found', 'gpt-1-nope', openai);
    var broken = _aiErrorMessage(500, 'internal error', 'gpt-1-nope', openai);
    var unauth = _aiErrorMessage(401, 'bad key', 'gpt-1-nope', openai);

    // A provider with nowhere to ask must say so rather than throw.
    var customErr = null;
    _fetchModelList('custom', 'k', function (e) { customErr = e; });

    if (overlay) overlay.remove();

    out['an expired model list is not a dead end'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // a text field, and specifically not the closed list that made a stale
      // entry unescapable
      isATextField: !!field && field.tagName === 'INPUT' &&
                    field.getAttribute('list') === 'ai-model-list',
      noClosedSelect: selects.length === 0,
      // the built-in list is still offered, as suggestions
      suggestionsOffered: suggestions > 0,
      defaultsToSomething: !!field && field.value.length > 0,
      // a refusal names the model, points at the current list, and says how to
      // get it — rather than a bare 404
      refusalNamesTheModel: refused.indexOf('gpt-1-nope') >= 0,
      refusalPointsAtTheList: refused.indexOf(openai.modelsPageUrl) >= 0,
      refusalOffersTheFix: refused.indexOf('Model box') >= 0,
      // a failure that is NOT about the model must not claim to be
      unrelatedErrorStaysPlain: broken.indexOf('gpt-1-nope') < 0 &&
                                broken.indexOf('API Error 500') >= 0,
      authErrorSaysSo: unauth.indexOf('rejected') >= 0,
      // and a provider with no list endpoint fails softly
      customHasNoList: !!customErr && customErr.message.indexOf('type the name') >= 0
    };
  })();

  // DataPipe is a PACKAGING choice, not a different experiment: the timeline
  // gains a save trial and the file has to load the plugin. The behaviour suite
  // runs the timeline and can say what it sends; the <script> tag that makes
  // `jsPsychPipe` exist at all is only visible in the built file, which is what
  // this checks. Nothing here reaches pipe.jspsych.org.
  (function () {
    resetEditor();
    addBlock('trials');
    addTrial(editor.blocks[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    var base = _compileExperiment({});
    var plainHtml = _buildJsPsychHTML(base.code, base.usedPlugins);
    var r = _compileExperiment({dataPipe: {experimentId: 'abc123'}});
    var dpHtml = _buildJsPsychHTML(r.code, r.usedPlugins);
    out['datapipe is a packaging choice'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      // the default export must not carry any of it
      defaultHasNoPipeScript: plainHtml.indexOf('plugin-pipe') < 0,
      defaultHasNoSaveTrial: plainHtml.indexOf('jsPsychPipe') < 0,
      // …and the DataPipe build must carry both halves
      loadsThePlugin: dpHtml.indexOf('@jspsych-contrib/plugin-pipe@0.6.0') >= 0,
      carriesTheTrial: dpHtml.indexOf('type: jsPsychPipe') >= 0 &&
                       dpHtml.indexOf("experiment_id: 'abc123'") >= 0,
      // The id is researcher input, so it goes through the same escaper as
      // everything else. Built with char codes rather than written as a
      // literal: this string passes through the Python that defines PROBE and
      // through the JS that runs it, and a backslash written here arrives at
      // the browser one level short of what it looks like. 39 is the quote
      // character, 92 is the backslash.
      idIsEscaped: (function () {
        var quoteId = 'a' + String.fromCharCode(39) + 'b';
        var escapedId = 'a' + String.fromCharCode(92, 39) + 'b';
        return _compileExperiment({dataPipe: {experimentId: quoteId}}).code
          .indexOf("experiment_id: '" + escapedId + "'") >= 0;
      })()
    };
  })();

  runSampled('sample ignored without a table', [
    [['text', {content: 'A'}], ['keyboard', {choices: ['a']}]],
    [['text', {content: 'B'}]]
  ], {sample: {type: 'with-replacement', size: 1}, repetitions: 2});

  // The AI's prompt surface is three texts that have to agree with each other
  // and with the editor. Rewriting the system prompt alone left the quick-fill
  // templates and the optimiser still asking for randomize / delay / branch /
  // loop — so one request carried a system prompt forbidding exactly what its
  // own user message requested. Nothing caught it, because all three lived
  // inside showAIGenerate where no test could reach them. They are top-level
  // now, and this asserts what the rewrites kept missing.
  (function () {
    var dev = {w: 1280, h: 720};
    // The four deleted components, plus delay. Their names belong in the system
    // prompt's FORBIDDEN list and nowhere else.
    var DEAD = ['randomize', 'branch', 'variable', 'loop', 'delay'];
    // Whole identifiers only. A substring test calls `randomize_question_order`
    // — a real jsPsych survey parameter — a mention of the deleted `randomize`
    // component, and `_` is part of an identifier, so it is not a boundary.
    function namesAny(text) {
      var words = String(text).toLowerCase().split(/[^a-z0-9_]+/);
      return DEAD.filter(function (d) { return words.indexOf(d) >= 0; });
    }
    // `to` is searched AFTER `from`: the optimiser's own text has a `)` in item
    // 1, so looking for the first one in the whole string closes the slice
    // before it opens.
    function between(text, from, to) {
      var i = text.indexOf(from);
      if (i < 0) return '';
      var j = text.indexOf(to, i + from.length);
      return j > i ? text.slice(i + from.length, j) : '';
    }
    var tplHits = [];
    Object.keys(_aiTemplates).forEach(function (k) {
      var hits = namesAny(_aiTemplates[k]);
      if (hits.length) tplHits.push(k + '=' + hits.join('+'));
    });
    var meta = _aiMetaPrompt('a stroop task', dev);
    var sys = _aiSystemPrompt(dev);
    // The vocabulary the optimiser hands on as the required component types,
    // and the schema the generator is told to emit. Both are enumerations, so a
    // deleted name in either is an instruction, not a caveat.
    var metaTypes = between(meta, 'Required component types (', ')');
    var schema = between(sys, 'Full Component Schema', '【Color Rules');
    out['ai prompts name no retired mechanism'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      templatesAreClean: tplHits.length === 0,
      metaTypesAreReal: metaTypes.length > 0 && namesAny(metaTypes).length === 0,
      schemaHasNoRetiredType: schema.length > 0 && namesAny(schema).length === 0,
      // …and the prohibition itself survives, so this cannot be satisfied by
      // deleting the FORBIDDEN section instead of fixing the templates. `delay`
      // is not required here: that section forbids the four components, and
      // names the blank pause by what it does rather than by the old name.
      stillForbidden: ['loop', 'branch', 'randomize', 'variable'].every(function (d) {
        return namesAny(between(sys, 'FORBIDDEN', '❌ JSON trailing')).indexOf(d) >= 0;
      }),
      // every template key still has a button in the panel
      templatesMatchButtons: ['stroop', 'simon', 'flanker', 'custom'].every(function (k) {
        return typeof _aiTemplates[k] === 'string' && _aiTemplates[k].length > 40;
      })
    };
  })();

  // The prompt teaches a schema; the editor creates components from another.
  // They are the same schema or the model writes fields that do not exist, and
  // they had already drifted once — `keyboard` gained six feedback fields and
  // the prompt never learned them, so an in-trial feedback experiment could not
  // be described. Diffed in both directions, and the failure names the field.
  (function () {
    var sys = _aiSystemPrompt({w: 1280, h: 720});
    var i = sys.indexOf('Full Component Schema');
    var j = sys.indexOf('【Color Rules', i);
    var schema = (i >= 0 && j > i) ? sys.slice(i, j) : '';

    // Top-level keys of one `{type:…}` literal. Strings are stepped over whole,
    // so a colon inside a value cannot be read as the start of a key, and
    // bracket depth keeps the nested `questions:[{…}]` out of the result.
    function topLevelKeys(body) {
      var keys = [], depth = 0, k = 0;
      while (k < body.length) {
        var ch = body.charAt(k);
        if (ch === '"') {
          k++;
          while (k < body.length && body.charAt(k) !== '"') {
            if (body.charCodeAt(k) === 92) k++;   // backslash: skip the escape
            k++;
          }
          k++;
          continue;
        }
        if (ch === '{' || ch === '[') { depth++; k++; continue; }
        if (ch === '}' || ch === ']') { depth--; k++; continue; }
        if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
          var e = k;
          while (e < body.length && /[A-Za-z0-9_$]/.test(body.charAt(e))) e++;
          var name = body.slice(k, e);
          var c = e;
          while (c < body.length && body.charAt(c) === ' ') c++;
          if (body.charAt(c) === ':') keys.push(name);
          k = e;
          continue;
        }
        k++;
      }
      return keys;
    }

    var taught = {};
    // The split argument is DOUBLED on purpose: PROBE goes through a Python
    // percent-format, where an undoubled escape becomes a real newline in the
    // JS source, cutting the statement in half and stopping the editor from
    // loading at all. See the escape traps in HANDOFF.
    schema.split('\\n').forEach(function (line) {
      if (line.indexOf('{type:') < 0 || line.indexOf(':') < 0) return;
      var m = line.match(/([A-Za-z]+):\s*\{type:"([A-Za-z]+)"/);
      if (!m) return;
      var body = line.slice(line.indexOf('{type:'));
      var cut = body.indexOf('//');
      if (cut >= 0) body = body.slice(0, cut);
      body = body.slice(0, body.lastIndexOf('}'));
      taught[m[2]] = (taught[m[2]] || []).concat(topLevelKeys(body));
    });

    // `type` and `cat` are the two the defaults table does not carry: the table
    // is keyed by type, and addComponent stamps `cat` on afterwards.
    var OUTSIDE = ['type', 'cat'];
    var drift = [];
    Object.keys(taught).forEach(function (t) {
      var real = _compDefaults[t];
      if (!real) { drift.push(t + ': not a component'); return; }
      var realKeys = Object.keys(real).filter(function (x) { return OUTSIDE.indexOf(x) < 0; });
      taught[t].forEach(function (x) {
        if (OUTSIDE.indexOf(x) < 0 && realKeys.indexOf(x) < 0) {
          drift.push(t + '.' + x + ': taught, not real');
        }
      });
      realKeys.forEach(function (x) {
        if (taught[t].indexOf(x) < 0) drift.push(t + '.' + x + ': real, not taught');
      });
    });
    // …and nothing in the editor is missing from the prompt altogether
    Object.keys(_compDefaults).forEach(function (t) {
      if (!taught[t]) drift.push(t + ': no schema line at all');
    });

    // The five block controls the compiler reads. The prompt has to name the
    // same five, or "repeat this 48 times" has no spelling the model can use.
    var controls = ['repetitions', 'randomize_order', 'sample', 'loop', 'cond', 'conditions'];
    var missingControls = controls.filter(function (c) {
      return sys.indexOf(c) < 0;
    });
    // …and every sample type the settings dialog can emit
    var sampleTypes = ['without-replacement', 'with-replacement',
                       'fixed-repetitions', 'alternate-groups', 'custom'];
    var missingSample = sampleTypes.filter(function (t) { return sys.indexOf(t) < 0; });
    // the condition operators, as the dialog spells them
    var ops = ['is not', 'more than', 'at most', 'less than', 'at least'];
    var missingOps = ops.filter(function (o) { return sys.indexOf(o) < 0; });

    out['the prompt teaches the schema the editor has'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      schemaFound: schema.length > 0,
      typesCovered: Object.keys(taught).length === Object.keys(_compDefaults).length,
      noDrift: drift.length === 0,
      // reported so a failure says which field, not just that something moved
      drift: drift.join('; '),
      controlsNamed: missingControls.length === 0,
      sampleTypesNamed: missingSample.length === 0,
      operatorsNamed: missingOps.length === 0
    };
  })();

  // The prompt now teaches block settings, so the other half of that promise
  // has to hold: a block carrying them must survive the import an AI answer
  // goes through, and reach the compiler. migratePos runs first on import and
  // rewrites blocks, so this is where they would be lost.
  (function () {
    function imported(block) {
      resetEditor();
      editor.blocks = [block];
      migratePos();
      return _compileExperiment({}).code;
    }
    // TWO trials of one shape, not one: a table of a single row is not a table,
    // so _factorBlock refuses it and `conditions: true` has nothing to fold.
    // This is the shape the prompt tells the model to write — one trial per
    // condition.
    function trial(word) {
      return {components: [{type: 'text', content: word, cat: 's'},
                           {type: 'keyboard', choices: ['a', 'l'], correctKey: 'a', cat: 'r'}]};
    }
    var SHAPE = [trial('RED'), trial('BLUE')];
    function ph(extra) {
      var p = {name: 'Trials', timeline: JSON.parse(JSON.stringify(SHAPE))};
      Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
      return p;
    }
    var reps = imported(ph({repetitions: 48, randomize_order: true, conditions: true}));
    var samp = imported(ph({sample: {type: 'without-replacement', size: 24}, conditions: true}));
    var loop = imported(ph({loop: {field: 'correct', op: 'is', value: 'false'}}));
    var cond = imported(ph({cond: {field: 'correct', op: 'is not', value: 'true'}}));
    var plain = imported(ph({}));
    // The gate itself. `sample` and `randomize_order` are only emitted for a
    // condition table, so a block that asks for them without `conditions: true`
    // gets neither — silently. The prompt has to say so, which is why the two
    // are documented as needing it.
    var ungated = imported(ph({randomize_order: true,
                               sample: {type: 'without-replacement', size: 24}}));
    out['block settings survive the import'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      repetitionsKept: /repetitions: 48/.test(reps),
      randomizeOrderKept: /randomize_order: true/.test(reps),
      sampleKept: /sample: \\{type: 'without-replacement', size: 24\\}/.test(samp),
      loopKept: /loop_function: function \\(data\\)/.test(loop),
      condKept: /conditional_function: function \\(\\)/.test(cond),
      // and a block that asked for none of them still emits none
      plainStaysPlain: plain.indexOf('repetitions') < 0 &&
                       plain.indexOf('randomize_order') < 0 &&
                       plain.indexOf('loop_function') < 0 &&
                       plain.indexOf('conditional_function') < 0,
      // without the opt-in, the two that need a table stay out — the gate the
      // prompt documents
      gatedOnConditions: ungated.indexOf('sample') < 0 &&
                         ungated.indexOf('randomize_order') < 0,
      // …while the two that do not need one still come through without it
      loopAndCondUngated: /loop_function: function \\(data\\)/.test(loop) &&
                          /conditional_function: function \\(\\)/.test(cond)
    };
  })();

  // Anthropic does not read `Authorization`; it wants `x-api-key`, and a call
  // from a page is refused at the preflight unless the caller opts in. The
  // provider used to hand its key to the shared `Authorization` path, so every
  // Anthropic request was wrong in two ways at once.
  (function () {
    var h = _aiProviders.anthropic.requestHeaders('sk-ant-test');
    var others = Object.keys(_aiProviders).filter(function (k) {
      var p = _aiProviders[k];
      return k !== 'anthropic' && !p.isCustom;
    });
    // The headers above are only correct if _callAI actually asks for them.
    // Building them is synchronous — the promise chain starts after `fetch` is
    // called — so a stubbed fetch captures the real request without a network
    // call, and without an await.
    var sent = null;
    var realFetch = window.fetch;
    localStorage.setItem('ve_ai_key_anthropic', 'sk-ant-test');
    window.fetch = function (url, init) {
      sent = {url: url, headers: init.headers};
      return Promise.reject(new Error('stub'));
    };
    try {
      _callAI('anthropic', 'claude-opus-5', [{role: 'user', content: 'x'}], 16)
        .catch(function () {});
    } catch (e) { /* reported through `sent` */ }
    window.fetch = realFetch;
    out['ai provider headers'] = {
      factored: false, uniform: false, trialsPerNode: [],
      observedParams: [], expectParams: [], noTokens: true,
      anthropicUsesApiKey: h['x-api-key'] === 'sk-ant-test',
      // no stray Authorization — the key must not go out twice, in the wrong one
      anthropicSendsNoAuthorization: !('Authorization' in h),
      // and the request that really goes out carries them
      requestGoesToTheRightPlace: !!sent && sent.url === _aiProviders.anthropic.endpoint,
      requestCarriesApiKey: !!sent && sent.headers['x-api-key'] === 'sk-ant-test',
      requestOptsInToBrowser: !!sent &&
        sent.headers['anthropic-dangerous-direct-browser-access'] === 'true',
      browserAccessOptIn: h['anthropic-dangerous-direct-browser-access'] === 'true',
      versionPinned: h['anthropic-version'] === '2023-06-01',
      // the rest still take the Bearer path they share
      restUseBearer: others.every(function (k) {
        var p = _aiProviders[k];
        return typeof p.authHeader === 'function' && !p.requestHeaders;
      }),
      // and the header is never empty for a provider that uses the shared path
      // Every provider left takes the key the same way. This used to exempt
      // gemini, which passed its key as a URL parameter and so had an empty
      // Authorization header; gemini is gone and so is the exemption.
      noEmptyBearer: others.every(function (k) {
        return _aiProviders[k].authHeader('k') === 'Bearer k';
      }),
      // Two entries with the same label in one dropdown is a real way to make a
      // researcher pick the wrong one — `openai` and a custom endpoint labelled
      // "OpenAI-Compatible" was exactly that.
      namesAreDistinct: (function () {
        var seen = {}, dup = [];
        Object.keys(_aiProviders).forEach(function (k) {
          var n = _aiProviders[k].name;
          if (seen[n]) dup.push(n);
          seen[n] = 1;
        });
        return dup.length === 0;
      })()
    };
  })();
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
    var block = code.indexOf('// ── ');
    var inPreload = preload >= 0 ? code.slice(preload, block) : '';
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
      preloadFirst: preload >= 0 && block >= 0 && preload < block,
      // every path the trials use is in the preload list
      allPreloaded: referenced.every(function (p) { return preloaded.indexOf(p) >= 0; }),
      // and nothing is preloaded that no trial uses
      noExtraPreloads: preloaded.every(function (p) { return referenced.indexOf(p) >= 0; }),
      noInlineData: code.indexOf('data:') < 0,
      noOldIndirection: code.indexOf('EXP_MEDIA_') < 0,
      noTokens: code.indexOf('@@') < 0 && inline.indexOf('@@') < 0,
      inlineHasData: inline.indexOf('data:') >= 0 && inline.indexOf('img/') < 0,
      preloadTagBeforeImages: (function () {
        var html = generateCode();
        var p = html.indexOf('plugin-preload');
        var i = html.indexOf('plugin-image-');
        return p >= 0 && (i < 0 || p < i);
      })(),
    };
  }
  run('image trial', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';",
    ['img/blue.png']);
  run('image in a later block', "addBlock('instructions'); addTrial(editor.blocks[0].id);"
    + "addComponent(findTrial(editor.selectedTrial).id,'text','s');"
    + "addBlock('trials'); addTrial(editor.blocks[1].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';",
    ['img/blue.png']);
  run('image + button', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'button','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';"
    + "t.components[1].choices=['Yes','No'];",
    ['img/blue.png']);
  // An image mixed with anything else leaves the dedicated image plugin for the
  // HTML path, where the asset is written into a tag via a compiler token rather
  // than passed as `stimulus`. That token was the one nothing exercised.
  run('image + text (HTML path)', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'text','s');"
    + "addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='face.png';"
    + "t.components[1].content='Is this Alex?';"
    + "t.components[2].choices=['y','n'];",
    ['img/face.png']);
  // Each kind gets its own folder, so a name collision across kinds is fine.
  run('audio and video', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'audio','s'); addComponent(t.id,'video','s');"
    + "addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:audio/mp3;base64,AAAA';"
    + "t.components[0].fileName='beep.mp3';"
    + "t.components[1].fileData='data:video/mp4;base64,BBBB';"
    + "t.components[1].fileName='clip.mp4';",
    ['snd/beep.mp3', 'vid/clip.mp4']);
  run('animation frames', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial); addComponent(t.id,'animation','r');"
    + "t.components[0].frames=[{fileData:'data:image/png;base64,AAAA',fileName:'f1.png'},"
    + "{fileData:'data:image/png;base64,BBBB',fileName:'f2.png'}];",
    ['img/f1.png', 'img/f2.png']);
  // Two different files that share a name must both survive the archive, so the
  // second gets a suffix rather than overwriting the first.
  run('same file name, different bytes', "addBlock('trials');"
    + "['AAAA','BBBB'].forEach(function (d, i) {"
    + "addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,'+d;"
    + "t.components[0].fileName='face.png';"
    + "t.components[1].choices=['f','j']; });",
    ['img/face.png', 'img/face_2.png']);
  // The same file twice is one archive entry, one path, one preload entry.
  run('same file used twice', "addBlock('trials');"
    + "['x','y'].forEach(function () {"
    + "addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='blue.png';"
    + "t.components[1].choices=['f','j']; });",
    ['img/blue.png']);
  // A name with characters that cannot go in a path or a JS string.
  run('awkward file name', "addBlock('trials'); addTrial(editor.blocks[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName=\\\"my face (1)'s.png\\\";",
    ['img/my_face_1_s.png']);
  // A bracket before the extension must not leave a trailing underscore.
  run('bracket before extension', "addBlock('trials'); addTrial(editor.blocks[0].id);"
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
    addBlock('trials');
    addTrial(editor.blocks[0].id);
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
      // A trial with nothing to show and nothing to ask is left out entirely
      // rather than run as a blank screen.
      // A trial of several jsPsych trials has no declaration of its own any
      // more — its segments are spliced into the node's timeline — so what says
      // it was emitted is that the node holds them.
      emitted: inspectStructure(code).trialsPerNode.some(function (n) { return n; }),
      // How many jsPsych trials it became: a timed segment is one of its own,
      // and the response trial is another.
      parts: (trial.match(/type: jsPsych/g) || []).length,
      // The plugin concatenates this value, so it has to be present and a string.
      hasStimulus: /^\\s*(stimulus|preamble): /m.test(trial),
      emptyStimulus: /^\\s*(stimulus|preamble): ''/m.test(trial),
      prompt: (trial.match(/^\\s*prompt: (.*?),?$/m) || [null, null])[1],
      saysUndefined: code.indexOf('undefined') >= 0,
      noTokens: code.indexOf('@@') < 0,
    };
  }
  // Nothing at all: what "+ Add Trial" leaves behind. Not a trial.
  run('no components', []);
  // A fixation is timed; it does not need a screen after it. This used to emit a
  // trailing blank "press any key", so a 500ms cross became a cross then a wait.
  run('fixation only', [['fixation', {trial_duration: 500}]]);
  run('two fixations', [['fixation', {trial_duration: 500}], ['fixation', {trial_duration: 300}]]);
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

// Every mechanism on the jsPsych timeline page, checked as present or as
// deliberately absent. "ExpVis does not do this" is then an executable fact
// rather than a sentence in a document, and adding one by accident fails here.
//
// https://shaobin-jiang.github.io/jsPsych-Chinese-Documentation/v8/overview/timeline/
//
// The `why` on an absent case is the reason it is absent, so the assertion is
// not mistaken later for an oversight.
function timelineDocCases() {
  var out = {};
  function build(setup) { resetEditor(); eval(setup); return _compileExperiment({}).code; }

  // A block of two homogeneous trials run as one procedure, with every node
  // parameter ExpVis can set. Exercises the timeline_variables half of the page.
  function sampled(sample, extra) {
    return build(
      "addBlock('Trials');" +
      "['RED','BLUE'].forEach(function (w, i) {" +
      "  addTrial(editor.blocks[0].id);" +
      "  var t=findTrial(editor.selectedTrial);" +
      "  addComponent(t.id,'text','s'); addComponent(t.id,'keyboard','r');" +
      "  t.components[0].content=w; t.components[1].choices=['a','l'];" +
      "  t.components[1].correctKey='a'; t.weight=i+1;" +
      "});" +
      "editor.blocks[0].conditions = true;" +
      (sample ? "editor.blocks[0].sample = " + sample + ";" : "") +
      (extra || ""));
  }
  var rich = sampled("{type:'with-replacement', size:1}",
    "editor.blocks[0].randomize_order=true; editor.blocks[0].repetitions=4;");
  var withoutReplacement = sampled("{type:'without-replacement', size:2}");
  var fixedReps = sampled("{type:'fixed-repetitions', size:3}");
  var custom = sampled("{type:'custom', fn:'function (order) { return order; }'}");
  var alternate = sampled("{type:'alternate-groups', randomizeGroupOrder:true}");
  // A fixation with jitter — the one dynamic parameter ExpVis emits.
  var jitter = build(
    "addBlock('Trials'); addTrial(editor.blocks[0].id);" +
    "var t=findTrial(editor.selectedTrial); addComponent(t.id,'fixation','s');" +
    "t.components[0].trial_duration=500; t.components[0].durationMin=500;" +
    "t.components[0].durationMax=900; t.components[0].durationStep=200;" +
    "addComponent(t.id,'text','s');");
  var plain = build("addBlock('Trials'); addTrial(editor.blocks[0].id);" +
    "var t=findTrial(editor.selectedTrial); addComponent(t.id,'text','s');" +
    "addComponent(t.id,'keyboard','r');");

  // A block carrying both node conditions, so the loop_function /
  // conditional_function checks below have something to find. Without it they
  // would pass on a sample that deliberately contains neither — which is what
  // they used to do.
  var conditions = build(
    "addBlock('Trials'); addTrial(editor.blocks[0].id);" +
    "var t=findTrial(editor.selectedTrial); addComponent(t.id,'text','s');" +
    "addComponent(t.id,'keyboard','r');" +
    "t.components[1].choices=['a','l']; t.components[1].correctKey='a';" +
    "editor.blocks[0].repetitions=4;" +
    "editor.blocks[0].loop={field:'correct',op:'is',value:'true',cap:10};" +
    "editor.blocks[0].cond={field:'correct',op:'is',value:'true'};");
  var all = [rich, withoutReplacement, fixedReps, custom, alternate, jitter, plain,
             conditions].join('\\n');
  var shape = nodeShape(rich);
  var NODE_KEYS = ['randomize_order', 'repetitions', 'sample', 'timeline', 'timeline_variables'];

  var section = '';
  // `selfCheck` marks a case that tests one of the checks above rather than a
  // mechanism on the page. It is asserted like any other and kept out of the
  // generated coverage table, which is about jsPsych, not about this file.
  // `present` may be true, false, or 'byhand' — the editor does not write it,
  // but the researcher can, by writing a parameter. It asserts like `false`
  // (the editor must not emit it on its own) and renders differently: calling a
  // reachable mechanism "not done" understates what the tool can express.
  function check(id, label, present, test, why, selfCheck) {
    var kind = present === 'byhand' ? 'byhand' : (present ? 'present' : 'absent');
    out[id] = {label: label, section: section, expected: kind,
               found: !!test, why: why || '', self: !!selfCheck};
  }

  section = '创建实验 · 时间线';
  check('run', 'timeline array + jsPsych.run', true,
    /var timeline = \\[\\];[\\s\\S]*jsPsych\\.run\\(timeline\\);/.test(all));
  check('type', 'type selects the plugin', true, /type: jsPsych/.test(all));
  section = '单个试次';
  check('trial', 'a trial is an object', true, /var \\w+ = \\{/.test(all));
  check('params', 'plugin parameters (stimulus …)', true, /stimulus:/.test(all));
  section = '多个试次';
  // `false` because the editor genuinely cannot write trials that way — and that
  // is a difference in how the FILE READS, not in what it runs. The why below
  // says so, because the label alone would look like a capability gap.
  check('pushtrials', 'multiple trials as successive timeline.push()', false,
    /timeline\\.push\\(\\w*_trial_\\d+\\)/.test(all),
    'each block becomes one node and that node is pushed once; pushing the trials ' +
    'individually describes the same experiment, so this is a difference in how ' +
    'the file reads rather than in what it runs');
  section = '嵌套时间线';
  check('nested', 'an object with its own timeline', true, /timeline: \\[/.test(all));
  function carriesSharedParam(code) {
    return nodeShape(code).nodeKeys.some(function (k) {
      return k && k.some(function (x) { return NODE_KEYS.indexOf(x) < 0; });
    });
  }
  check('inherit', 'a node\\'s parameters inherited by its children', 'byhand',
    carriesSharedParam(rich),
    'ExpVis writes every parameter on each trial rather than lifting shared ones ' +
    'to the node. Same output; it just repeats itself');
  // …and that check must be able to see one, or it passes by being blind. This
  // is what #7 would look like if ExpVis ever started doing it.
  check('inherit-detector', 'the inheritance check spots a shared parameter', true,
    carriesSharedParam('var x = { timeline: [{ type: jsPsychHtmlKeyboardResponse, ' +
      'stimulus: "a" }], prompt: "shared" };\\nvar timeline = [x];\\njsPsych.run(timeline);'),
    'self-check for the line above', true);
  check('override', 'a child overriding an inherited value', 'byhand', false,
    'the editor inherits nothing, so there is nothing for it to override. A node ' +
    'parameter is how a researcher inherits one — and then a child trial overrides it');
  // Two levels is what the compiler BUILDS, not the ceiling on what can be
  // expressed. A custom parameter named `timeline` is matched by key
  // (_applyCustomProps), so it replaces a node's or a trial's whole list with
  // any literal — and jsPsych treats an object carrying `timeline` as a node.
  // Measured: both directions nest one level deeper. Undocumented and
  // unchecked, but reachable.
  check('depth', 'nesting any number of levels deep', 'byhand',
    shape.deepestTimeline > 2,
    'two levels is the structure the compiler builds; deeper nesting is ' +
    'reachable by hand through a custom parameter named `timeline`');

  section = '时间线变量';
  check('tv', 'timeline_variables', true, /timeline_variables: \\w+/.test(all));
  check('tvref', "jsPsych.timelineVariable('name')", true,
    /jsPsych\\.timelineVariable\\('/.test(all));
  // Both of these are now reachable by writing a custom parameter (Trial
  // Settings); what the editor does not do is write one for you.
  check('tveval', 'jsPsych.evaluateTimelineVariable()', 'byhand',
    /evaluateTimelineVariable/.test(all),
    'the editor never writes it. Reachable by hand: a custom parameter is a ' +
    'JavaScript expression emitted in place of a generated one');
  check('dynamic', 'dynamic parameters (a function on a parameter)', 'byhand',
    /stimulus: function/.test(all),
    'the editor never writes one. Addressable with a custom parameter, or the ' +
    'two places it already writes a function itself: jittered fixation duration ' +
    'and sample.fn');
  section = '试次顺序随机';
  check('randomize', 'randomize_order', true, /randomize_order: true/.test(all));
  section = '抽样 sample';
  check('sample', 'sample', true, /sample: \\{type: '/.test(all));
  check('withrepl', 'sample with-replacement', true,
    /sample: \\{type: 'with-replacement'/.test(all));
  check('weights', 'weights', true, /weights: \\[/.test(all));
  check('withoutrepl', 'sample without-replacement', true,
    /sample: \\{type: 'without-replacement'/.test(all));
  check('fixedreps', 'sample fixed-repetitions', true,
    /sample: \\{type: 'fixed-repetitions'/.test(all));
  check('altgroups', 'sample alternate-groups', true,
    /sample: \\{type: 'alternate-groups', groups: \\[/.test(all) &&
    /randomize_group_order: (true|false)/.test(all));
  check('customfn', 'sample custom + fn', true, /sample: \\{type: 'custom', fn: /.test(all));
  section = '重复一系列试次';
  check('reps', 'repetitions', true, /repetitions: 4/.test(all));
  check('repsvar', 'repetitions alongside timeline_variables', true,
    /timeline_variables: \\w+[\\s\\S]{0,200}repetitions: 4/.test(rich));
  check('repsloop', 'repetitions alongside loop_function', true,
    /repetitions: \\d[\\s\\S]{0,400}loop_function: /.test(all));
  check('repscond', 'repetitions alongside conditional_function', true,
    /repetitions: \\d[\\s\\S]{0,400}conditional_function: /.test(all));
  section = '循环与条件时间线';
  check('loopfn', 'loop_function', true, /loop_function: /.test(all));
  check('condfn', 'conditional_function', true, /conditional_function: /.test(all));
  section = '在运行时修改时间线';
  // Both rows are the docs' EXAMPLE CODE, not jsPsych API: `main_timeline` is
  // the name that page gave its own top-level array, which the editor also has
  // and calls `timeline`. Neither needs an API call — an `on_finish` that
  // writes to that array IS the mechanism — so both are reachable by hand.
  // `pop` was marked absent only because its reason had been copied from the
  // row above it.
  //
  // The patterns look for the write INSIDE a callback, and `[^}]` is what keeps
  // them there: a bare `timeline.push` at the top level is how the editor
  // assembles the experiment in the first place, so a pattern that could run
  // past the closing brace would match it and pass on every experiment while
  // proving nothing. That is what the previous patterns did — neither
  // `addNodeToEndOfTimeline` (no such API in jsPsych v8) nor `main_timeline`
  // ever appears in the output, so both rows were permanently, silently false.
  check('runtimepush', 'on_finish pushing onto the timeline', 'byhand',
    /function\\s*\\([^)]*\\)\\s*\\{[^}]{0,300}?timeline\\.push\\(/.test(all),
    'the editor never writes one; a node parameter can push onto the top-level timeline');
  check('runtimepop', 'main_timeline.pop()', 'byhand',
    /function\\s*\\([^)]*\\)\\s*\\{[^}]{0,300}?timeline\\.pop\\(/.test(all),
    'same — that is the top-level timeline array, which the editor also has');
  section = '时间线开始/结束回调';
  // 'byhand', not absent. The editor never writes these, but a node parameter
  // in the block settings reaches them exactly as it reaches loop_function —
  // having no constructor of its own is what puts a mechanism in this column,
  // not what keeps it out of the table. They were marked absent while the
  // reason beside them said "write one in the block settings", which is the
  // definition of the column next door.
  check('tlstart', 'on_timeline_start', 'byhand', /on_timeline_start/.test(all),
    'the editor never writes one; a node parameter in the block settings does');
  check('tlfinish', 'on_timeline_finish', 'byhand', /on_timeline_finish/.test(all),
    'same — a node parameter in the block settings');
  section = '文档示例里的其它 API';
  check('init', 'initJsPsych()', true, /initJsPsych\\(/.test(all));
  check('comparekeys', 'jsPsych.pluginAPI.compareKeys()', true,
    /jsPsych\\.pluginAPI\\.compareKeys\\(/.test(all));
  // Was 'byhand' ("that is how a branch reads the previous trial; ExpVis has no
  // branching"). Still true of branching — but the block settings now emit
  // exactly this to build a conditional_function, which jsPsych hands no
  // argument at all, so the editor writes it itself.
  check('lookback', 'jsPsych.data.get().last(1).values()[0]', true,
    /data\\.get\\(\\)\\.last\\(/.test(all));
  return out;
}

window.addEventListener('load', function () {
  var out = { ok: true, templates: {}, cases: {}, media: {}, contentless: {}, timeline: {},
              errors: [] };
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
          noTokens: code.indexOf('@@') < 0,
          // The editor names itself and its version in the file it writes, so a
          // generated experiment can be traced back to the build that produced
          // it — the version problem the review raised. Two independent facts:
          // the file carries the version, and it is the version this editor
          // says it is.
          namesTheEditor: code.indexOf('Generated by ExpVis v' + EXPVIS_VERSION + ' ') >= 0,
          namesTheVersionSource: code.indexOf('tag v' + EXPVIS_VERSION) >= 0,
          // Numeric and dot-separated — NOT strict semver, which would
          // demand three parts and reject the maintainer's '1.0'. What this
          // is here to catch is a placeholder like 'latest' or 'dev'.
          versionIsNumeric: /^\\d+(\\.\\d+)+$/.test(EXPVIS_VERSION),
          // …and the header in the editor's own UI reads the same constant, so
          // there is exactly one copy of the number to drift.
          uiShowsTheSameVersion:
            (function () {
              var el = document.getElementById('app-version');
              return !!el && el.textContent === 'v' + EXPVIS_VERSION;
            })(),
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
      out.cases = blockCases();
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
    try {
      out.timeline = timelineDocCases();
    } catch (e) {
      out.ok = false;
      out.timeline = { error: String(e.message) + ' @ ' + String(e.stack).split('\\n')[1] };
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
            if not c["noTokens"]:
                broken_media.append(f"media case {name}: an internal @@TOKEN@@ survived")
            if not c["preloadTagBeforeImages"]:
                broken_media.append(f"media case {name}: preload plugin tag missing or "
                                    f"after an image plugin tag")

    contentless = res.get("contentless", {})
    if "error" in contentless:
        broken_contentless = [f"contentless cases threw: {contentless['error']}"]
    else:
        # Every trial must carry a stimulus string, and the canned prompt must
        # appear only where nothing else does.
        # A sentinel, because None already means "this case does not care".
        ABSENT = "<no prompt at all>"
        # `emitted` is the headline: a trial with nothing to show and nothing to
        # ask is not a trial. `parts` counts the jsPsych trials it became, which
        # pins that a fixation is timed rather than a screen.
        WANT = {
            "no components":                       {"emitted": False, "parts": 0},
            # a fixation-only trial has no response screen: its timed segments
            # ARE the trial, and they are spliced into the node's timeline
            "fixation only":                       {"emitted": True,  "parts": 1},
            "two fixations":                       {"emitted": True,  "parts": 2},
            "fixation + keyboard, prompt cleared": {"emitted": True,  "parts": 2,
                                                    "empty": True, "prompt": ABSENT},
            "fixation + keyboard, prompt kept":    {"emitted": True,  "parts": 2,
                                                    "empty": True, "prompt": "'Press a key'"},
            "survey with no preamble":             {"emitted": True,  "parts": 1,
                                                    "empty": True, "prompt": None},
            "button with no stimulus":             {"emitted": True,  "parts": 1,
                                                    "empty": True, "prompt": None},
        }
        broken_contentless = []
        for name, want in WANT.items():
            c = contentless.get(name)
            if not c:
                broken_contentless.append(f"contentless case {name}: missing")
                continue
            if c["saysUndefined"]:
                broken_contentless.append(f"contentless case {name}: the code says 'undefined'")
            if not c["noTokens"]:
                broken_contentless.append(f"contentless case {name}: an @@TOKEN@@ survived")
            if c["emitted"] != want["emitted"]:
                broken_contentless.append(
                    f"contentless case {name}: emitted={c['emitted']}, expected {want['emitted']}")
            if c["parts"] != want["parts"]:
                broken_contentless.append(
                    f"contentless case {name}: became {c['parts']} jsPsych trials, "
                    f"expected {want['parts']}")
            if want.get("empty") and not c["emptyStimulus"]:
                broken_contentless.append(
                    f"contentless case {name}: no empty stimulus (hasStimulus={c['hasStimulus']})")
            if want.get("prompt") == ABSENT:
                if c["prompt"] is not None:
                    broken_contentless.append(
                        f"contentless case {name}: invented a prompt ({c['prompt']}) where the "
                        f"researcher cleared it")
            elif want.get("prompt") is not None and c["prompt"] != want["prompt"]:
                broken_contentless.append(
                    f"contentless case {name}: prompt {c['prompt']}, expected {want['prompt']}")

    # Every mechanism on the jsPsych timeline page: present ones must be there,
    # absent ones must stay absent.
    doc = res.get("timeline", {})
    if "error" in doc:
        broken_doc = [f"timeline doc cases threw: {doc['error']}"]
    else:
        broken_doc = []
        for cid, c in doc.items():
            ok = c["found"] if c["expected"] == "present" else not c["found"]
            if not ok:
                verb = "missing" if c["expected"] == "present" else "was emitted"
                broken_doc.append(f"timeline {cid} ({c['label']}): {verb}"
                                  + (f" — {c['why']}" if c["why"] else ""))
    n_present = sum(1 for c in doc.values()
                    if c.get("expected") == "present" and not c.get("self"))
    n_byhand = sum(1 for c in doc.values()
                   if c.get("expected") == "byhand" and not c.get("self"))
    n_absent = sum(1 for c in doc.values()
                   if c.get("expected") == "absent" and not c.get("self"))

    cases = res.get("cases", {})
    if "error" in cases:
        broken_cases = [f"block cases threw: {cases['error']}"]
    else:
        # What each synthetic block must compile to. `factored` is the point:
        # a block whose trials are one procedure becomes a table, and every
        # other shape must stay plain trials rather than being forced into one.
        WANT = {"homogeneous, default": False,
                "homogeneous, run as one procedure": True,
                "fixation, run as one procedure": True,
                # Asked for, but the trials do not share a shape
                "ragged, run as one procedure": False,
                "identical, run as one procedure": False,
                "one trial, run as one procedure": False,
                # asked for, but a multi-line value cannot go in a table row
                "jittered fixations, run as one procedure": False,
                # the properties match, the plugin does not — still two procedures
                "different plugins, run as one procedure": False}
        broken_cases = [
            f"block case {name}: factored={cases[name]['factored']}, expected {want}"
            for name, want in WANT.items()
            if name in cases and cases[name]["factored"] != want
        ]
        # The block settings, mapped to the exact jsPsych parameters they emit.
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
            "repetitions on a ragged block": ["repetitions: 2"],
            # no table, so no sampling and no randomize_order
            "sampling without the mode": [],
            # sample is dropped here, repetitions is not.
            "sample ignored without a table": ["repetitions: 2"],
        }
        for name, want in WANT_PARAMS.items():
            got = cases.get(name, {}).get("nodeParams")
            if got != want:
                broken_cases.append(f"block case {name}: emitted {got}, expected {want}")
        for name, c in cases.items():
            # Both directions. An undeclared node parameter means one leaked in
            # from somewhere nobody asked; a declared one that never appeared
            # means the feature that emits it quietly stopped.
            observed = set(c.get("observedParams") or [])
            declared = set(c.get("expectParams") or [])
            for k in sorted(observed - declared):
                broken_cases.append(
                    f"block case {name}: node parameter {k!r} was emitted but not declared")
            for k in sorted(declared - observed):
                broken_cases.append(
                    f"block case {name}: {k!r} was declared but never emitted")
            if not c["noTokens"]:
                broken_cases.append(f"block case {name}: an @@TOKEN@@ survived")
            if name == "custom node parameter":
                want_props = sorted(["loop_function: function (data) { return false; }",
                                     "repetitions: 2"])
                if c["emitted"] != want_props:
                    broken_cases.append(
                        f"block case {name}: emitted {c['emitted']}, expected {want_props} "
                        f"— one key each, the custom one winning")
            if name == "data override keeps the scoring key":
                checks = [
                    ("correct_response: 'a'" in c["merged"], "merged",
                     "the scoring key did not survive the override"),
                    (c["keyCount"] == 1, "keyCount",
                     f"{c['keyCount']} correct_response keys, expected 1"),
                    ("correct_response: 'x'" in c["researcherWins"], "researcherWins",
                     "the researcher's own correct_response was overwritten"),
                    ("correct_response: 'a'" in c["emptyLiteral"], "emptyLiteral",
                     "an empty literal did not gain the key"),
                    ("Object.assign" in c["notALiteral"], "notALiteral",
                     "a non-literal was rewritten as if it were one"),
                    (c["multilineKept"], "multilineKept",
                     "a multi-line literal was flattened"),
                ]
                for ok, field, why in checks:
                    if not ok:
                        broken_cases.append(
                            f"block case {name}: {why} — {c[field]}")
            if name == "block conditions":
                for k in ("loopNegated", "condNotNegated", "loopReadsLastRow",
                          "condTakesNoArg", "condReadsGlobal", "noCapWrapper"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "uncapped loop":
                if not c["plainLiteral"] or not c["noCounter"]:
                    broken_cases.append(
                        f"block case {name}: plainLiteral={c['plainLiteral']}, "
                        f"noCounter={c['noCounter']}")
            if name == "loop behaviour":
                # text can be right while the meaning is inverted, so drive it
                for k in ("stopsOnCorrect", "noCapOfItsOwn", "lastRowDecides",
                          "emptyRoundSafe"):
                    if not c[k]:
                        broken_cases.append(
                            f"block case {name}: {k} is false (capCalls={c['capCalls']})")
            if name == "hand-written loop overrides":
                if c["keyCount"] != 1:
                    broken_cases.append(
                        f"block case {name}: {c['keyCount']} loop_function keys, expected 1")
                if not c["generatedOneGone"]:
                    broken_cases.append(
                        f"block case {name}: the generated one is still in the output")
                if not c["isTheWrittenOne"]:
                    broken_cases.append(
                        f"block case {name}: the written source did not survive")
            if name == "jzip layout":
                if c["manifestName"] != "info.jas":
                    broken_cases.append(
                        f"block case {name}: manifest is {c['manifestName']!r}, expected 'info.jas'")
                for k in ("dirMatchesStudy", "htmlNamedAfterComponent",
                          "componentPathMatches", "assetsBesideHtml",
                          "everyEntryIsBytes", "htmlLoadsJatos",
                          "localDoesNotLoadJatos", "idsStable"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "fixation after a stimulus":
                for k in ("holdsTwoTrials", "bothStimuliOnIt", "fixationIsTheTimedTrial"):
                    if not c[k]:
                        broken_cases.append(
                            f"block case {name}: {k} is false "
                            f"(trialsPerNode={c['trialsPerNode']})")
            if name == "two response components":
                for k in ("pluginIsTheFirst", "choicesAreTheFirsts",
                          "secondDidNotLeak", "scoresAgainstIt"):
                    if not c[k]:
                        broken_cases.append(
                            f"block case {name}: {k} is false — plugin and parameters "
                            f"must come from the same component")
            if name == "one owner per trial":
                want = {"animAfterStim": "text | animation",
                        "stimAfterAnim": "animation | text",
                        "secondResponse": "keyboard | button",
                        "twoStimuli": "text+shape"}
                for k, expect in want.items():
                    if c[k] != expect:
                        broken_cases.append(
                            f"block case {name}: {k} = {c[k]!r}, expected {expect!r}")
            if name == "survey questions":
                for k in ("plugins", "likertTwoQuestions", "choiceTwoQuestions",
                          "textTwoQuestions", "labelsAsOneRow", "optionsReached",
                          "horizontalReached", "requiredReached",
                          "placeholderOnlyWhereSet", "namesNumbered", "formHasHtml",
                          "noUndefined", "noTrialDuration"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "feedback uses categorize":
                for k in ("imageUsesImagePlugin", "htmlUsesHtmlPlugin", "feedbackEmitted",
                          "keyAnswerEmitted", "pluginDoesTheScoring",
                          "withoutFeedbackUnchanged", "severalKeysRefuse"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "layout preview zoom":
                for k in ("hasASlider", "rangeIsSane", "defaultFitsWidth",
                          "defaultFitsHeight", "defaultIsBelowFullWhenNeeded",
                          "defaultNeverAboveFull", "smallDeviceWouldHaveRoomToGrow",
                          "frameFollowsZoom", "sliderZoomsBothWays",
                          "fitReturnsToTheDefault"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "an expired model list is not a dead end":
                for k in ("isATextField", "noClosedSelect", "suggestionsOffered",
                          "defaultsToSomething", "refusalNamesTheModel",
                          "refusalPointsAtTheList", "refusalOffersTheFix",
                          "unrelatedErrorStaysPlain", "authErrorSaysSo",
                          "customHasNoList"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "datapipe is a packaging choice":
                for k in ("defaultHasNoPipeScript", "defaultHasNoSaveTrial",
                          "loadsThePlugin", "carriesTheTrial", "idIsEscaped"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "dropped parameters are named":
                for k in ("aloneIsSilent", "untouchedIsSilent", "namesTheAudioParam",
                          "namesTheVideoParam", "namesTheRemedy", "staysAComment"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "correct key is editable":
                for k in ("hasInput", "labelled", "retiredHintGone"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "ai prompts name no retired mechanism":
                for k in ("templatesAreClean", "metaTypesAreReal",
                          "schemaHasNoRetiredType", "stillForbidden",
                          "templatesMatchButtons"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "the prompt teaches the schema the editor has":
                if not c["schemaFound"]:
                    broken_cases.append(f"block case {name}: no schema section found")
                if not c["typesCovered"]:
                    broken_cases.append(f"block case {name}: typesCovered is false")
                if not c["noDrift"]:
                    broken_cases.append(f"block case {name}: prompt and editor disagree — {c['drift']}")
                for k in ("controlsNamed", "sampleTypesNamed", "operatorsNamed"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "block settings survive the import":
                for k in ("repetitionsKept", "randomizeOrderKept", "sampleKept",
                          "loopKept", "condKept", "plainStaysPlain",
                          "gatedOnConditions", "loopAndCondUngated"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "ai provider headers":
                for k in ("anthropicUsesApiKey", "anthropicSendsNoAuthorization",
                          "browserAccessOptIn", "versionPinned", "restUseBearer",
                          "noEmptyBearer", "requestGoesToTheRightPlace",
                          "requestCarriesApiKey", "requestOptsInToBrowser",
                          "namesAreDistinct"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "cloze page":
                for k in ("plugin", "notationKept", "paramsEmitted",
                          "defaultsOmitted", "noBlankWarns"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "free sort":
                for k in ("plugin", "allImagesEmitted", "assetsCarried", "onlyChanged",
                          "noResponseOrStimulus", "emptyWarns"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "audio and video":
                for k in ("audioPlugin", "audioParams", "videoPlugin",
                          "videoStimulusIsArray", "videoParams", "imageStillItsOwn",
                          "fallbackHasNoControls"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if name == "expression validation":
                for k, want in (("rejectsStatement", True), ("namesTheValue", True),
                                ("suggestsAFunction", True), ("acceptsFunction", True),
                                ("acceptsArrow", True)):
                    if c[k] != want:
                        broken_cases.append(f"block case {name}: {k}={c[k]}, expected {want}")
            if name == "data is saved":
                for k in ("callsLocalSave", "formatFirst", "hasFilename"):
                    if not c[k]:
                        broken_cases.append(f"block case {name}: {k} is false")
            if c.get("writesReserved"):
                broken_cases.append(
                    f"block case {name}: writes a field jsPsych reserves "
                    f"(trial_type / trial_index / time_elapsed / plugin_version)")
            if c.get("variablePlugin"):
                broken_cases.append(
                    f"block case {name}: the plugin became a timeline variable — "
                    "`type` is read before any variable has a value")
            # An animation trial must reach the node it is declared in. The
            # failure this case exists for is the declaration going unreferenced:
            # the trial is written out, the node's timeline never names it, and
            # the animation silently never runs.
            # A custom parameter must replace, not duplicate. Two `stimulus:`
            # keys is valid JavaScript that keeps the last, so the check that
            # matters is the count.
            if name.startswith("custom parameter"):
                if not c.get("emitsTheSource"):
                    broken_cases.append(f"block case {name}: the source was not emitted")
                if name.endswith("(replace)"):
                    if not c.get("replacesGenerated"):
                        broken_cases.append(
                            f"block case {name}: the generated stimulus is still there")
                    if c["stimulusKeys"] != 1:
                        broken_cases.append(
                            f"block case {name}: {c['stimulusKeys']} stimulus keys, expected 1")
                elif c["stimulusKeys"] != 1:
                    broken_cases.append(
                        f"block case {name}: {c['stimulusKeys']} stimulus keys, expected 1")
            # (the null entries are the preload trial, which is a bare trial
            # rather than a node — the animation's frames are media)
            anim_nodes = [n for n in c["trialsPerNode"] if n is not None]
            if name == "animation trial" and anim_nodes != [1]:
                broken_cases.append(
                    f"block case animation trial: node collects {anim_nodes}, "
                    f"expected [1] — the trial would be declared and never run")
            # A factored node holds the procedure's ENTRIES, not one entry per
            # condition. A plain procedure is one; a procedure that opens with a
            # fixation is two, because that fixation is its own jsPsych trial and
            # is spliced into the node's timeline rather than wrapped.
            WANT_NODES = {"fixation, run as one procedure": [2]}
            if c["factored"]:
                want_nodes = WANT_NODES.get(name, [1])
                got_nodes = [n for n in c["trialsPerNode"] if n is not None]
                if got_nodes != want_nodes:
                    broken_cases.append(
                        f"block case {name}: node holds {got_nodes}, expected {want_nodes}")

    bad = 0
    broken = (list(broken_cases) + list(broken_media) + list(broken_contentless)
              + list(broken_doc))
    for name, t in res["templates"].items():
        struct = t["structure"]
        # Invariants that must hold whatever the bytes are.
        # A node-level parameter is a claim about the template's purpose, so
        # which ones are allowed depends on the template. `branching` exists to
        # demonstrate conditional_function; everywhere else one appearing means
        # something started emitting that nobody asked for.
        allowed = {"branching": ["conditional_function"]}.get(name, [])
        stray = [p for p in struct["observedParams"] if p not in allowed]
        if stray:
            broken.append(f"{name}: node-level parameter(s) {stray} "
                          "that this template should not carry")
        if any(n is None or n == 0 for n in struct["trialsPerNode"]):
            broken.append(f"{name}: a block node collects no trials ({struct['trialsPerNode']})")
        if not t.get("publishedMatches"):
            broken.append(f"{name}: publish != export")
        if not t.get("noTokens"):
            broken.append(f"{name}: an internal @@TOKEN@@ survived into the output")
        # What each template EXISTS to demonstrate.
        #
        # A golden diff says only that something changed; it cannot say that
        # the reason the template is in the list has gone, and it would accept
        # that silently the moment someone re-saved the baseline. So the point
        # of each one is asserted on its own.
        folded = "timeline_variables" in t["code"]
        carries_condition = "conditional_function" in t["code"]
        if name in ("stroop", "simon", "flanker"):
            if not folded:
                broken.append(f"{name}: the trials no longer fold into a condition table, "
                              "which is what this template demonstrates")
        elif folded:
            broken.append(f"{name}: folds into a condition table, which it does not demonstrate")
        if name == "branching" and not carries_condition:
            broken.append("branching: no conditional_function — the template's whole point")
        if name != "branching" and carries_condition:
            broken.append(f"{name}: carries a conditional_function, which it does not demonstrate")
        # A generated experiment has to name the build that wrote it, and the
        # editor's own header has to name the same one. A file that cannot be
        # traced back to a version is a file nobody can match to a tutorial.
        if not t.get("namesTheEditor"):
            broken.append(f"{name}: the output does not name the editor version")
        if not t.get("namesTheVersionSource"):
            broken.append(f"{name}: the output names no way to retrieve that version")

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
              f"blocks={struct['trialsPerNode']}")
    # Version invariants: the same in every template, so checked once. They
    # answer the half of the review's versioning point that is about the editor
    # rather than about a particular file — the number has to be a number, and
    # the header in the UI has to be reading the same one the files are.
    for name, t in res["templates"].items():
        if "error" in t:
            continue
        if not t.get("versionIsNumeric"):
            broken.append("EXPVIS_VERSION is not a numeric version string")
        if not t.get("uiShowsTheSameVersion"):
            broken.append("the editor's own header does not show EXPVIS_VERSION")
        break

    if doc and "error" not in doc:
        print(f"\n  jsPsych timeline page: {n_present} present, {n_byhand} reachable by "
              f"hand, {n_absent} not expressible, {len(broken_doc)} wrong")
    if broken:
        print()
        for b in broken:
            print("  !! " + b)
        sys.exit(f"{len(broken)} structural problem(s)")
    sys.exit(f"{bad} template(s) differ from the baseline" if bad else None)


def cmd_coverage():
    """Write the coverage table, from the probe's own results.

    Generated rather than written by hand: a table maintained separately from
    the assertions it describes drifts, and then the document is wrong in the
    direction of optimism.
    """
    res = run_probe()
    doc = res.get("timeline", {})
    if "error" in doc:
        sys.exit("the probe errored: " + doc["error"])
    present = [c for c in doc.values() if c["expected"] == "present" and not c.get("self")]
    absent = [c for c in doc.values() if c["expected"] == "absent" and not c.get("self")]
    byhand = [c for c in doc.values() if c["expected"] == "byhand" and not c.get("self")]
    lines = [
        "# jsPsych 时间线页 × ExpVis 实现现状",
        "",
        "> **本文件是生成物** —— `python3 tests/expvis_probe.py coverage` 重写它。",
        "> 数字来自探针的**实际运行结果**,不是手写的。改这里会被下次生成覆盖;",
        "> 要改结论就改 `tests/expvis_probe.py` 里的 `timelineDocCases()`。",
        "",
        "来源: <https://shaobin-jiang.github.io/jsPsych-Chinese-Documentation/v8/overview/timeline/>",
        "",
        f"**{len(present)} 条已实现 · {len(byhand)} 条手写可达 · {len(absent)} 条做不到 · "
        f"{len(present) + len(byhand) + len(absent)} 条合计。**",
        "",
        "**✍️ 手写可达** = 编辑器不会自己写,但研究者可以 —— 在试次或节点上写一条自定义参数。",
        "**❌ 做不到** = 怎么都表达不了。",
        "",
        "",
    ]
    page = {k: c for k, c in doc.items() if not c.get("self")}
    seen = []
    for c in page.values():
        if c.get("section") not in seen:
            seen.append(c.get("section"))
    for sec in seen:
        lines += [f"## {sec}", "", "| 功能点 | ExpVis | 说明 |", "|---|---|---|"]
        for c in page.values():
            if c.get("section") != sec:
                continue
            mark = {"present": "✅ 有", "byhand": "✍️ 手写可达",
                    "absent": "❌ 做不到"}[c["expected"]]
            note = c.get("why", "") or ""
            if c["found"] != (c["expected"] == "present"):
                mark += " ⚠️ **与断言不符**"
            lines.append(f"| {c['label']} | {mark} | {note} |")
        lines.append("")
    lines += [
        "## 怎么用这张表",
        "",
        "- **验证**:`python3 tests/expvis_probe.py check` —— 有的一定在,不做的一定不在",
        "- **改结论**:改 `timelineDocCases()`,然后重跑 `coverage`",
        "",
        "有两条写不成正则,改成把产物在 jsPsych 桩上求值后看结构(`nodeShape()`):",
        "节点是否携带共享的试次参数、以及 `timeline` 最深嵌套几层。",
        "",
    ]
    out = os.path.join(ROOT, "docs", "JSPsych_TIMELINE_COVERAGE.md")
    with open(out, "w") as fh:
        fh.write("\n".join(lines))
    print(f"wrote {os.path.relpath(out, ROOT)}  "
          f"({len(present)} present / {len(absent)} absent)")


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
    elif cmd == "coverage":
        cmd_coverage()
    elif cmd == "dump":
        cmd_dump(sys.argv[2] if len(sys.argv) > 2 else "stroop")
    else:
        sys.exit(__doc__)
