# ExpVis

**A visual experiment builder whose output is standard jsPsych.**

ExpVis is a browser-based editor for behavioral experiments. Researchers assemble
stimuli, responses and block-level structure on a canvas, preview the result on a
simulated device, and export a jsPsych experiment. There is no server, no build step
and no installation: opening `index.html` gives a working editor.

It is neither a wrapper around jsPsych nor a system with a representation of its own.
Its data model **is** jsPsych's timeline model — a block compiles to a timeline node, a
trial compiles to a plugin invocation, and a component resolves to a jsPsych plugin.
The visual editor and the code panel edit the same experiment definition, and the file
it publishes is byte-for-byte the code it exports.

## Quick start

```bash
git clone https://github.com/leechiushih-blip/expvis.git
cd expvis
open index.html
```

Or use the [online demo](https://leechiushih-blip.github.io/expvis/).

## The three-level model

```
experiment  →  blocks  →  trials  →  components
               ↓            ↓
        timeline node   plugin invocation
```

One trial is **one screen** and takes **at most one response component**. This is not a
simplification ExpVis imposes; it follows from the plugin model, where a trial compiles
to a single plugin invocation and a plugin renders one screen and defines one response
mode. Several stimuli may share a screen because they only contribute to it. A second
response component would require a second plugin, so the editor does not offer one.

## Components

Seventeen types, in three groups. Fields listed are those the editor exposes; the
generated experiment emits jsPsych's own parameter names.

| Group | Components |
|---|---|
| **Stimuli** | `text` `shape` `image` `audio` `video` `fixation` |
| **Responses** | `keyboard` `button` `slider` `textInput` `likert` `multiChoice` `multiSelect` `htmlForm` |
| **Whole-trial** | `animation` `cloze` `freeSort` |

A standalone image, audio or video component maps to that medium's own response plugin
(`jsPsychImageKeyboardResponse`, `jsPsychAudioSliderResponse`, …). Sharing the screen
with another component routes it through the HTML path instead, and the editor names
the playback parameters that path cannot carry rather than dropping them silently.

Whole-trial components occupy the trial and cannot be combined with another response.

Filling `correct_text` / `incorrect_text` on a keyboard component moves the trial onto
jsPsych's own scoring plugin, which compares the response and renders the message
itself. That places one constraint the editor states when it is reached: such a trial
must name exactly one correct key, because the plugin scores against a single key.

## Block-level structure

Everything a trial cannot express lives on the block, and all of it is native jsPsych
node parameters — not substitutes:

| Parameter | What it does |
|---|---|
| `repetitions` | runs the block's timeline N times |
| `sample` | draws a subset, with or without replacement |
| `randomize_order` | shuffles the order of each run |
| `conditions` | folds same-shaped trials into one procedure plus a `timeline_variables` table |
| `loop_function` | repeats while a condition holds |
| `conditional_function` | runs the block only if a condition holds |

`conditions` is applied **only when the researcher asks for it**, never inferred. Two
trials that happen to share a shape are indistinguishable in the data model from two
conditions of one procedure, and a compiler that reads the second from the first is
asserting an intention nobody expressed.

## Preview, export and data return

Preview offers three views — an inline device preview, a layout preview with zoom, and a
fullscreen runner. All reuse the same HTML the export produces, so there is no second
rendering path to drift.

At export time the researcher chooses how participant data returns, because the choice
changes the artifact rather than the experiment:

- **A standalone HTML file**, or a `.zip` bundling it with its assets (`img/…`)
- **A JATOS package** (`.jzip`), submitted via `jatos.submitResultData`
- **DataPipe**, which uploads at the end of the timeline

The JATOS branch is guarded by `window.jatos`, so one file works both on a JATOS server
and opened from a filesystem.

## AI-assisted generation

A natural-language description produces an editable structure — the same JSON the editor
stores, loaded onto the canvas as an ordinary experiment. It cannot produce anything the
editor could not produce by hand.

Four providers are built in — OpenAI, DeepSeek, Anthropic Claude, and Qwen — and any
OpenAI-compatible endpoint can be added. The model field accepts any string: which models
exist is a fact the provider owns, and a copy of it inside a static file goes stale. The
built-in names are suggestions, and a refresh control asks the provider directly which
models the key can use.

## Templates

Five templates ship with the editor. They are demonstrations of structure rather than
five finished experiments: each shows one thing the others do not.

| Template | Demonstrates |
|---|---|
| **Stroop** | the condition table — one procedure, a `timeline_variables` array, 48 repetitions |
| **Simon** | scoring and in-trial feedback via jsPsych's scoring plugin |
| **Flanker** | sampling — define every condition, run a subset |
| **Branching** | `conditional_function`, and the trap in writing a two-way branch |
| **Survey** | the survey family, and one trial per screen |

## Versions

Every generated file names the version of ExpVis that wrote it and where to retrieve it:

```
Generated by ExpVis v1.0.0 on 2026-09-21 | Device: Desktop
Target: jsPsych v8.3.0
Editor: https://github.com/leechiushih-blip/expvis (tag v1.0.0)
```

A published tutorial outlives the software it describes. The version is changed
deliberately rather than per commit, and the editor's own header reads the same constant.

## Verification

Two automated layers run on every push. Neither needs a browser session or a human
observer.

```bash
node --check js/editor.js              # syntax
python3 tests/expvis_probe.py check    # text layer: byte-exact baselines + structural assertions
npm test                               # behavioural layer: each component against real jsPsych
```

The probe has three more commands, none of which belong on a push:

```bash
python3 tests/expvis_probe.py coverage      # write the coverage table, under docs/ (gitignored)
python3 tests/expvis_probe.py dump stroop   # print one template's generated file
python3 tests/expvis_probe.py save          # re-record the baselines
```

`save` is the one to be careful with. It exists for a change that was intended: without
it, the baselines would have to be edited by hand, which is how a regression gets
recorded as correct. Run it when the output is supposed to differ and you can say why —
never to make a red build go green.

`coverage` writes into `docs/`, which is not in the repository — the probe creates the
directory. The numbers it prints come from the same run as the checks, so the table
cannot drift from them.

**The text layer** generates each template and compares it byte-for-byte against a stored
baseline, then asserts what a text match cannot see: which plugin each trial resolves to,
which parameters were emitted and which deliberately omitted, how many trials each node
collects, that the published artifact equals the exported code. It also maintains a
coverage table against jsPsych's timeline documentation — of 34 documented mechanisms, 24
are emitted, 9 are reachable by hand, and 1 cannot be expressed. The table is generated by
the code that enforces the assertions, so it cannot drift toward optimism.

**The behavioural layer** runs each component against a real jsPsych instance in jsdom,
drives it with real events, and asserts what was recorded. It found three defects on its
first run, none of which were visible in the generated source: a form whose default value
broke string escaping and made the whole file unparseable, a Likert scale that rendered as
a single radio button, and an audio trial with feedback routed to the image scoring plugin.
A test that cannot fail is worse than no test, so weakening the behaviour under test and
confirming the test goes red is treated as part of writing it.

## Project structure

```
expvis-editor/
├── index.html              # entry point
├── css/editor.css
├── js/editor.js            # the entire editor — one file, no modules, no build
├── tests/
│   ├── expvis_probe.py     # text layer (headless Chrome, byte-exact goldens)
│   ├── golden/             # stored baselines
│   ├── behavior/           # behavioural layer (jest + jsdom)
│   └── setup/              # loads editor.js into the jsdom global
├── examples/
├── package.json            # dev-only: test dependencies, never shipped
├── jest.config.js
└── ROADMAP.md              # known gaps, what each would take
```

`index.html` loads exactly one script, `js/editor.js`, and nothing else. Even the `.zip`
writer is implemented in place rather than pulled in as a dependency.

## Limitations

The largest gap is jsPsych's **extension system**: `mouse-tracking`, `record-video` and
`webgazer` have no route into a generated experiment at all, because the output carries no
`extensions` field and the script table bundles no extension packages. A further 29 of
jsPsych's 52 official plugins cannot be reached, including `call-function` — jsPsych's way
of running arbitrary code mid-experiment. Nested conditionals, dynamic branching and
cross-block state still require hand-written code.

The full list, with what each gap would take, is kept in [ROADMAP.md](ROADMAP.md) rather
than here, so that it can be corrected as the software changes.

## License

MIT. See [LICENSE](LICENSE).
