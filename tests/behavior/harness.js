// Runs an experiment ExpVis generated, in jsdom, against the real jsPsych.
//
// The shape of the problem: tests/expvis_probe.py proves the generated *text*
// is right by regex-matching it and by evaluating it under a jsPsych stub. That
// leaves the question the probe cannot answer — does the experiment actually
// run? This harness closes it: the generated code is evaluated against a real
// jsPsych instance, the timeline is captured, and the experiment is driven with
// real events so the recorded data can be asserted.
//
// The plugin versions here must match the ones js/editor.js pins in
// _jspsychPluginCDN, because those are the ones a researcher's browser fetches.
// tests/behavior/versions.spec.js holds the two together.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// The globals a generated file expects: they are set in the browser by the
// <script src="unpkg..."> tags _cdnTags() writes into the <head>, and here they
// are passed in by name.
// jsdom fetches and decodes no resources, so the real preloader can never
// finish — and its failure path reads `e.error.statusText`, which jsdom does
// not supply, so it takes the run down with a TypeError instead. Media loading
// is the one thing this environment cannot speak to at all; stubbing the
// preloader lets the assertions below it — which plugin the trial routed to,
// what it was handed — still be made honestly. What those assertions do NOT
// claim is that the file plays.
class PreloadStub {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }
  trial() {
    // The trial still has to be ENDED. The real plugin resolves every file and
    // then calls finishTrial; a stub that only returns leaves jsPsych waiting
    // on it forever, so the experiment never starts and every assertion after
    // it reads an empty display element.
    this.jsPsych.finishTrial();
  }
}
PreloadStub.info = { name: "preload", version: "stub", parameters: {}, data: {} };

// The real pipe plugin POSTs to pipe.jspsych.org. A test must never do that —
// it would write rows into a real researcher's study, and the filenames it is
// told to use are random. So this records what the experiment WOULD have sent
// and ends the trial; what the assertions below it check is the request: the
// experiment id, the filename, and the payload.
const pipeCalls = [];
class PipeStub {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }
  trial(display_element, trial) {
    const value = (v) => (typeof v === "function" ? v() : v);
    pipeCalls.push({
      action: trial.action,
      experiment_id: trial.experiment_id,
      filename: value(trial.filename),
      data_string: value(trial.data_string),
    });
    this.jsPsych.finishTrial({});
  }
}
PipeStub.info = { name: "pipe", version: "stub", parameters: {}, data: {} };
function resetPipe() {
  pipeCalls.length = 0;
}

const PLUGINS = {
  jsPsychPreload: PreloadStub,
  jsPsychPipe: PipeStub,
  jsPsychHtmlKeyboardResponse: require("@jspsych/plugin-html-keyboard-response"),
  jsPsychHtmlButtonResponse: require("@jspsych/plugin-html-button-response"),
  jsPsychHtmlSliderResponse: require("@jspsych/plugin-html-slider-response"),
  jsPsychImageKeyboardResponse: require("@jspsych/plugin-image-keyboard-response"),
  jsPsychImageButtonResponse: require("@jspsych/plugin-image-button-response"),
  jsPsychImageSliderResponse: require("@jspsych/plugin-image-slider-response"),
  jsPsychAudioKeyboardResponse: require("@jspsych/plugin-audio-keyboard-response"),
  jsPsychAudioButtonResponse: require("@jspsych/plugin-audio-button-response"),
  jsPsychAudioSliderResponse: require("@jspsych/plugin-audio-slider-response"),
  jsPsychVideoKeyboardResponse: require("@jspsych/plugin-video-keyboard-response"),
  jsPsychVideoButtonResponse: require("@jspsych/plugin-video-button-response"),
  jsPsychVideoSliderResponse: require("@jspsych/plugin-video-slider-response"),
  jsPsychSurveyText: require("@jspsych/plugin-survey-text"),
  jsPsychSurveyLikert: require("@jspsych/plugin-survey-likert"),
  jsPsychSurveyMultiChoice: require("@jspsych/plugin-survey-multi-choice"),
  jsPsychSurveyMultiSelect: require("@jspsych/plugin-survey-multi-select"),
  jsPsychSurveyHtmlForm: require("@jspsych/plugin-survey-html-form"),
  jsPsychAnimation: require("@jspsych/plugin-animation"),
  jsPsychCloze: require("@jspsych/plugin-cloze"),
  jsPsychFreeSort: require("@jspsych/plugin-free-sort"),
  jsPsychCategorizeHtml: require("@jspsych/plugin-categorize-html"),
  jsPsychCategorizeImage: require("@jspsych/plugin-categorize-image"),
};

// ---------------------------------------------------------------- building
//
// addComponent() and addTrial() do not return what they made — the id has to be
// re-read from editor.selectedTrial, and the component is the one just pushed.
// Every case in the probe does this, so every spec here does it too.

function newExperiment() {
  resetEditor();
  addPhase("trials");
  return editor.phases[0].id;
}

function addTrialWith(pid, spec) {
  addTrial(pid);
  const t = findTrial(editor.selectedTrial);
  spec.forEach(([type, props]) => {
    addComponent(t.id, type, props && props.cat ? props.cat : "s");
    const c = t.components[t.components.length - 1];
    Object.keys(props || {}).forEach((k) => {
      if (k !== "cat") c[k] = props[k];
    });
  });
  return t;
}

// The source of the experiment, straight from the compiler the editor uses.
function compile(opts) {
  return _compileExperiment(opts || {});
}

// ---------------------------------------------------------------- running

const jspsych = require("jspsych");

/**
 * Evaluates generated source against a real jsPsych instance.
 *
 * The instance has to be real rather than a stub: `loop_function` and
 * `conditional_function` close over `jsPsych` and call `jsPsych.data.get()` at
 * run time, so a stub would make those two mechanisms untestable — and they are
 * exactly the ones worth testing.
 *
 * `jsPsych.run` is swapped out for a capturer so the timeline can be inspected
 * before it runs; `start()` swaps it back and runs for real.
 */
function loadGenerated(code) {
  let instance = null;
  let timeline = null;
  let realRun = null;

  const initJsPsych = (settings) => {
    instance = jspsych.initJsPsych(settings);
    realRun = instance.run.bind(instance);
    instance.run = (tl) => {
      timeline = tl;
    };
    // The generated on_finish shows a data table and downloads a CSV. Neither
    // belongs in a test run; the table also rewrites the document under the
    // assertions.
    instance.data.displayData = () => {
      instance.__displayed = true;
    };
    instance.data.get().localSave = () => {
      instance.__saved = true;
    };
    return instance;
  };

  const names = ["jsPsych", "initJsPsych"].concat(Object.keys(PLUGINS));
  const values = [jspsych, initJsPsych].concat(Object.values(PLUGINS));
  // eslint-disable-next-line no-new-func
  new Function(...names, code)(...values);

  if (!instance) throw new Error("the generated code never called initJsPsych");
  if (!timeline) throw new Error("the generated code never called jsPsych.run");

  return {
    instance,
    timeline,
    start: () => realRun(timeline),
    data: () => instance.data.get().values(),
    // Every query has to go through the display element. The editor's own page
    // is in the same document — its undo button, its device inputs — so an
    // unscoped `document.querySelector('button')` finds the editor's chrome,
    // not the experiment's.
    display: () => instance.getDisplayElement(),
    html: () => instance.getDisplayElement().innerHTML,
    qs: (sel) => instance.getDisplayElement().querySelector(sel),
    qsa: (sel) => [...instance.getDisplayElement().querySelectorAll(sel)],
  };
}

// Compile and load in one step — what most specs want.
function runExperiment(opts) {
  return loadGenerated(compile(opts).code);
}

// A trial carrying an asset is preceded by jsPsychPreload, and the real preload
// plugin records a row of its own — this harness's stub finishes the same way,
// so what you see here is what a browser produces. It is bookkeeping rather
// than a screen the participant saw, so assertions about participant data go
// through here.
function trialData(exp) {
  return exp.data().filter((r) => r.trial_type !== "preload");
}

// ---------------------------------------------------------------- driving

// jsdom has no setImmediate, and under jest's fake timers a bare
// `setTimeout(resolve, 0)` never fires unless the clock is advanced — awaiting
// it would deadlock. So: settle the microtask queue, then run any zero-delay
// macrotask jsPsych queued, then settle again.
function flush() {
  return Promise.resolve()
    .then(() => {})
    .then(() => {})
    .then(() => {
      try {
        jest.advanceTimersByTime(0);
      } catch (e) {
        /* real timers installed, or jest not present: nothing to advance */
      }
    })
    .then(() => {});
}

function dispatch(event, target) {
  (target || document.body).dispatchEvent(event);
  return flush();
}

// jsPsych listens for the key on the display root, not on `document`, and an
// event dispatched at `document` never reaches it. `bubbles` lets either work.
function keyDown(key) {
  return dispatch(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function keyUp(key) {
  return dispatch(new KeyboardEvent("keyup", { key, bubbles: true }));
}

function pressKey(key) {
  return keyDown(key).then(() => keyUp(key));
}

function click(target) {
  target.click();
  return flush();
}

function clickSelector(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error("nothing matched " + sel);
  return click(el);
}

// With jest fake timers installed, the only way to let a trial_duration elapse.
async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await flush();
  await flush();
}

// Let time pass until `predicate(exp)` holds, or give up.
//
// Two things make a plain "advance once and look" wrong. A trial carrying an
// asset runs jsPsychPreload first, so what should be on screen immediately is
// not. And a timed trial needs the clock to move before it ends. Advancing
// until the condition is true is right for both, and it stops as soon as it is
// — which matters under fake timers, where overshooting can end a trial the
// assertion was about to inspect.
async function until(exp, predicate, { tries = 60, step = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (predicate(exp)) return true;
    await advance(step);
  }
  return false;
}

// Run to the end: let time pass, press a key, repeat — until jsPsych resolves
// its run promise or the budget runs out. `finished` distinguishes "the
// experiment ended" from "the loop gave up", which is the difference between a
// passing assertion and an experiment that quietly stopped advancing.
//
// The step matters. A round shorter than the longest timed trial in the
// experiment declares the end during a fixation; `rounds * step` has to exceed
// the experiment's own duration.
async function driveToEnd(exp, { key = "a", step = 500, rounds = 60 } = {}) {
  let finished = false;
  let failure = null;
  const done = exp.start().then(
    () => {
      finished = true;
    },
    (e) => {
      failure = e;
    }
  );

  for (let i = 0; i < rounds && !finished && !failure; i++) {
    await advance(step);
    if (finished || failure) break;
    await pressKey(key);
  }
  await flush();
  await flush();
  // Give an already-resolved run promise a chance to set the flag.
  await Promise.race([done, flush()]);
  if (failure) throw failure;
  return { finished, data: exp.data() };
}

module.exports = {
  PLUGINS,
  ROOT,
  newExperiment,
  addTrialWith,
  compile,
  loadGenerated,
  runExperiment,
  trialData,
  pipeCalls,
  resetPipe,
  flush,
  dispatch,
  keyDown,
  keyUp,
  pressKey,
  click,
  clickSelector,
  advance,
  until,
};
