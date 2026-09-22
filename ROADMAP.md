# ExpVis roadmap

What ExpVis does not do yet, and what would change that. Kept here rather than in
the paper: a published tutorial cannot be corrected, and this list changes.

The version a tutorial describes is named in every generated file, so a reader can
always get back to the build the text was written against.

## No integration path yet

These are the gaps a researcher would hit, not a wish list.

| Gap | What it means | What it would take |
|---|---|---|
| **Official jsPsych extensions** | `mouse-tracking`, `record-video`, `webgazer` — there is no route to them at all. The generated file has no `extensions` field and the script table carries no extension packages, so even a hand-written `extensions: [...]` fails: the script is not in the `<head>` | an `extensions` list on `initJsPsych`, a second package table for extensions alongside the plugin one, and a checkbox per experiment |
| **29 of the 52 official plugins** | `canvas-*` (all four response variants), `iat-*`, `serial-reaction-time*`, `visual-search-circle`, `maxdiff`, `same-different-*`, `virtual-chinrest`, `fullscreen`, `browser-check`, `call-function`, `instructions`, `initialize-camera` / `initialize-microphone`, `sketchpad`, `webgazer-*` | one line each in the plugin table sets the `<script>` and the loader; the work is in deciding what each one's fields should look like on the canvas |
| **`call-function`** | The one that matters most day to day. It is jsPsych's way to run arbitrary code mid-experiment, and it is how a researcher would end a session early — a screening question answered the wrong way, say | the same one line, plus a decision about how a function-valued field is edited and validated |

## Deep limits of the current model

| Limit | Why | Consequence |
|---|---|---|
| **A medium sharing the screen loses its playback parameters** | `trial_ends_after_audio`, `autoplay`, `start`, `stop` belong to the medium's own plugin, and a mixed screen takes the HTML path | ExpVis warns and names each parameter it is dropping, but it still does not emit them |
| **No blank interval** | `delay` was removed because it had no jsPsych counterpart, and inter-trial timing is now the fixation's duration | A fixation always draws a cross; there is no invisible pause |
| **Animation cannot be scored** | Its `response` is an array — the frame sequence — and `correctKey` is read only on the keyboard path | A "press when you see the target frame" design needs `on_finish` written by hand |
| **One screen per trial** | One plugin runs per trial, so one response component and one screen | Two stimuli shown one after the other is two trials, not one |
| **`render_on_canvas` for the IAT family** | No canvas rendering path | `canvas_size` is `[height, width]`, in that order, which is a silent trap for anyone adding it |

## Smaller things

- **The AI import does not validate the shape it is handed.** A block without
  `timeline` is repaired; a trial without `components` throws, and the message
  the researcher sees is a JavaScript error rather than a sentence.
- **The coverage table's judgements are hand-reviewed**, not derived. It is
  checked against jsPsych's timeline documentation, and the checks live in the
  probe, but a new jsPsych feature has to be noticed by a person first.

## How to propose something

Open an issue. If it is one of the plugin gaps above, the change is usually small
and the interesting part is the design question, not the code.
