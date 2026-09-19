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
  function run(label, spec, phaseProps) {
    resetEditor();
    addPhase('trials');
    build(editor.phases[0].id, spec);
    Object.keys(phaseProps || {}).forEach(function (k) { editor.phases[0][k] = phaseProps[k]; });
    var code = _compileExperiment({}).code;
    var st = inspectStructure(code);
    var m = phaseModes()[editor.phases[0].id] || {};
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      // whether the trials COULD be one procedure, which is what the settings
      // dialog offers before the researcher asks for it
      uniform: !!m.uniform,
      // a factored node holds the one procedure, not one entry per condition
      trialsPerNode: st.trialsPerNode,
      forbiddenParams: st.forbiddenParams,
      noTokens: code.indexOf('@@') < 0,
      // `type` selects the plugin and is read when the trial is instantiated,
      // before any timeline variable has a value. Whatever the phase, the plugin
      // must never have been hoisted into the table.
      variablePlugin: /timelineVariable\\('type'\\)/.test(code)
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
  // shapes still have no single procedure to hoist, so the phase falls back.
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
    addPhase('trials');
    addTrial(editor.phases[0].id);
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
      forbiddenParams: [],
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
    addPhase('trials');
    addTrial(editor.phases[0].id);
    var t = findTrial(editor.selectedTrial);
    addComponent(t.id, 'text', 's');
    t.custom = [{name: 'on_load', src: 'function () { console.log("loaded"); }'}];
    var code = _compileExperiment({}).code;
    out['custom parameter (append)'] = {
      factored: false, uniform: false,
      trialsPerNode: inspectStructure(code).trialsPerNode,
      forbiddenParams: [], noTokens: code.indexOf('@@') < 0,
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
  // Two conditions whose fixations jitter over different ranges. The jittered
  // duration is a value spanning several lines, and a table row is one line, so
  // factoring used to emit `{trial_duration: trial_duration: function () { …`
  // — JavaScript that does not parse, from an experiment the GUI accepts.
  run('jittered fixations, run as one procedure', [
    [['fixation', {trial_duration: 500, durationMin: 500, durationMax: 900, durationStep: 200}]],
    [['fixation', {trial_duration: 600, durationMin: 600, durationMax: 1000, durationStep: 200}]]
  ], {conditions: true});

  // Node-level parameters, set the way the phase settings dialog sets them.
  // `nodeParams` is the exact text emitted between `timeline` and the closing
  // brace, so the mapping from a control to a jsPsych parameter is pinned here
  // rather than being re-checked by hand in a browser.
  function runSampled(label, spec, phaseProps, perTrial, noMode) {
    resetEditor();
    addPhase('trials');
    var made = build(editor.phases[0].id, spec);
    // Per-condition fields (group, weight) belong on the trials the editor
    // made, not on the spec they were built from.
    (perTrial || []).forEach(function (props, i) {
      Object.keys(props).forEach(function (k) { made[i][k] = props[k]; });
    });
    if (!noMode) editor.phases[0].conditions = true;
    Object.keys(phaseProps).forEach(function (k) { editor.phases[0][k] = phaseProps[k]; });
    var code = _compileExperiment({}).code;
    out[label] = {
      factored: code.indexOf('timeline_variables') >= 0,
      nodeParams: (code.match(/^  (?:sample|randomize_order|repetitions):.*$/gm) || [])
        .map(function (s) { return s.trim().replace(/,$/, ''); }),
      trialsPerNode: inspectStructure(code).trialsPerNode,
      forbiddenParams: inspectStructure(code).forbiddenParams,
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
  // An image mixed with anything else leaves the dedicated image plugin for the
  // HTML path, where the asset is written into a tag via a compiler token rather
  // than passed as `stimulus`. That token was the one nothing exercised.
  run('image + text (HTML path)', "addPhase('trials'); addTrial(editor.phases[0].id);"
    + "var t=findTrial(editor.selectedTrial);"
    + "addComponent(t.id,'image','s'); addComponent(t.id,'text','s');"
    + "addComponent(t.id,'keyboard','r');"
    + "t.components[0].fileData='data:image/png;base64,AAAA';"
    + "t.components[0].fileName='face.png';"
    + "t.components[1].content='Is this Alex?';"
    + "t.components[2].choices=['y','n'];",
    ['img/face.png']);
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
      // A trial with nothing to show and nothing to ask is left out entirely
      // rather than run as a blank screen.
      emitted: /var \\w+_trial_\\d+ = \\{/.test(trial),
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

  // A phase of two homogeneous trials run as one procedure, with every node
  // parameter ExpVis can set. Exercises the timeline_variables half of the page.
  function sampled(sample, extra) {
    return build(
      "addPhase('Trials');" +
      "['RED','BLUE'].forEach(function (w, i) {" +
      "  addTrial(editor.phases[0].id);" +
      "  var t=findTrial(editor.selectedTrial);" +
      "  addComponent(t.id,'text','s'); addComponent(t.id,'keyboard','r');" +
      "  t.components[0].content=w; t.components[1].choices=['a','l'];" +
      "  t.components[1].correctKey='a'; t.weight=i+1;" +
      "});" +
      "editor.phases[0].conditions = true;" +
      (sample ? "editor.phases[0].sample = " + sample + ";" : "") +
      (extra || ""));
  }
  var rich = sampled("{type:'with-replacement', size:1}",
    "editor.phases[0].randomize_order=true; editor.phases[0].repetitions=4;");
  var withoutReplacement = sampled("{type:'without-replacement', size:2}");
  var fixedReps = sampled("{type:'fixed-repetitions', size:3}");
  var custom = sampled("{type:'custom', fn:'function (order) { return order; }'}");
  var alternate = sampled("{type:'alternate-groups', randomizeGroupOrder:true}");
  // A fixation with jitter — the one dynamic parameter ExpVis emits.
  var jitter = build(
    "addPhase('Trials'); addTrial(editor.phases[0].id);" +
    "var t=findTrial(editor.selectedTrial); addComponent(t.id,'fixation','s');" +
    "t.components[0].trial_duration=500; t.components[0].durationMin=500;" +
    "t.components[0].durationMax=900; t.components[0].durationStep=200;" +
    "addComponent(t.id,'text','s');");
  var plain = build("addPhase('Trials'); addTrial(editor.phases[0].id);" +
    "var t=findTrial(editor.selectedTrial); addComponent(t.id,'text','s');" +
    "addComponent(t.id,'keyboard','r');");

  var all = [rich, withoutReplacement, fixedReps, custom, alternate, jitter, plain].join('\\n');
  var shape = nodeShape(rich);
  var NODE_KEYS = ['randomize_order', 'repetitions', 'sample', 'timeline', 'timeline_variables'];

  var section = '';
  // `selfCheck` marks a case that tests one of the checks above rather than a
  // mechanism on the page. It is asserted like any other and kept out of the
  // generated coverage table, which is about jsPsych, not about this file.
  function check(id, label, present, test, why, selfCheck) {
    out[id] = {label: label, section: section, expected: present ? 'present' : 'absent',
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
  check('pushtrials', 'multiple trials as successive timeline.push()', false,
    /timeline\\.push\\(\\w*_trial_\\d+\\)/.test(all),
    'ExpVis collects each phase into one node and pushes the node; pushing trials ' +
    'individually is the same experiment written differently');
  section = '嵌套时间线';
  check('nested', 'an object with its own timeline', true, /timeline: \\[/.test(all));
  function carriesSharedParam(code) {
    return nodeShape(code).nodeKeys.some(function (k) {
      return k && k.some(function (x) { return NODE_KEYS.indexOf(x) < 0; });
    });
  }
  check('inherit', 'a node\\'s parameters inherited by its children', false,
    carriesSharedParam(rich),
    'ExpVis writes every parameter on each trial rather than lifting shared ones ' +
    'to the node. Same output; it just repeats itself');
  // …and that check must be able to see one, or it passes by being blind. This
  // is what #7 would look like if ExpVis ever started doing it.
  check('inherit-detector', 'the inheritance check spots a shared parameter', true,
    carriesSharedParam('var x = { timeline: [{ type: jsPsychHtmlKeyboardResponse, ' +
      'stimulus: "a" }], prompt: "shared" };\\nvar timeline = [x];\\njsPsych.run(timeline);'),
    'self-check for the line above', true);
  check('override', 'a child overriding an inherited value', false, false,
    'nothing is inherited, so there is nothing to override');
  check('depth', 'nesting any number of levels deep', false, shape.deepestTimeline > 2,
    'two levels: the phase node, and the timed segments inside one trial');

  section = '时间线变量';
  check('tv', 'timeline_variables', true, /timeline_variables: \\w+/.test(all));
  check('tvref', "jsPsych.timelineVariable('name')", true,
    /jsPsych\\.timelineVariable\\('/.test(all));
  // Both of these are now reachable by writing a custom parameter (Trial
  // Settings); what the editor does not do is write one for you.
  check('tveval', 'jsPsych.evaluateTimelineVariable()', false,
    /evaluateTimelineVariable/.test(all),
    'the editor never writes it. Reachable by hand: a custom parameter is a ' +
    'JavaScript expression emitted in place of a generated one');
  check('dynamic', 'dynamic parameters (a function on a parameter)', false,
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
  check('repsloop', 'repetitions alongside loop_function', false,
    /repetitions: \\d[\\s\\S]{0,80}loop_function/.test(all), 'no loop_function');
  check('repscond', 'repetitions alongside conditional_function', false,
    /repetitions: \\d[\\s\\S]{0,80}conditional_function/.test(all), 'no conditional_function');
  section = '循环与条件时间线';
  check('loopfn', 'loop_function', false, /loop_function/.test(all),
    'needs a function; the GUI has nowhere to put one');
  check('condfn', 'conditional_function', false, /conditional_function/.test(all),
    'needs a predicate; the GUI has nowhere to put one');
  section = '在运行时修改时间线';
  check('runtimepush', 'on_finish pushing onto the timeline', false,
    /addNodeToEndOfTimeline|main_timeline\\.push/.test(all),
    'on_finish is emitted only to score a trial');
  check('runtimepop', 'main_timeline.pop()', false, /main_timeline\\.pop/.test(all),
    'same');
  section = '时间线开始/结束回调';
  check('tlstart', 'on_timeline_start', false, /on_timeline_start/.test(all),
    'needs a function');
  check('tlfinish', 'on_timeline_finish', false, /on_timeline_finish/.test(all),
    'needs a function');
  section = '文档示例里的其它 API';
  check('init', 'initJsPsych()', true, /initJsPsych\\(/.test(all));
  check('comparekeys', 'jsPsych.pluginAPI.compareKeys()', true,
    /jsPsych\\.pluginAPI\\.compareKeys\\(/.test(all));
  check('lookback', 'jsPsych.data.get().last(1).values()[0]', false,
    /data\\.get\\(\\)\\.last\\(/.test(all),
    'that is how a branch reads the previous trial; ExpVis has no branching');
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
    n_absent = sum(1 for c in doc.values()
                   if c.get("expected") == "absent" and not c.get("self"))

    cases = res.get("cases", {})
    if "error" in cases:
        broken_cases = [f"phase cases threw: {cases['error']}"]
    else:
        # What each synthetic phase must compile to. `factored` is the point:
        # a phase whose trials are one procedure becomes a table, and every
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
            # no table, so no sampling and no randomize_order
            "sampling without the mode": [],
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
            if not c["noTokens"]:
                broken_cases.append(f"phase case {name}: an @@TOKEN@@ survived")
            if c.get("variablePlugin"):
                broken_cases.append(
                    f"phase case {name}: the plugin became a timeline variable — "
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
                    broken_cases.append(f"phase case {name}: the source was not emitted")
                if name.endswith("(replace)"):
                    if not c.get("replacesGenerated"):
                        broken_cases.append(
                            f"phase case {name}: the generated stimulus is still there")
                    if c["stimulusKeys"] != 1:
                        broken_cases.append(
                            f"phase case {name}: {c['stimulusKeys']} stimulus keys, expected 1")
                elif c["stimulusKeys"] != 1:
                    broken_cases.append(
                        f"phase case {name}: {c['stimulusKeys']} stimulus keys, expected 1")
            # (the null entries are the preload trial, which is a bare trial
            # rather than a node — the animation's frames are media)
            anim_nodes = [n for n in c["trialsPerNode"] if n is not None]
            if name == "animation trial" and anim_nodes != [1]:
                broken_cases.append(
                    f"phase case animation trial: node collects {anim_nodes}, "
                    f"expected [1] — the trial would be declared and never run")
            # A factored node holds the one procedure, not one entry per
            # condition. Keyed on the case's own result: `want` above is the
            # last value of a different loop.
            if c["factored"] and c["trialsPerNode"] != [1]:
                broken_cases.append(
                    f"phase case {name}: node should hold the one procedure, "
                    f"got {c['trialsPerNode']}")

    bad = 0
    broken = (list(broken_cases) + list(broken_media) + list(broken_contentless)
              + list(broken_doc))
    for name, t in res["templates"].items():
        struct = t["structure"]
        # Invariants that must hold whatever the bytes are.
        if struct["forbiddenParams"]:
            broken.append(f"{name}: node-level parameter(s) {struct['forbiddenParams']}")
        if any(n is None or n == 0 for n in struct["trialsPerNode"]):
            broken.append(f"{name}: a phase node collects no trials ({struct['trialsPerNode']})")
        if not t.get("publishedMatches"):
            broken.append(f"{name}: publish != export")
        if not t.get("noTokens"):
            broken.append(f"{name}: an internal @@TOKEN@@ survived into the output")

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
    if doc and "error" not in doc:
        print(f"\n  jsPsych timeline page: {n_present} present, {n_absent} deliberately "
              f"absent, {len(broken_doc)} wrong")
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
    lines = [
        "# jsPsych 时间线页 × ExpVis 实现现状",
        "",
        "> **本文件是生成物** —— `python3 tests/expvis_probe.py coverage` 重写它。",
        "> 数字来自探针的**实际运行结果**,不是手写的。改这里会被下次生成覆盖;",
        "> 要改结论就改 `tests/expvis_probe.py` 里的 `timelineDocCases()`。",
        "",
        "来源: <https://shaobin-jiang.github.io/jsPsych-Chinese-Documentation/v8/overview/timeline/>",
        "",
        f"**{len(present)} 条已实现 · {len(absent)} 条刻意不做 · "
        f"{len(present) + len(absent)} 条合计。**",
        "",
        "「刻意不做」都带理由 —— 它们是「可视化编辑器不该假装能做的事」,不是疏漏。",
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
            mark = "✅ 有" if c["expected"] == "present" else "❌ 不做"
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
