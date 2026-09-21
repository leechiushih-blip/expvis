// Branching, built out of conditional_function.
//
// ExpVis has no branch component — it was one of the four mechanisms deleted
// when the editor became a plain jsPsych timeline editor. What it has instead
// is the block-level condition (§45), which is jsPsych's own
// `conditional_function`: a node runs only if the condition holds.
//
// Two sibling blocks with opposite conditions are therefore a two-way branch —
// exactly one of them runs. That is an emergent property of the primitive, not
// something the editor draws, so it is worth proving rather than assuming.

const H = require("./harness");

jest.useFakeTimers();

// screen → pass | fail
//
// addBlock() returns nothing; the id is read off the block it just pushed.
function newBlock(name) {
  addBlock(name);
  return editor.blocks[editor.blocks.length - 1].id;
}

function branchOn(condPass, condFail) {
  resetEditor();
  H.addTrialWith(newBlock("screen"), [
    ["text", { content: "SCREEN" }],
    ["keyboard", { choices: ["a", "l"], correctKey: "a" }],
  ]);
  H.addTrialWith(newBlock("pass"), [["text", { content: "PASSED" }], ["keyboard", { choices: ["a"] }]]);
  H.addTrialWith(newBlock("fail"), [["text", { content: "FAILED" }], ["keyboard", { choices: ["a"] }]]);
  editor.blocks[1].cond = condPass;
  editor.blocks[2].cond = condFail;
  return H.runExperiment();
}

// The key that answers the SCREEN trial, then "a" for whatever the branch led
// to — both branch trials accept "a", and a press that lands between trials is
// dropped by jsPsych rather than misfiled.
//
// Driving once was the first thing this got wrong: the branch DOES fire, and
// then sits on a keyboard trial waiting for a response that never came, so the
// run looked like it had skipped both paths.
async function answer(exp, screenKey) {
  const done = exp.start();
  await H.until(exp, (e) => e.qs("#jspsych-html-keyboard-response-stimulus"));
  await H.pressKey(screenKey);
  for (let i = 0; i < 8; i++) {
    await H.advance(250);
    await H.pressKey("a");
  }
  await Promise.race([done, H.flush()]);
  return H.trialData(exp);
}

const onCorrect = (op, value) => ({ field: "correct", op, value });
const onResponse = (op, value) => ({ field: "response", op, value });

describe("two sibling blocks with opposite conditions", () => {
  // The condition always reads the IMMEDIATELY PRECEDING trial. After a branch
  // has run, that is the branch's own trial — not the screening one it was
  // meant to decide on. So the two conditions have to be mutually exclusive on
  // the VALUE ("is true" / "is false"), not on the negation ("is not true"):
  // on the branch trial that ran, `correct` is undefined, and `undefined !==
  // true` is true, so a negation lets the second branch through as well.
  test("a condition on `correct` sends the run down one path or the other", async () => {
    const right = await answer(
      branchOn(onCorrect("is", "true"), onCorrect("is", "false")),
      "a"
    );
    const rightText = right.map((r) => String(r.stimulus || "")).join(" ");
    expect(rightText).toContain("PASSED");
    expect(rightText).not.toContain("FAILED");

    const wrong = await answer(
      branchOn(onCorrect("is", "true"), onCorrect("is", "false")),
      "l"
    );
    const wrongText = wrong.map((r) => String(r.stimulus || "")).join(" ");
    expect(wrongText).toContain("FAILED");
    expect(wrongText).not.toContain("PASSED");
  });

  test("a condition on `response` branches on the key itself", async () => {
    // The other half of "jump on the input": comparing the response, not the
    // score. This goes through jsPsych's compareKeys rather than ===, which is
    // what makes it work for the plugins that record an array or an object.
    const right = await answer(
      branchOn(onResponse("is", "a"), onResponse("is not", "a")),
      "a"
    );
    const rightText = right.map((r) => String(r.stimulus || "")).join(" ");
    expect(rightText).toContain("PASSED");
    expect(rightText).not.toContain("FAILED");

    const wrong = await answer(
      branchOn(onResponse("is", "a"), onResponse("is not", "a")),
      "l"
    );
    const wrongText = wrong.map((r) => String(r.stimulus || "")).join(" ");
    expect(wrongText).toContain("FAILED");
    expect(wrongText).not.toContain("PASSED");
  });

  test("exactly one of the two runs — never both, never neither", async () => {
    const rows = await answer(
      branchOn(onCorrect("is", "true"), onCorrect("is", "false")),
      "a"
    );
    const text = rows.map((r) => String(r.stimulus || "")).join(" ");
    const ran = ["PASSED", "FAILED"].filter((w) => text.includes(w));
    expect(ran).toHaveLength(1);
  });

  test("the negated form lets BOTH branches through — the trap", async () => {
    // Recorded because it looks like the same thing written differently, and
    // is not. "correct is not true" is true of the branch trial that just ran,
    // so both the pass and the fail blocks execute one after the other.
    const rows = await answer(
      branchOn(onCorrect("is", "true"), onCorrect("is not", "true")),
      "a"
    );
    const text = rows.map((r) => String(r.stimulus || "")).join(" ");
    expect(text).toContain("PASSED");
    expect(text).toContain("FAILED");
  });
});
