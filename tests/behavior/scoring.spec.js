// Scoring and in-trial feedback (§51). The editor answers a filled feedback
// message by moving the trial onto jsPsych's categorize plugin, which scores
// the response and shows the message itself.

const H = require("./harness");

jest.useFakeTimers();

const IMG = { fileData: "data:image/png;base64,iVBORw0KGgo=", fileName: "p.png" };
const AUD = { fileData: "data:audio/wav;base64,UklGRg==", fileName: "t.wav" };

function kb(extra) {
  return ["keyboard", Object.assign({ choices: ["f", "j"], correctKey: "f" }, extra)];
}

async function oneTrial(spec, { drive, waitFor } = {}) {
  const pid = H.newExperiment();
  H.addTrialWith(pid, spec);
  const exp = H.runExperiment();
  exp.start();
  await H.flush();
  if (waitFor) await H.until(exp, () => exp.qs(waitFor));
  const html = exp.html();
  if (drive) await drive(exp);
  await H.flush();
  await H.flush();
  return { exp, rows: H.trialData(exp), html };
}

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

describe("a feedback message", () => {
  test("shows the message and lets the plugin score the response", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["text", { content: "RED" }],
      kb({ correct_text: "Correct!", incorrect_text: "Wrong." }),
    ]);
    const exp = H.runExperiment();
    exp.start();
    await H.until(exp, (e) => e.qs("#jspsych-categorize-html-stimulus"));
    expect(exp.qs("#jspsych-categorize-html-stimulus")).toBeTruthy();

    // The wrong key: the message that appears has to be the incorrect one.
    await H.pressKey("j");
    await H.advance(100);
    expect(exp.html()).toContain("Wrong.");

    // The plugin ends the trial itself after `feedback_duration`; it is not
    // dismissed by a key.
    await H.until(exp, (e) => H.trialData(e).length > 0, { tries: 40, step: 250 });
    const row = H.trialData(exp)[0];
    expect(row.trial_type).toBe("categorize-html");
    // Scored by the plugin, not by the editor: there is no `data.correct_response`
    // and no on_finish of the editor's on this path, so the trial is judged
    // wrong without the editor ever judging it.
    expect(row.correct).toBe(false);
    expect(row.correct_response).toBeUndefined();

    // `key_answer` is a parameter the plugin scores against, not a recorded
    // column — it lives on the trial jsPsych was handed.
    const trial = trialsIn(exp.timeline).find(
      (t) => t.type === H.PLUGINS.jsPsychCategorizeHtml
    );
    expect(trial.key_answer).toBe("f");
    expect(trial.correct_text).toBe("Correct!");
    expect(trial.incorrect_text).toBe("Wrong.");
  });

  test("needs exactly one correct key, and says so when given several", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["text", { content: "RED" }],
      kb({ correctKey: "f,j", correct_text: "Correct!" }),
    ]);
    const exp = H.runExperiment();
    const trials = trialsIn(exp.timeline);
    // Several keys: categorize cannot score against one, so it is not used.
    expect(trials.some((t) => t.type === H.PLUGINS.jsPsychCategorizeHtml)).toBe(false);
    expect(trials.some((t) => t.type === H.PLUGINS.jsPsychHtmlKeyboardResponse)).toBe(true);
  });
});

describe("the categorize variant follows the MEDIUM", () => {
  // CategorizeImage takes the picture as `stimulus` and hands it to an <img>.
  // CategorizeHtml takes an HTML string. The editor picks between them on
  // `mediaPlugin`, which is truthy for ANY single medium — audio and video
  // included — so an audio-only feedback trial was routed to the image variant
  // while being handed an audio path.
  test("an image trial gets the image variant", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["image", IMG],
      kb({ correct_text: "Correct!", incorrect_text: "Wrong." }),
    ]);
    const exp = H.runExperiment();
    const trial = trialsIn(exp.timeline).find((t) =>
      String(t.type && t.type.info && t.type.info.name).startsWith("categorize-")
    );
    expect(trial.type).toBe(H.PLUGINS.jsPsychCategorizeImage);
    expect(trial.stimulus).toContain("p.png");
  });

  test("an audio trial does NOT get the image variant", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [
      ["audio", AUD],
      kb({ correct_text: "Correct!", incorrect_text: "Wrong." }),
    ]);
    const exp = H.runExperiment();
    const trial = trialsIn(exp.timeline).find((t) =>
      String(t.type && t.type.info && t.type.info.name).startsWith("categorize-")
    );
    // The image plugin would be handed `snd/t.wav` as its `stimulus` and try to
    // draw it as a picture. Whatever the editor decides here, it cannot be
    // CategorizeImage.
    expect(trial.type).not.toBe(H.PLUGINS.jsPsychCategorizeImage);
  });
});
