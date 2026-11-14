# EE271 Project Part 3 report (draft)

> Due Tue Dec 1 (Prof. Tambe on Ed #207; the handout says Dec 4: submit by Dec 1). No late days on Part 3.
> The handout asks for exactly these items: (1) a short description of each optimization, (2) how it changed the FoM
> (% improvement), (3) a short reflection on why, (4) the final FoM, (5) a 1-page reflection on AI use.
> Write each section the day the experiment runs (numbers from docs/experiments.md / runs/<tag>/).

**Team:** Ryan McCormick, <partner>  ·  **Final FoM:** ...  (baseline ...; ... % better overall)

## Figure of merit

FoM = (T_int8 + T_int16 + T_int32)^2.3 · Area (µm²) · Power (mW) · 1e-15, T = cycles × clock period in ns. Our
measurement method: area = DC "Total cell area", power = total (dynamic + leakage) from `report_power`, cycles from
the VCS equivalence tests, period = the one we synthesized at with no timing violations. (Adjust if staff say otherwise.)

## Baseline (the Part 2 design)

| PEs | Period | Cycles (int8 / int16 / int32) | Area | Power | Slack | FoM |
|---|---|---|---|---|---|---|
| 16 | 2.0 ns | 16,440 / 8,248 / 4,152 | | | | |

## Optimizations

One subsection per optimization, in the order we applied them.

### 1. <name>
- **What we did:** ...
- **FoM:** before ... → after ... (**...% improvement**; cycles ..., area ..., power ..., period ...)
- **Why it changed the way it did:** ...

## Final design

| PEs | Period | Cycles (int8 / int16 / int32) | Area | Power | Slack | FoM |
|---|---|---|---|---|---|---|
| | | | | | | |

## Reflection on AI use (1 page)

Material is collected in `docs/ai-log.md`. Cover: what we used AI for (tooling, explainers, debugging, code?),
what worked, what didn't, what we verified ourselves and how, and what we'd do differently.
