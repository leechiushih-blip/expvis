// Every component type ExpVis offers, run for real.
//
// For each: build a one-trial experiment in the editor, compile it, run it
// under a real jsPsych, drive it the way a participant would, and assert what
// got recorded. This is the layer tests/expvis_probe.py has no equivalent of —
// the probe can show the generated source says `jsPsychSurveyHtmlForm`; only
// this can show the form renders and the answer comes back.
//
// Where jsdom cannot be faithful the assertion says so rather than pretending.
// Media is the whole of that: jsdom fetches and decodes nothing, so an image
// trial never renders and never ends. Those cases assert the routing — which
// plugin jsPsych was actually handed the trial to — and specifically not that
// anything played.

const H = require("./harness");

jest.useFakeTimers();

const IMG = { fileData: "data:image/png;base64,iVBORw0KGgo=", fileName: "p.png" };
const AUD = { fileData: "data:audio/wav;base64,UklGRg==", fileName: "t.wav" };
const VID = { fileData: "data:video/mp4;base64,AAAA", fileName: "c.mp4" };

// Build one trial, run it, hand back the experiment, its rows, and what was on
// screen *before* driving — the display element is cleared when a trial ends,
// so an assertion made afterwards reads an empty string.
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

// Every trial in a captured timeline, with nodes flattened away.
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

const press = (k) => async () => {
  await H.pressKey(k);
};

describe("text", () => {
  test("renders its content and records the key that ended it", async () => {
    // No response component, so the editor falls back to the keyboard plugin
    // with no `choices` — which is jsPsych's ALL_KEYS.
    const { rows, html } = await oneTrial([["text", { content: "HELLO" }]], {
      waitFor: "#jspsych-html-keyboard-response-stimulus",
      drive: press("q"),
    });
    expect(html).toContain("HELLO");
    expect(rows).toHaveLength(1);
    expect(rows[0].trial_type).toBe("html-keyboard-response");
    expect(rows[0].response).toBe("q");
  });
});

describe("shape", () => {
  test("renders a shape and records the ending key", async () => {
    const { html, rows } = await oneTrial([["shape", { shape: "circle" }]], {
      waitFor: "#jspsych-html-keyboard-response-stimulus",
      drive: press("q"),
    });
    // Drawn with CSS, not an <img>: the stage HTML carries the shape.
    expect(html).toContain("border-radius:50%");
    expect(rows[0].response).toBe("q");
  });
});

describe("fixation", () => {
  test("is a timed trial of its own that ends without a response", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["fixation", { trial_duration: 500 }]]);
    const exp = H.runExperiment();
    const done = exp.start();
    await H.until(exp, (e) => e.data().length > 0, { tries: 40, step: 100 });
    await done;

    const rows = exp.data();
    expect(rows).toHaveLength(1);
    expect(rows[0].trial_type).toBe("html-keyboard-response");
    // NO_KEYS: the display advances on the clock alone.
    expect(rows[0].response).toBeNull();
  });
});

describe("keyboard", () => {
  test("records the key, the rt, and scores it against correctKey", async () => {
    const { rows } = await oneTrial(
      [
        ["text", { content: "RED" }],
        ["keyboard", { choices: ["a", "l"], correctKey: "a" }],
      ],
      { waitFor: "#jspsych-html-keyboard-response-stimulus", drive: press("l") }
    );
    expect(rows[0].response).toBe("l");
    expect(rows[0].correct_response).toBe("a");
    // The wrong key: the on_finish the editor emits has to say so.
    expect(rows[0].correct).toBe(false);
  });
});

describe("button", () => {
  test("records the index of the button pressed", async () => {
    const { exp, rows } = await oneTrial(
      [
        ["text", { content: "Pick" }],
        ["button", { choices: ["Yes", "No"] }],
      ],
      {
        waitFor: "#jspsych-html-button-response-btngroup",
        drive: async (e) => {
          const btns = e.qsa(".jspsych-btn");
          expect(btns.map((b) => b.textContent)).toEqual(["Yes", "No"]);
          await H.click(btns[1]);
        },
      }
    );
    expect(rows[0].trial_type).toBe("html-button-response");
    // The response is the index, not the label.
    expect(rows[0].response).toBe(1);
  });
});

describe("slider", () => {
  test("records the slider value", async () => {
    const { rows } = await oneTrial(
      [
        ["text", { content: "Rate" }],
        ["slider", { min: 0, max: 100, step: 1, slider_start: 50 }],
      ],
      {
        waitFor: "#jspsych-html-slider-response-response",
        drive: async (e) => {
          const range = e.qs("#jspsych-html-slider-response-response");
          range.value = "73";
          await H.flush();
          await H.click(e.qs("#jspsych-html-slider-response-next"));
        },
      }
    );
    expect(rows[0].trial_type).toBe("html-slider-response");
    expect(Number(rows[0].response)).toBe(73);
  });
});

describe("textInput", () => {
  test("records what was typed, under the name the editor emits", async () => {
    const { rows } = await oneTrial(
      [["textInput", { questions: [{ prompt: "Name?", required: false }] }]],
      {
        waitFor: "#input-0",
        drive: async (e) => {
          e.qs("#input-0").value = "Blaze";
          await H.flush();
          await H.click(e.qs("#jspsych-survey-text-next"));
        },
      }
    );
    expect(rows[0].trial_type).toBe("survey-text");
    // The editor names every survey question Q0, Q1 … rather than taking a
    // name off the question, so the recorded key is Q0.
    expect(rows[0].response.Q0).toBe("Blaze");
  });
});

describe("likert", () => {
  test("records the chosen point on the scale", async () => {
    const { rows } = await oneTrial(
      [
        [
          "likert",
          { questions: [{ prompt: "Agree?", labels: ["No", "Neutral", "Yes"] }] },
        ],
      ],
      {
        waitFor: "input[type=radio]",
        drive: async (e) => {
          await H.click(e.qsa("input[type=radio]")[2]);
          await H.click(e.qs("#jspsych-survey-likert-next"));
        },
      }
    );
    // Three labels, and the third radio is the one clicked. The plugin records
    // `parseInt` of the radio's value, which is its 0-based index — so the
    // third option is 2, not 3.
    expect(rows[0].trial_type).toBe("survey-likert");
    expect(Object.values(rows[0].response)[0]).toBe(2);
  });
});

describe("multiChoice", () => {
  test("records the chosen option", async () => {
    const { rows } = await oneTrial(
      [
        [
          "multiChoice",
          { questions: [{ prompt: "Which?", options: ["A", "B", "C"] }] },
        ],
      ],
      {
        waitFor: "input[type=radio]",
        drive: async (e) => {
          await H.click(e.qsa("input[type=radio]")[1]);
          await H.click(e.qs("#jspsych-survey-multi-choice-next"));
        },
      }
    );
    expect(rows[0].trial_type).toBe("survey-multi-choice");
    expect(Object.values(rows[0].response)[0]).toBe("B");
  });
});

describe("multiSelect", () => {
  test("records every option ticked", async () => {
    const { rows } = await oneTrial(
      [
        [
          "multiSelect",
          { questions: [{ prompt: "Which?", options: ["A", "B", "C"] }] },
        ],
      ],
      {
        waitFor: "input[type=checkbox]",
        drive: async (e) => {
          const boxes = e.qsa("input[type=checkbox]");
          await H.click(boxes[0]);
          await H.click(boxes[2]);
          await H.click(e.qs("#jspsych-survey-multi-select-next"));
        },
      }
    );
    expect(rows[0].trial_type).toBe("survey-multi-select");
    expect(Object.values(rows[0].response)[0]).toEqual(["A", "C"]);
  });
});

describe("htmlForm", () => {
  test("renders the researcher's own form and records the submitted fields", async () => {
    // The default html carries a newline, and that newline used to reach the
    // generated file as a real line break inside a string literal — the whole
    // experiment failed to parse. This case is what found it.
    const { html, rows } = await oneTrial([["htmlForm", {}]], {
      waitFor: "#jspsych-survey-html-form",
      drive: async (e) => {
        const input = e.qs('input[name="answer"]');
        input.value = "42";
        await H.flush();
        await H.click(e.qs("input[type=submit]"));
      },
    });
    expect(html).toContain("<p>Question</p>");
    expect(rows[0].trial_type).toBe("survey-html-form");
    expect(rows[0].response.answer).toBe("42");
  });
});

describe("cloze", () => {
  test("renders one field per blank and records the answers", async () => {
    const { rows } = await oneTrial(
      [["cloze", { text: "The capital of France is %Paris%." }]],
      {
        waitFor: "#finish_cloze_button",
        drive: async (e) => {
          e.qs("#input0").value = "Paris";
          await H.flush();
          await H.click(e.qs("#finish_cloze_button"));
        },
      }
    );
    expect(rows[0].trial_type).toBe("cloze");
    expect(rows[0].response).toEqual(["Paris"]);
  });
});

describe("freeSort", () => {
  test("renders its arena and a way to finish", async () => {
    // Driving a drag in jsdom would assert jsdom's pointer-event support, not
    // the experiment. The arena rendering belongs here; the drag is the
    // plugin's, and it is the same plugin file the probe pins.
    const { exp } = await oneTrial([["freeSort", { stimuli: [] }]], {
      waitFor: "#jspsych-free-sort-arena",
    });
    expect(exp.qs("#jspsych-free-sort-arena")).toBeTruthy();
  });
});

describe("animation", () => {
  test("runs on the animation plugin and renders a canvas", async () => {
    const { exp } = await oneTrial([["animation", { frames: [] }]], {
      waitFor: "canvas",
    });
    expect(exp.qs("canvas")).toBeTruthy();
  });
});

// ---------------------------------------------------------------- media
//
// What jsdom can honestly answer about a medium is *where the trial went*: the
// editor's whole routing rule is "a single medium, alone on the screen, takes
// that medium's own plugin", and that decision is visible in the timeline
// jsPsych was handed — plugin identity by class, not a string in a source file.
// Whether the file then plays is not answerable here, and is not asserted.

describe("a medium alone on the screen", () => {
  test("hands the image trial to the image keyboard plugin", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["image", IMG], ["keyboard", {}]]);
    const exp = H.runExperiment();
    const trial = trialsIn(exp.timeline).find((t) =>
      String(t.type && t.type.info && t.type.info.name).startsWith("image-")
    );
    expect(trial).toBeTruthy();
    expect(trial.type).toBe(H.PLUGINS.jsPsychImageKeyboardResponse);
    expect(trial.stimulus).toContain("p.png");
  });

  test("hands the audio trial to the audio keyboard plugin", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["audio", AUD], ["keyboard", {}]]);
    const exp = H.runExperiment();
    const trial = trialsIn(exp.timeline).find((t) =>
      String(t.type && t.type.info && t.type.info.name).startsWith("audio-")
    );
    expect(trial.type).toBe(H.PLUGINS.jsPsychAudioKeyboardResponse);
    expect(trial.stimulus).toContain("t.wav");
  });

  test("hands the video trial to the video keyboard plugin, with an array stimulus", async () => {
    const pid = H.newExperiment();
    H.addTrialWith(pid, [["video", VID], ["keyboard", {}]]);
    const exp = H.runExperiment();
    const trial = trialsIn(exp.timeline).find((t) =>
      String(t.type && t.type.info && t.type.info.name).startsWith("video-")
    );
    expect(trial.type).toBe(H.PLUGINS.jsPsychVideoKeyboardResponse);
    // The video plugin takes an ARRAY of sources where the audio plugin takes
    // one — the asymmetry the editor has to special-case.
    expect(Array.isArray(trial.stimulus)).toBe(true);
  });

  test("falls back to the HTML plugin when the medium shares the screen", async () => {
    // A caption beside a picture is a real design, and no image plugin can do
    // it: the plugin owns `stimulus`. This path renders in jsdom, so it is
    // driven rather than inspected.
    const { html, rows } = await oneTrial(
      [["image", IMG], ["text", { content: "a caption" }], ["keyboard", {}]],
      {
        waitFor: "#jspsych-html-keyboard-response-stimulus",
        drive: press("a"),
      }
    );
    expect(rows[0].trial_type).toBe("html-keyboard-response");
    expect(html).toContain("a caption");
  });
});
