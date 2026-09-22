// DataPipe: sending the data somewhere instead of back with the participant.
//
// Nothing here talks to pipe.jspsych.org. The plugin is a recording stub, so
// what is asserted is the request the experiment would make. A test that
// really posted would write rows into somebody's study.

const H = require("./harness");

jest.useFakeTimers();

const DP = { dataPipe: { experimentId: "abc123" } };

beforeEach(() => H.resetPipe());

function trialsIn(timeline) {
  const out = [];
  (function walk(tl) {
    (Array.isArray(tl) ? tl : [tl]).forEach((node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node.timeline)) return walk(node.timeline);
      out.push(node);
    });
  })(timeline);
  return out;
}

describe("with a DataPipe destination set", () => {
  test("the experiment carries a save trial, at the end", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["text", { content: "HI" }], ["keyboard", {}]]);
    const exp = H.runExperiment(DP);
    const trials = trialsIn(exp.timeline);
    expect(trials[trials.length - 1].type).toBe(H.PLUGINS.jsPsychPipe);
    expect(trials[0].type).not.toBe(H.PLUGINS.jsPsychPipe);
  });

  test("it declares the plugin, so the file loads it", () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["text", { content: "HI" }], ["keyboard", {}]]);
    expect(H.compile(DP).usedPlugins.jsPsychPipe).toBe(true);
  });

  test("what it sends is the experiment id, a unique name, and the data so far", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["text", { content: "RED" }],
      ["keyboard", { choices: ["a", "l"], correctKey: "a" }],
    ]);
    const exp = H.runExperiment(DP);
    exp.start();
    await H.until(exp, (e) => e.qs("#jspsych-html-keyboard-response-stimulus"));
    await H.pressKey("a");
    await H.until(exp, (e) => H.pipeCalls.length > 0, { tries: 40, step: 250 });

    expect(H.pipeCalls).toHaveLength(1);
    const call = H.pipeCalls[0];
    expect(call.action).toBe("save");
    expect(call.experiment_id).toBe("abc123");
    // DataPipe rejects a filename that already exists, so it cannot be a fixed
    // name — and it is generated per run, not per experiment.
    expect(call.filename).toMatch(/^[A-Za-z0-9]{10}\.csv$/);
    // `data_string` is evaluated at the trial, so it holds the trials that have
    // already run.
    expect(call.data_string).toContain("RED");
    expect(call.data_string).toContain("html-keyboard-response");
  });

  test("the participant is not shown the data table or asked to save a file", () => {
    // On a remote study the table is the participant reading their own records,
    // and the download prompt asks them for a file the researcher already has.
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["text", { content: "HI" }], ["keyboard", {}]]);
    const code = H.compile(DP).code;
    expect(code).not.toContain("displayData");
    expect(code).not.toContain("localSave");
    // …and the JATOS branch is left where it was, so one file still works in
    // both places.
    expect(code).toContain("jatos.submitResultData");
  });
});

describe("with no DataPipe destination set", () => {
  test("nothing changes", () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["text", { content: "HI" }], ["keyboard", {}]]);
    const code = H.compile({}).code;
    const trials = trialsIn(H.runExperiment({}).timeline);
    expect(trials.some((t) => t.type === H.PLUGINS.jsPsychPipe)).toBe(false);
    expect(H.compile({}).usedPlugins.jsPsychPipe).toBeUndefined();
    // The default has to stay exactly what it was: a participant who sends
    // their file back is still the default for a file opened from an email.
    expect(code).toContain("displayData");
    expect(code).toContain("localSave");
  });

  test("an empty experiment id is treated as not set", () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["text", { content: "HI" }], ["keyboard", {}]]);
    const trials = trialsIn(H.runExperiment({ dataPipe: { experimentId: "" } }).timeline);
    expect(trials.some((t) => t.type === H.PLUGINS.jsPsychPipe)).toBe(false);
  });
});
