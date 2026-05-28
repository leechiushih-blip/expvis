# AI Generation Fidelity Assessment — Rating Rubric

This document describes the structured scoring rubric used by the three raters in the fidelity assessment reported in the paper.

## Rater Instructions

For each AI-generated experiment, evaluate the experiment structure against the following four criteria. The experiment is presented as a JSON object loaded in the ExpVis editor. You may inspect the experiment in the flow canvas, property inspector, and fullscreen preview before assigning scores.

## Criterion 1: Phase Structure Completeness (0–100%)

Does the experiment contain all required phases? Are phases correctly typed and ordered?

| Score | Description |
|-------|-------------|
| 100% | All three phases present (instructions, trials, feedback), correctly typed, in correct order |
| 80% | Three phases present but one misnamed or missing type annotation |
| 60% | Only two phases present |
| 40% | Only one phase present |
| 0% | No phases or completely unstructured |

## Criterion 2: Component Completeness (0–100%)

Are all necessary stimulus, response, and logic components present? Are component properties correctly set?

| Score | Description |
|-------|-------------|
| 100% | All required components present with correct property values |
| 80% | All core components present; minor property errors (e.g., suboptimal font size) |
| 60% | One major component missing (e.g., no response component in a trial) |
| 40% | Multiple components missing or major property errors |
| 0% | Incomplete or unusable |

## Criterion 3: Logic Correctness (0–100%)

Are randomization, branching, looping, and key mappings correctly configured?

| Score | Description |
|-------|-------------|
| 100% | All logic components correctly configured; key mappings match stimuli; branch targets valid; loop counts appropriate |
| 80% | Logic mostly correct; minor issue (e.g., branch condition type suboptimal) |
| 60% | One logic error (e.g., missing key mapping on some variants, incorrect branch target) |
| 40% | Multiple logic errors that would affect data quality |
| 0% | Logic fundamentally broken |

## Criterion 4: Overall Usability (1–5 Likert scale)

Could this experiment be used for data collection with no or minimal modification?

| Score | Description |
|-------|-------------|
| 5 | Ready to use as-is; no modifications needed |
| 4 | Minor adjustments only (e.g., tweak font size, add instructions detail) |
| 3 | Moderate adjustments needed (e.g., fix one logic component, add missing trial) |
| 2 | Major adjustments needed (e.g., restructure phases, fix multiple logic errors) |
| 1 | Requires complete reconstruction |

## Scoring Procedure

1. Load the generated experiment JSON into ExpVis by pasting into the browser console
2. Inspect the flow canvas for phase and trial structure
3. Click through components to verify property values in the inspector
4. Run the fullscreen preview to test interaction logic
5. Record scores for each criterion on the scoring sheet

## Notes

- If the experiment JSON fails to parse, all scores are 0
- If the experiment loads but the fullscreen preview crashes, Overall Usability is capped at 2
- Raters should score independently without discussion
