# ExpVis Editor

**A visual, component-based experiment builder that generates jsPsych code, powered by AI.**

ExpVis Editor is a browser-based tool for designing behavioral experiments without writing code. Researchers drag and drop components (text, shapes, keyboard responses, etc.) onto a visual canvas, preview experiments in real time on simulated devices, and export standard jsPsych code. AI-assisted experiment generation and multi-agent review are built in.

## Quick Start

```bash
git clone https://github.com/leechiushih-blip/expvis.git
cd expvis
open index.html    # That's it — no build step, no dependencies
```

Or try the [online demo](https://leechiushih-blip.github.io/expvis/).

## Features

| Category | Feature |
|----------|---------|
| **Visual Editor** | Drag-and-drop component assembly, 3-panel layout (toolbox/canvas/inspector) |
| **17 Components** | Text, shape, image, audio, video, fixation, keyboard, button, slider, click, text input, loop, branch, delay, randomize, variable |
| **Device Simulation** | 7 presets (iPhone, iPad, Samsung, Desktop...) with realistic bezels |
| **Three-Preview System** | Inline preview → visual position editor → fullscreen interactive preview |
| **jsPsych Export** | Generates standard jsPsych timeline code |
| **AI Generation** | Natural language → experiment structure (DeepSeek API) |
| **Multi-Agent Review** | Ethics, security, and methodology agents review experiments before publishing |
| **Templates** | 7 classic paradigms: Stroop, Simon, Flanker, IAT, Digit Span, BART, Ultimatum Game |
| **Version History** | Save, restore, and delete experiment versions |

## Project Structure

```
expvis-editor/
├── index.html              # Entry point
├── css/editor.css          # All styles
├── js/
│   ├── core.js             # State management, CRUD operations
│   ├── devices.js          # Device presets and selection
│   ├── components.js       # (in core.js) Component definitions
│   ├── dragdrop.js         # Drag and drop system
│   ├── flow.js             # Flow canvas rendering
│   ├── renderer.js         # Unified trial HTML renderer (renderTrialHTML)
│   ├── inspector.js        # Property panel
│   ├── preview.js          # Inline preview + visual position editor
│   ├── fullscreen.js       # Fullscreen interactive experiment preview
│   ├── undo.js             # Undo stack + quick layout
│   ├── codegen.js          # jsPsych code generation
│   ├── ai-generate.js      # AI experiment generation (DeepSeek API)
│   ├── ai-review.js        # Multi-agent experiment review
│   ├── version.js          # Version history
│   ├── publish.js          # Experiment publishing
│   ├── templates.js        # Classic experiment templates
│   ├── utils.js            # Keyboard shortcuts, context menu
│   └── onboarding.js       # First-run tutorial
├── schema/
│   └── experiment.schema.json  # Experiment data model (JSON Schema)
├── examples/
│   └── stroop.json         # Example: Stroop experiment
└── tests/
    └── verify.py           # Validation script
```

## Citation

If you use ExpVis Editor in your research, please cite:

```bibtex
@article{expvis2026,
  title = {ExpVis: A Visual, AI-Assisted Experiment Builder for Web-Based Behavioral Research},
  author = {...},
  journal = {Behavior Research Methods},
  year = {2026},
  note = {Under review}
}
```

## License

MIT License. See [LICENSE](LICENSE) for details.
