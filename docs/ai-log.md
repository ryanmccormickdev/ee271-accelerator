# AI use log

The final report (due Dec 1) needs a **one-page reflection on our AI use**: what worked and what
didn't (Ed #207). The oral quiz checks that we can explain everything, AI-assisted or not.
Add a short entry whenever an AI tool does something real, so the reflection writes itself.

Template:

```
## YYYY-MM-DD: who, which tool
- Asked for: ...
- Got: ...
- Worked / didn't: ...
- What we checked or changed ourselves: ...
```

---

## 2026-11-08: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: set up a shareable project repo and dev environment for part 1, plus an orientation tutorial.
- Got: this repo layout, the Makefile shortcuts and scripts, the VS Code config, `playground/tour.py`
  (a readable walkthrough that only uses the starter's compiler and assembler), `docs/tutorial.html`,
  and the spec checklist in `docs/spec-notes.md`.
- Not done by AI: no code in `src/processing_element.py`, `src/main_buffer.py` or `src/accelerator.py`. Those are ours.
- Worked / didn't: (fill in after using it)

## 2026-11-09: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: an animated, data-level walkthrough of the whole accelerator: what goes in at test scale, whether anything
  external is involved, and each component down to what part 1's code needs, plus a map from the starter code to the animation.
- Got: `docs/walkthrough.html`, built from `docs/walkthrough-src/`. It runs on a JavaScript model of the accelerator,
  which was checked against every public test and against the starter compiler's and assembler's real output. Also
  updated `docs/spec-notes.md` with the staff answer on Ed #221 (repetition order) and two gaps in the public tests.
- Not done by AI: still no code in the three `src` files. Note that `walkthrough-src/model.js` is a working model in
  JavaScript, so it's effectively a reference answer in another language.
- Worked / didn't: (fill in after using it)

## 2026-11-09 (later): Ryan, Claude Code (Claude Opus 5.5)
- Asked for: the code itself, highlighted block by block, with the matching explanation side by side, because mapping
  the concepts to this style of Python was the weak spot.
- Got: the walkthrough's "Read the code" tab. It shows all 9 starter files in 136 blocks, each with a note: what the
  block does, the handout passage or worked-example step it implements, real variable values recorded by running the
  given starter code (`trace_values.py`), and notes on reading the Python. There's also a call map of one test run and a
  Python primer.
- Not done by AI: still no code in the three `src` files. The notes for those say what the code must do, not the code.
- Worked / didn't: (fill in after using it)

## 2026-11-14 (overnight): Ryan, Claude Code (Claude Opus 5.5, several parallel agents)
- Asked for: pull Parts 2 and 3 from Canvas, architect how a pair should tackle them, explainers like Part 1's but about
  going from the Python model down to RTL, gates and PPA, and a work split designed around the individual oral exam.
- Got: the Part 2 starter imported as `part2/` (subtree, like Part 1); text copies of both handouts; `docs/PLAN.md`
  (timing contract, split, calendar, questions for staff); a local simulation flow (`scripts/rtl/`: equivalence tests in
  Icarus/Verilator with a mismatch explainer, stress tests, staff testbenches with waveforms, lint); per-module checks
  against the staff's Python reference (`verif/`: PE, controller, buffer); caddy wrappers for VCS and Design Compiler;
  an FoM calculator; experiment/decision/report templates; four explainer pages and oral-exam question banks
  (`docs/part2-rtl.html`, `synthesis.html`, `part3-ppa.html`, `oral-prep.html`).
- How the tooling was checked: the AI wrote a throwaway reference RTL **outside the repo** (in its session scratch
  space) only to prove the flow end to end. It passes all official and stress tests in both simulators. Deliberately
  broken copies (truncating OUT, early WRITE, live-mode lane select, controller bubbles, Count instead of Count+1)
  each make the right check fail with the right message.
- Found along the way: bitstring 5 breaks the staff `ivd-as`; a simulation race in the staff SRAM model that makes
  Verilator skip the first instruction; blind spots in the official tests; `ivd-as` silently truncating long programs.
  All are in `docs/spec-notes.md`.
- AI mistakes we caught: a first "fix" for the SRAM race (a non-blocking copy of `array.sv`) broke cen-gated designs,
  and two testbench sampling-point bugs hid real failures. Each was caught by cross-checking two simulators and
  testing the checks against known-bad designs. The lesson: test the tests.
- Also wrong: the overnight run said the Part 2/3 PDFs had to be downloaded by hand. They didn't; the next morning
  it fetched them through the Canvas API into `handouts/`.
- Not done by AI: none of `processing_element.sv`, `buffer.sv`, `controller.sv`, `top.sv` is written. The pages
  describe behavior and timing with diagrams and recorded waveforms, not solution code. The recorded waveforms and the
  cycle-level "timing contract" are effectively a reference for the timing (flagged on the pages).
- Worked / didn't: (fill in after using it)

## 2026-11-17: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: a briefing on how much work Part 2 still is for Ryan (controller + buffer, with `top.sv` shared), and to
  pull in the optional Part 4 so it's ready if we have time.
- Got: the time estimate (in chat); `part4/` imported from `simd-part4` (subtree, like Parts 1 and 2), the Part 4 PDF
  in `handouts/`, and a "Part 4 (optional)" section in `docs/PLAN.md`. Done on branch `part4-setup`.
- Not done by AI: no Part 2 RTL and no Part 4 TODOs. They are untouched staff skeletons.
