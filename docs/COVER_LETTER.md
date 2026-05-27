# Cover Letter

Dear Editor,

We are pleased to submit our manuscript entitled **"ExpVis: A Visual, AI-Assisted Experiment Builder for Web-Based Behavioral Research"** for consideration as a Tutorial article in *Behavior Research Methods*.

**Why this manuscript fits BRM.** BRM has a strong tradition of publishing tool papers that advance behavioral research methodology—from jsPsych (de Leeuw, 2015) to lab.js (Henninger et al., 2022). Our manuscript follows this tradition by introducing a free, open-source experiment builder that combines three capabilities not previously integrated: (1) component-based visual experiment construction, (2) AI-assisted generation from natural language descriptions across multiple LLM providers, and (3) automated multi-agent quality review. We believe this integration addresses a genuine need in the behavioral research community, particularly for researchers and students who lack programming expertise but wish to create sophisticated online experiments.

**Key contributions.**
- A 17-component visual editor with a novel three-tier preview pipeline (inline preview → visual position editor → fullscreen interactive runner) that guarantees stimulus layout consistency from design to deployment
- AI-assisted generation supporting six LLM providers (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Alibaba Qwen, and custom OpenAI-compatible endpoints), with a fidelity assessment across five classic paradigms demonstrating 91.3% component completeness
- A multi-agent review system (Ethics, Security, Methodology) for pre-publication quality control
- Standard jsPsych code export and one-click generation of standalone experiment files with built-in data collection and dashboards
- Device simulation and pixel-level visual editing not available in comparable open-source tools

**Relationship to existing work.** ExpVis builds on the foundations laid by jsPsych (code generation target), lab.js (visual editing paradigm), and recent AI-integration work (MacBehaviour, SweetBean). A detailed feature comparison table (Table 2) distinguishes ExpVis from these prior tools.

**Open science.** The complete source code is publicly available under the MIT license at https://github.com/leechiushih-blip/expvis, with a live demo at https://leechiushih-blip.github.io/expvis/. All experiment generation prompts, fidelity assessment data, and tutorials are included in the repository.

**Suggested reviewers.**
- Dr. Felix Henninger (University of Mannheim) — lead author of lab.js
- Dr. Joshua de Leeuw (Vassar College) — creator of jsPsych
- Dr. Alexander Anwyl-Irvine (University of Cambridge) — lead author of Gorilla

We confirm that this manuscript has not been published elsewhere and is not under consideration by another journal. All authors have approved the manuscript and agree with its submission to *Behavior Research Methods*.

Thank you for considering our submission. We look forward to your response.

Sincerely,
[Author names]
