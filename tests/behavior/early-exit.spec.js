// Ending an experiment before the end.
//
// A participant who fails a screening question, or a study that has to stop
// someone part-way, still has data worth keeping — often the exclusion record
// is the whole point. jsPsych's `abortExperiment()` stops the timeline; the
// question these cases answer is whether anything downstream of the timeline
// still runs when it does.
//
// The timeline is patched directly here rather than built through a custom
// parameter, so the case tests the mechanism rather than the editor's plumbing
// for reaching it.

const H = require("./harness");

jest.useFakeTimers();

function twoTrials() {
  const pid = H.newExperiment();
  H.addTrialWith(pid, [
    ["text", { content: "FIRST" }],
    ["keyboard", { choices: ["a"], correctKey: "a" }],
  ]);
  H.addTrialWith(pid, [
    ["text", { content: "SECOND" }],
    ["keyboard", { choices: ["a"], correctKey: "a" }],
  ]);
  return H.runExperiment();
}

describe("aborting part-way", () => {
  test("the experiment ends and on_finish still runs", async () => {
    const exp = twoTrials();
    const first = exp.timeline[0].timeline[0];
    first.on_finish = () => exp.instance.abortExperiment("Stopped.");

    const done = exp.start();
    await H.until(exp, (e) => e.data().length > 0, { tries: 20, step: 200 });
    await H.pressKey("a");
    await H.flush();
    await Promise.race([done, H.flush()]);

    // on_finish is what shows the data and saves the file; the load-bearing
    // fact is that aborting does not skip it.
    expect(exp.instance.__displayed).toBe(true);
    expect(exp.instance.__saved).toBe(true);
  });

  test("the trials that did run are still in the data", async () => {
    const exp = twoTrials();
    const first = exp.timeline[0].timeline[0];
    first.on_finish = () => exp.instance.abortExperiment("Stopped.");

    const done = exp.start();
    await H.until(exp, (e) => e.data().length > 0, { tries: 20, step: 200 });
    await H.pressKey("a");
    await H.flush();
    await Promise.race([done, H.flush()]);

    const rows = H.trialData(exp);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].stimulus).toContain("FIRST");
    // and the trial that never happened is not in there pretending otherwise
    expect(rows.some((r) => String(r.stimulus || "").includes("SECOND"))).toBe(false);
  });
});

describe("aborting with a DataPipe destination", () => {
  test("the save trial never runs, so the data goes nowhere at all", async () => {
    // This is the hole. The save is a TRIAL at the end of the timeline — which
    // is how DataPipe documents it, and what makes the participant wait for it
    // — so a timeline that stops early stops before the save. Nothing is sent,
    // and nothing says so.
    H.resetPipe();
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["text", { content: "FIRST" }],
      ["keyboard", { choices: ["a"], correctKey: "a" }],
    ]);
    H.addTrialWith(pid, [
      ["text", { content: "SECOND" }],
      ["keyboard", { choices: ["a"], correctKey: "a" }],
    ]);
    const exp = H.runExperiment({ dataPipe: { experimentId: "abc123" } });
    const first = exp.timeline[0].timeline[0];
    first.on_finish = () => exp.instance.abortExperiment("Stopped.");

    const done = exp.start();
    await H.until(exp, (e) => e.data().length > 0, { tries: 20, step: 200 });
    await H.pressKey("a");
    await H.flush();
    await Promise.race([done, H.flush()]);

    // Recorded here as the CURRENT behaviour, so that a fix has something to
    // turn green rather than something to guess at.
    expect(H.pipeCalls).toHaveLength(0);
    // And it is worse than "the remote copy is missing": choosing DataPipe
    // removes the display-and-download branch from on_finish, because on a
    // remote study the participant should not be shown their own records. So
    // with the save trial skipped there is no copy anywhere.
    expect(exp.instance.__displayed).toBeUndefined();
    expect(exp.instance.__saved).toBeUndefined();
  });
});
