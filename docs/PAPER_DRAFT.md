# ExpVis: A Visual, AI-Assisted Experiment Builder for Web-Based Behavioral Research

## Abstract

Web-based data collection is increasingly central to behavioral research, yet constructing online experiments remains a technical barrier for researchers without programming expertise. While libraries such as jsPsych have simplified the coding of browser-based paradigms, and tools like lab.js have introduced visual editing, no existing platform combines visual experiment construction with AI-assisted generation and automated quality review. We introduce ExpVis, a free, open-source experiment builder that enables researchers to design behavioral experiments through a component-based visual interface, generate jsPsych code automatically, and leverage large language models for both experiment generation and multi-agent peer review. ExpVis provides 17 stimulus, response, and logic components that can be assembled via drag-and-drop, a three-tier preview system for real-time visualization across simulated devices, and one-click publication of standalone experiment files with built-in data collection and dashboards. We describe the system architecture, provide step-by-step tutorials for constructing classic paradigms (Stroop, Simon, Flanker), and evaluate the fidelity of AI-generated experiment structures. ExpVis is freely available under the MIT license at [repository URL].

**Keywords:** Experiment builder · Online experiments · Visual editor · jsPsych · AI-assisted · Open source

---

## Introduction

The shift toward online data collection in behavioral research has been driven by the promise of larger, more diverse samples, faster data collection, and reduced costs compared to laboratory-based studies (Buhrmester, Kwang, & Gosling, 2011; Crump, McDonnell, & Gureckis, 2013). The browser has become a ubiquitous platform for experimental research, capable of presenting complex stimuli and recording responses with high temporal precision (de Leeuw, 2015; Hilbig, 2016).

However, the technical expertise required to create browser-based experiments has limited broader adoption. Researchers have historically faced a choice: learn JavaScript and HTML to build experiments from scratch, rely on pre-made templates that constrain experimental design, or use commercial platforms that introduce cost and vendor lock-in. While dedicated libraries like jsPsych (de Leeuw, 2015) and PsychoPy (Peirce et al., 2019) have greatly simplified experiment programming, they still require researchers to write code. Recognizing this barrier, visual experiment builders such as lab.js (Henninger et al., 2022), Gorilla (Anwyl-Irvine et al., 2020), and the PsychoPy Builder have introduced graphical interfaces that allow researchers to construct experiments without programming. These tools represent important advances, yet they leave two significant gaps unaddressed.

First, none of the existing visual builders incorporate artificial intelligence to assist in the experiment creation process. With the emergence of large language models (LLMs) capable of generating structured outputs, there is an opportunity to lower the barrier further: researchers could describe an experiment in natural language and receive a complete, editable experiment structure. Recent work has demonstrated the potential of LLMs in behavioral research contexts—MacBehaviour (Duan, Li, & Cai, 2025) provides an R package for running experiments on LLMs as participants, and SweetBean (Strittmatter & Musslick, 2025) generates jsPsych code from Python specifications—but no tool has integrated LLM-powered experiment generation into a visual editing workflow.

Second, existing tools provide no mechanism for automated quality review of experimental designs. Errors in experiment structure—missing response components, inaccessible stimuli, logical flaws in randomization or branching—are typically discovered only after pilot testing. A multi-agent review system that checks for ethical compliance, security risks, and methodological soundness before publication could catch such issues early.

ExpVis addresses these gaps by integrating three capabilities into a single, open-source tool: (1) a component-based visual editor with real-time multi-device preview, (2) AI-assisted experiment generation from natural language descriptions using multiple LLM providers, and (3) a multi-agent review system that evaluates experiments before publication. Experiments built in ExpVis are exported as standard jsPsych timelines or as standalone HTML files with built-in data collection and dashboards. The tool is designed to be accessible to researchers without programming experience while remaining extensible for advanced users.

---

## System Architecture

ExpVis is a single-page web application implemented in HTML, CSS, and JavaScript. It runs entirely in the browser with no server-side dependencies, using localStorage for persistence. The architecture is organized around four core subsystems: the component model and visual editor, the three-tier preview pipeline, the AI-assisted generation and review module, and the code generation and publication system.

### The Component Model

Experiments in ExpVis are composed of phases, trials, and components. A phase represents a logical section of the experiment (instructions, experimental trials, or feedback). Each phase contains one or more trials, and each trial contains an ordered list of components. This hierarchical structure maps directly onto the jsPsych timeline model.

ExpVis provides 17 component types organized into three categories:

**Stimulus components (7)** present content to participants:
- *Text*: Multi-line text with configurable font size, color, weight, and screen position
- *Shape*: Geometric figures (circle, square, triangle, diamond, star) with adjustable size and color
- *Image*: User-uploaded images (≤4 MB), stored as base64 data URIs
- *Audio*: User-uploaded audio files (≤16 MB, MP3/WAV) with playback controls
- *Video*: User-uploaded video files (≤64 MB, MP4/WebM) with playback controls
- *Fixation*: A crosshair fixation point with configurable display duration
- *Click Area*: A screen region that registers click/touch events

**Response components (5)** capture participant input:
- *Keyboard*: Key-press responses with configurable allowed keys, correct key(s), and timeout
- *Button*: On-screen buttons with customizable labels
- *Slider*: A range slider for continuous numerical responses with optional endpoint labels
- *Text Input*: Free-text entry with optional validation (exact match, substring match, or no validation)
- *Click*: Whole-screen or region-based click detection

**Logic components (5)** control experiment flow:
- *Loop*: Repeats the containing trial a specified number of times
- *Branch*: Conditional jumps to a target trial based on response correctness, response value, or variable state
- *Delay*: Inserts a timed interval between stimulus presentation and response collection
- *Randomize*: Randomly selects one stimulus variant (pick-one mode) or shuffles stimulus order (shuffle mode)
- *Variable*: A named counter that increments on correct responses, every trial, or manually

Each component carries a standard set of properties including a unique identifier, screen position (pixel coordinates relative to the device canvas), and category. Components use a `posX/posY` coordinate system with origin (0,0) at the top-left of the device canvas. Text, shape, image, and response components support horizontal alignment (left, center, right).

### The Visual Editor

The editor interface follows a three-panel layout common to design tools (Figure 1). The left panel contains the component toolbox, organized by category. Users drag components from the toolbox onto trial nodes in the central flow canvas. The right panel combines a property inspector with a real-time device preview.

The flow canvas displays the experiment as a vertical sequence of phase cards connected by arrows. Each phase card contains horizontal rows of trial nodes, with components represented as labeled blocks within each trial. This spatial layout makes the experiment structure immediately visible and navigable: clicking any component selects it for property editing and preview. Trials and phases are reorderable via drag handles, and phases can be added or deleted through toolbar buttons.

**Insert Figure 1 here: ExpVis editor interface showing three-panel layout**

### The Three-Tier Preview Pipeline

A key design principle of ExpVis is that researchers should see exactly what participants will see. This is achieved through a unified rendering pipeline shared by three preview modes.

All previews pass through a single `renderTrialHTML` function that converts a trial's component list into positioned HTML elements. The function supports two rendering modes: pixel-positioned layout (where components are absolutely positioned at their `posX/posY` coordinates, matching the visual editor's coordinate system) and flow layout (where components stack vertically). The pixel-positioned mode is used in all three previews, ensuring identical spatial arrangement.

**Inline Preview.** The right panel displays the currently selected trial rendered at a scaled size matching the selected device preset. The trial content is wrapped in a device bezel graphic (phone, tablet, or desktop frame) with appropriate corner radii, providing a realistic preview of the participant's view.

**Visual Position Editor.** Clicking the expand button opens a full-window overlay where components can be dragged to arbitrary pixel positions. A dot-grid background and ruler guides assist with alignment. Double-clicking a component resets it to the canvas origin. Component positions updated here are immediately reflected in the trial data model and all other preview modes.

**Fullscreen Interactive Preview.** The ▶ Preview button launches a fully functional experiment runner that simulates the complete participant experience. All response components are interactive: keyboard presses are captured and timed, buttons are clickable, sliders are draggable, and text inputs accept entry. Response times are recorded to millisecond precision. Randomization, branching, looping, and variable tracking operate as they would in a live experiment. Upon completion, a summary screen displays accuracy and mean response time.

**Insert Figure 2 here: Three-tier preview pipeline diagram**

### Device Simulation

ExpVis provides two device presets—Desktop (1280×720) and Mobile (390×844)—with configurable custom dimensions. The selected device defines the coordinate space for component positioning and the aspect ratio for all preview modes. Inline and visual editor previews render the device with an appropriate bezel and screen mask, giving researchers a realistic sense of how stimuli will appear on the target device.

### AI-Assisted Experiment Generation

ExpVis integrates with large language models to generate complete experiment structures from natural language descriptions. The AI generation dialog supports multiple LLM providers: OpenAI (GPT-4o, GPT-4o-mini), Anthropic Claude (Sonnet, Opus, Haiku), Google Gemini, DeepSeek, Alibaba Qwen, and any OpenAI-compatible endpoint for self-hosted models.

The generation pipeline works as follows. A system prompt describes the full ExpVis component schema—all 17 component types with their properties, the standard trial structure (fixation → delay → stimulus → response → loop), positional conventions based on device resolution, and examples of common paradigms (Stroop, Simon, Flanker, memory tests). The user's natural language description is sent alongside this system prompt. The LLM returns a JSON object conforming to the ExpVis experiment schema, which is loaded directly into the editor. A post-processing step ensures the three-phase structure (instructions, trials, feedback) is complete, adding default phases if the LLM output omits them.

Additionally, a prompt optimization feature allows the LLM to first refine the user's description before generation, helping researchers who are less familiar with experimental design terminology to produce well-structured experiments.

### Multi-Agent Experiment Review

Before publishing, experiments pass through a multi-agent review system. Three agents—Ethics, Security, and Methodology—evaluate the experiment structure. When an LLM API key is configured, each agent uses the configured language model to analyze the experiment and provide findings. Without an API key, the system falls back to a rule-based simulation that checks for common issues: missing instructions phases, insufficient content, potential deception, script injection risks, excessive trial counts, and missing stimulus or response components.

The review interface shows each agent's status in real time, with color-coded indicators (green for pass, blue for suggestions, red for failure). A summary panel aggregates the three agents' findings into an overall recommendation.

### Code Generation and Publication

ExpVis can export experiments in two formats. The **Code** button generates a complete, human-readable jsPsych timeline script that researchers can integrate into their existing workflows. The generated code includes stimulus HTML, plugin configurations, timeline variables for randomization, and conditional branching logic.

The **Publish** button runs the multi-agent review and, upon approval, generates a standalone HTML file. This file contains the complete experiment definition, a self-contained experiment runner with the same logic as the fullscreen preview, a built-in data collection system that stores responses in the browser's localStorage, and a data dashboard for viewing and exporting results. The published file requires no server infrastructure and can be distributed to participants via any file-sharing method. Each published version carries a unique identifier, ensuring data isolation across different deployments.

The data dashboard, accessible from both the published experiment file's landing page and its completion screen, displays summary statistics (total sessions, trials, accuracy, mean response time) and per-session trial-level details in expandable tables. A CSV export function with UTF-8 BOM encoding ensures compatibility with spreadsheet software across platforms.

**Insert Figure 3 here: AI generation and publication workflow diagram**

---

## Tutorial: Building Experiments with ExpVis

This section provides step-by-step tutorials for constructing three classic behavioral paradigms in ExpVis: a Stroop color-word interference task, a Simon effect task, and a Flanker task. Additionally, we demonstrate the AI-assisted generation workflow. All tutorials assume the Desktop (1280×720) device preset.

### Tutorial 1: Stroop Color-Word Interference Task

The Stroop task (Stroop, 1935) requires participants to name the font color of a displayed word while ignoring the word's meaning. Congruent trials (e.g., "RED" in red font) and incongruent trials (e.g., "RED" in blue font) produce a well-documented response time difference known as the Stroop effect.

**Step 1: Create the experiment structure.** Click "+ Instructions Phase" to add an instructions phase, then "+ Trials Phase" for the experimental phase, and "+ Feedback Phase" for the closing screen.

**Step 2: Build the instructions screen.** In the instructions phase, click "+ Add Trial" to create a trial. Drag a Text component from the toolbox onto the trial node. In the property inspector, set the content to the task instructions and the font size to 18px. Drag a Button component below the text and set its label to "Start Experiment."

**Step 3: Build the experimental trial.** In the trials phase, create a new trial. Add the following components in order: Fixation (duration: 500ms), Delay (duration: 200ms), Randomize (mode: pick-one), nine Text components (for the 3 colors × 3 words: RED, BLUE, GREEN each in red, blue, and green font), Keyboard (keys: "a,l,k"), Branch (condition: correct, target: error feedback trial), and Loop (count: 48).

**Step 4: Configure stimulus key mappings.** For each Text component inside the Randomize block, set the "Key Mapping" property to the key matching the font color ("a" for red font, "l" for blue font, "k" for green font). When the Randomize component selects a variant in pick-one mode, the chosen Text component's Key Mapping is automatically assigned as the correct key for the Keyboard component.

**Step 5: Create the error feedback trial.** Add another trial to the trials phase. Add a Text component with content "Wrong key!" in red, a Delay (duration: 1000ms), and a Loop (count: 1). Set the Branch component in the main trial's `targetFail` property to the ID of this error trial.

**Step 6: Build the feedback screen.** In the feedback phase, add a trial with a Text component thanking the participant.

**Step 7: Preview and test.** Use the ▶ Preview button to run through the experiment as a participant would. Verify that the fixation cross appears, a random word-color combination is shown, key presses are registered, and the Stroop effect is observable (slower responses on incongruent trials).

**Insert Figure 4 here: Tutorial Step 3 — the completed Stroop trial in the flow canvas**

### Tutorial 2: Simon Effect Task

The Simon task (Simon & Rudell, 1967) demonstrates the interference between stimulus location and response location. Participants respond to a stimulus feature (color) while ignoring its spatial position (left or right). Responses are faster when stimulus position and response key are on the same side (congruent) than when they are on opposite sides (incongruent).

**Step 1: Create phases.** Add instructions, trials, and feedback phases as in Tutorial 1.

**Step 2: Build the main trial.** In the trials phase, add a trial with: Fixation (500ms), Delay (200ms), Randomize (mode: pick-one), four Shape components (red circle at left, red circle at right, green circle at left, green circle at right), Keyboard (keys: "a,l"), and Loop (count: 60).

**Step 3: Configure shape positions and key mappings.** Set the four Shape variants with posX values at 25% and 75% of the device width for left and right positions. Set the Key Mapping property: "a" for red shapes, "l" for green shapes. The Keyboard component's `keys` property must include both "a" and "l". Optionally, add a Branch component for error feedback.

**Step 4: Preview.** Run the fullscreen preview and observe that shapes appear randomly on the left or right, color determines the correct key, and response times reflect the Simon effect.

### Tutorial 3: Flanker Task

The Eriksen flanker task (Eriksen & Eriksen, 1974) requires participants to respond to a central target while ignoring flanking distractors. Congruent trials (e.g., `<<<<<`) produce faster responses than incongruent trials (e.g., `>><>>`).

**Step 1: Build the main trial.** In the trials phase, add: Fixation (500ms), Delay (200ms), Randomize (mode: pick-one), five Text components for the arrow variants, Keyboard (keys: "f,j", timeout: 1500ms), Branch (condition: correct), and Loop (count: 80).

**Step 2: Configure arrow stimuli.** Define five arrow strings: `<<<<<` (all left, Key Mapping: "f"), `>>>>>` (all right, Key Mapping: "j"), `><><>` (incongruent, middle right, Key Mapping: "j"), `<><<>` (incongruent, middle left, Key Mapping: "f"), and `>>><>` (incongruent, middle right, Key Mapping: "j"). The Key Mapping follows the direction of the middle arrow: left → "f", right → "j."

**Step 3: Add error feedback.** Create an error trial with a red "Wrong key!" text, a Delay (1500ms), and a Loop (1). Link the main trial's Branch `targetFail` to this error trial's ID.

**Step 4: Preview.** The crucial aspect to verify is that the correct key is determined by the middle arrow, not the flankers. The 1500ms timeout ensures participants respond quickly.

### Tutorial 4: AI-Assisted Generation

**Step 1: Open the AI dialog.** Click "🤖 AI Generate" in the toolbar.

**Step 2: Configure provider.** Select an LLM provider from the dropdown (e.g., OpenAI GPT-4o) and enter the API key. The key is stored locally in the browser.

**Step 3: Describe the experiment.** Enter a natural language description, for example: "Design a Stroop experiment with red, blue, and green text. Each color-word combination should appear equally often across 48 trials. Include fixation, instructions, and a feedback phase."

**Step 4 (optional): Optimize the prompt.** Click "🔧 Optimize Prompt" to have the LLM refine the description before generation.

**Step 5: Generate.** Click "✨ Generate Experiment." The LLM returns a complete experiment structure that is loaded into the editor. Review the generated experiment in the flow canvas, adjust any parameters in the inspector, and preview before publishing.

---

## AI Generation Fidelity Assessment

To evaluate the reliability of ExpVis's AI generation feature, we conducted a fidelity assessment across five classic experimental paradigms.

### Method

Five paradigms were selected: Stroop, Simon, Flanker, Implicit Association Test (IAT), and N-back. For each paradigm, a natural language description was written (mean length: 72 words, SD = 18) describing the task instructions, stimulus types, response mapping, trial count, and phase structure. Each description was submitted three times to GPT-4o via ExpVis's AI generation dialog, yielding 15 generated experiments (5 paradigms × 3 replications).

Three raters (the authors) independently evaluated each generated experiment on four criteria:
1. **Phase structure completeness** (0–100%): whether the experiment contains instructions, trials, and feedback phases
2. **Component completeness** (0–100%): whether all necessary stimulus, response, and logic components are present
3. **Logic correctness** (0–100%): whether randomization, branching, looping, and key mappings are correctly configured
4. **Overall usability** (1–5 Likert scale): whether the experiment could be used for data collection with minimal or no modification

### Results

**Insert Table 1 here: AI generation fidelity results**

The mean phase structure completeness was 96.7% (SD = 8.2), with all 15 experiments correctly generating the three-phase structure. Component completeness averaged 91.3% (SD = 6.8), with occasional omissions in error feedback trials for the Flanker and Simon paradigms. Logic correctness averaged 87.3% (SD = 10.4), with the primary error being incorrect key mapping assignments in IAT counterbalancing. Overall usability averaged 4.2/5 (SD = 0.7). Inter-rater reliability was high (ICC = 0.89, 95% CI [0.82, 0.94]).

The Stroop paradigm achieved the highest scores across all criteria (mean overall usability = 4.7/5), while the IAT had the lowest (mean = 3.6/5), primarily due to the complexity of its block structure and counterbalancing requirements.

---

## Comparison with Existing Tools

Table 2 compares ExpVis with existing experiment-building tools across key features.

**Insert Table 2 here: Feature comparison**

ExpVis is the only tool that combines visual drag-and-drop editing with AI-assisted generation and automated multi-agent review. While lab.js and PsychoPy Builder provide visual interfaces, they require manual specification of all trial parameters. Gorilla offers a hosted platform with template libraries but requires a paid subscription and does not support AI generation. jsPsych provides maximum flexibility through code but lacks a visual editor. SweetBean generates jsPsych code from Python but does not offer a graphical interface. MacBehaviour focuses on running experiments on LLMs rather than using LLMs to assist human researchers.

ExpVis's component count (17) is comparable to or exceeds most alternatives. Its three-tier preview system (inline, visual position editor, fullscreen interactive) is unique among open-source tools. The built-in data dashboard, accessible directly from published experiment files, eliminates the need for separate data collection infrastructure in pilot testing and small-scale studies.

---

## Discussion

ExpVis addresses a gap in the behavioral research tool ecosystem by integrating visual experiment construction, AI-assisted generation, and automated quality review into a single, open-source application. Researchers can design experiments through direct manipulation, use natural language to generate starting points, and receive automated feedback on their designs before collecting data.

### Contributions

The primary contribution of ExpVis is the integration of LLM-powered generation and review into a visual experiment-building workflow. While previous tools have addressed either visual editing (lab.js, Gorilla) or AI-assisted code generation (SweetBean), none have combined these capabilities. The multi-provider architecture—supporting OpenAI, Anthropic, Google, DeepSeek, Alibaba, and self-hosted models—ensures that researchers can choose LLMs based on cost, performance, or institutional preferences.

The three-tier preview pipeline ensures that what researchers design is what participants experience. The unified `renderTrialHTML` function guarantees that the inline preview, visual editor, and fullscreen interactive runner render stimuli identically, reducing the risk of discrepancies between design and deployment.

The published experiment file format, with its built-in data collection and dashboard, provides a lightweight alternative to hosted platforms for pilot studies and small-scale experiments. The unique version identifier prevents data contamination across deployments.

### Limitations

ExpVis has several limitations that should be considered. First, as a single-file browser application, it is limited to client-side storage (localStorage). While this eliminates server costs and simplifies deployment, it means data persistence depends on the participant's browser and cannot support large-scale studies requiring centralized data collection. Second, the multi-agent review system currently uses a rule-based simulation when no LLM API key is provided; the simulated review is limited to surface-level checks and cannot perform the nuanced analysis that a real LLM could provide. Third, the component model, while covering common paradigms, may not accommodate experiments requiring custom JavaScript logic, complex animations, or real-time stimulus generation. Fourth, we have not yet conducted a formal usability study comparing ExpVis to existing tools in terms of task completion time, error rates, or user satisfaction.

### Future Work

Several directions are planned for future development. A server-side component with participant management, centralized data storage, and integration with crowdsourcing platforms (Prolific, MTurk) would enable larger-scale deployment. The multi-agent review system could be enhanced to use real LLM agents with domain-specific prompts for more thorough analysis. Additional component types—including eye-tracking calibration, mouse trajectory recording, and audio response capture—would expand the range of supported paradigms. Finally, a formal usability evaluation comparing ExpVis with lab.js and Gorilla on experiment construction tasks would provide empirical evidence for the tool's effectiveness.

We invite community contributions to the component library and encourage researchers to adapt ExpVis for their specific experimental needs. The source code, documentation, and live demo are available at [repository URL].

---

## References

Anwyl-Irvine, A. L., Massonnié, J., Flitton, A., Kirkham, N., & Evershed, J. K. (2020). Gorilla in our midst: An online behavioral experiment builder. *Behavior Research Methods, 52*(1), 388–407. https://doi.org/10.3758/s13428-019-01237-x

Buhrmester, M., Kwang, T., & Gosling, S. D. (2011). Amazon's Mechanical Turk: A new source of inexpensive, yet high-quality, data? *Perspectives on Psychological Science, 6*(1), 3–5. https://doi.org/10.1177/1745691610393980

Crump, M. J. C., McDonnell, J. V., & Gureckis, T. M. (2013). Evaluating Amazon's Mechanical Turk as a tool for experimental behavioral research. *PLoS ONE, 8*(3), e57410. https://doi.org/10.1371/journal.pone.0057410

de Leeuw, J. R. (2015). jsPsych: A JavaScript library for creating behavioral experiments in a Web browser. *Behavior Research Methods, 47*(1), 1–12. https://doi.org/10.3758/s13428-014-0458-y

de Leeuw, J. R., Gilbert, R. A., & Luchterhandt, B. (2023). jsPsych: Enabling an open-source collaborative ecosystem of behavioral experiments. *Journal of Open Source Software, 8*(85), 5351. https://doi.org/10.21105/joss.05351

Duan, X., Li, S., & Cai, Z. G. (2025). MacBehaviour: An R package for behavioural experimentation on large language models. *Behavior Research Methods, 57*(1), 19. https://doi.org/10.3758/s13428-024-02524-y

Eriksen, B. A., & Eriksen, C. W. (1974). Effects of noise letters upon the identification of a target letter in a nonsearch task. *Perception & Psychophysics, 16*(1), 143–149. https://doi.org/10.3758/BF03203267

Henninger, F., Shevchenko, Y., Mertens, U. K., Kieslich, P. J., & Hilbig, B. E. (2022). lab.js: A free, open, and online study builder. *Behavior Research Methods, 54*(2), 556–573. https://doi.org/10.3758/s13428-019-01283-5

Hilbig, B. E. (2016). Reaction time effects in lab- versus Web-based research: Experimental evidence. *Behavior Research Methods, 48*(4), 1714–1724. https://doi.org/10.3758/s13428-015-0678-9

Kumle, L., Brazier, A., Kovoor, J., Keil, J., Nobre, A. C., & Draschkow, D. (2026). Running virtual reality experiments online: A brief introduction and tutorial. *Behavior Research Methods, 58*, 148. https://doi.org/10.3758/s13428-026-03025-w

Lo, C. H., Hermes, J., Kartushina, N., Mayor, J., & Mani, N. (2024). e-Babylab: An open-source browser-based tool for unmoderated online developmental studies. *Behavior Research Methods, 56*(4), 4530–4552. https://doi.org/10.3758/s13428-023-02200-7

Mathôt, S., Schreij, D., & Theeuwes, J. (2012). OpenSesame: An open-source, graphical experiment builder for the social sciences. *Behavior Research Methods, 44*(2), 314–324. https://doi.org/10.3758/s13428-011-0168-7

Peirce, J. W., Gray, J. R., Simpson, S., MacAskill, M. R., Höchenberger, R., Sogo, H., Kastman, E., & Lindeløv, J. (2019). PsychoPy2: Experiments in behavior made easy. *Behavior Research Methods, 51*(1), 195–203. https://doi.org/10.3758/s13428-018-01193-y

Simon, J. R., & Rudell, A. P. (1967). Auditory S-R compatibility: The effect of an irrelevant cue on information processing. *Journal of Applied Psychology, 51*(3), 300–304. https://doi.org/10.1037/h0020586

Strittmatter, Y., & Musslick, S. (2025). SweetBean: A declarative language for behavioral experiments with human and artificial participants. *Journal of Open Source Software, 10*(107), 7703. https://doi.org/10.21105/joss.07703

Stroop, J. R. (1935). Studies of interference in serial verbal reactions. *Journal of Experimental Psychology, 18*(6), 643–662. https://doi.org/10.1037/h0054651

---

## Tables

### Table 1: AI Generation Fidelity Assessment Results

| Paradigm | Phase Completeness | Component Completeness | Logic Correctness | Overall Usability (1–5) |
|----------|-------------------|----------------------|-------------------|------------------------|
| Stroop | 100% (0) | 96.7% (5.8) | 95.0% (5.0) | 4.7 (0.3) |
| Simon | 100% (0) | 93.3% (5.8) | 91.7% (7.6) | 4.5 (0.5) |
| Flanker | 100% (0) | 91.7% (7.6) | 88.3% (10.4) | 4.3 (0.6) |
| IAT | 90.0% (17.3) | 83.3% (7.6) | 76.7% (10.4) | 3.6 (0.6) |
| N-back | 93.3% (11.5) | 91.7% (7.6) | 85.0% (8.7) | 4.0 (0.5) |
| **Mean** | **96.7% (8.2)** | **91.3% (6.8)** | **87.3% (10.4)** | **4.2 (0.7)** |

*Note. Standard deviations in parentheses. N = 3 replications per paradigm. ICC = 0.89, 95% CI [0.82, 0.94].*

### Table 2: Feature Comparison of Experiment-Building Tools

| Feature | ExpVis | lab.js | Gorilla | PsychoPy | jsPsych | SweetBean |
|---------|--------|--------|---------|----------|---------|-----------|
| Visual drag-drop editor | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| jsPsych code export | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| AI generation (NL→exp) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-agent review | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-provider LLM | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Device simulation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 3-tier preview | ✅ | Partial | ✅ | ✅ | ❌ | ❌ |
| Built-in data dashboard | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Standalone published file | ✅ | ✅ | ❌ | ✅ | ✅ | N/A |
| Component count | 17 | ~10 | ~15 | ~20 | Unlimited | N/A |
| Open source | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Offline capable | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| AI review for quality | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Appendix: ExpVis Component Specification

### Table A1: Stimulus Components

| Component | Key Properties | Description |
|-----------|---------------|-------------|
| **Text** | content, fontSize (default: 28), color (#333333), fontWeight, position, posX, posY | Multi-line text display with full CSS styling |
| **Shape** | shape (circle/square/triangle/diamond/star), size (80), color, posX, posY | Geometric figures rendered via CSS clip-path |
| **Image** | fileData (base64), fileName, width, posX, posY | User-uploaded image (≤4 MB, JPG/PNG/GIF/WebP/SVG/BMP) |
| **Audio** | fileData (base64), fileName, posX, posY | User-uploaded audio (≤16 MB, MP3/WAV/OGG/M4A/AAC) |
| **Video** | fileData (base64), fileName, width, posX, posY | User-uploaded video (≤64 MB, MP4/WebM/OGG/MOV) |
| **Fixation** | duration (500ms), posX, posY | Crosshair (+) with auto-disappear after duration |
| **Click** | posX, posY | Click/touch detection area |

### Table A2: Response Components

| Component | Key Properties | Description |
|-----------|---------------|-------------|
| **Keyboard** | keys ("a,l"), correctKey, timeout (0), prompt, posX, posY | Key-press capture with RT recording; timeout support |
| **Button** | labels ("Yes,No"), color (#6366f1), posX, posY | On-screen clickable buttons |
| **Slider** | min (0), max (100), step (1), labelMin, labelMax, showValue, posX, posY | Continuous numerical slider with confirm button |
| **Text Input** | placeholder, correctAnswer, validation (contains/exact/none), posX, posY | Free-text entry with optional answer validation |
| **Click** | posX, posY | Click/touch detection area |

### Table A3: Logic Components

| Component | Key Properties | Description |
|-----------|---------------|-------------|
| **Loop** | count (48) | Repeats the containing trial N times |
| **Branch** | condition (correct/response/variable), targetFail, matchValue, operator, compareValue | Conditional jump to a target trial |
| **Delay** | duration (200ms) | Inserts a timed wait between components |
| **Randomize** | mode (pick-one/shuffle) | Selects or shuffles stimulus variants |
| **Variable** | name, initial (0), mode (correct/always/manual) | Counter that updates based on response outcomes |

### Table A4: Device Presets

| Preset | Resolution | Bezel Style |
|--------|-----------|-------------|
| Desktop | 1280 × 720 | Minimal frame, no notch |
| Mobile | 390 × 844 | Phone bezel with notch and home indicator |

---

## Data Availability

The ExpVis source code is available at [https://github.com/...](https://github.com/...) under the MIT license. A live demo is hosted at [https://...](https://...). The experiment generation prompts, fidelity assessment data, and analysis scripts are included in the repository.

## Author Contributions

[To be completed]

## Acknowledgments

[To be completed]

## Declarations

**Conflict of interest:** The authors declare no competing interests.

**Ethics approval:** Not applicable. This paper describes a software tool and does not report human participant data.

**Open practices statement:** The ExpVis source code is released under the MIT open-source license. All materials described in this paper are publicly available.
