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

## 2026-11-18: Ryan, Claude Code (Claude Opus 5.5)
- Asked for: a structured, beginner-level path through his share of Part 2 (buffer, controller, `top.sv`) that works in
  short gaps of time, without the AI writing the RTL.
- Got: `docs/part2-sittings.html`, 16 sittings of about 10–25 minutes each. Each one says what to read, what to type (in
  words, plus generic SystemVerilog idioms), the command to run, the output to expect, the usual wrong output and what
  it means, and a commit. Three sittings work on a phone. It links into `docs/part2-rtl.html` for depth.
- How it was checked: every "You should see" block was captured by running `make buf-unit`, `make ctl-check` and
  `make eq` on partial designs built in the AI's scratch space, outside the repo: buffer in 4 stages, controller in 4,
  `top.sv` with an empty PE and with a working one, plus two deliberately wrong variants for the "If instead" boxes.
  Checked for horizontal overflow at phone width in Firefox. The caddy sittings have not been run.
- Not done by AI: the RTL. `buffer.sv`, `controller.sv` and `top.sv` are still the staff skeletons. The page describes
  each piece in words and leaves the code to Ryan; the two "Hint 2" boxes are the most specific part.

## 2026-11-18 (later): Ryan, Claude Code (Claude Opus 5.5)
- Asked for: a Claude chat built into the sittings page, as a local app.
- Got: `make tutor` → `scripts/tutor/server.py` (standard-library Python) serves `docs/` on `127.0.0.1:8271` and runs
  Claude Code headless (`claude -p`) with his existing login for each message, so no API key is needed. The page
  has an **Ask Claude** button on every sitting. The button attaches that sitting's text, and quick buttons offer
  *Explain an error*, *Smallest hint*, *Look at my code*, *Check my Explain-it answer* and *Quiz me*. Claude gets
  read-only tools (Read, Grep, Glob) in the repo, no MCP servers, and the tutor rules in
  `scripts/tutor/system-prompt.md`: explain and hint, smallest hint first, never write the graded RTL. Each exchange
  is copied to `scratch/tutor-chats/` (git-ignored) as raw material for the AI reflection.
- How it was checked: two-turn chats through the server (it read `buffer.sv`, answered with `path:line`
  references, and declined "just write the line" with a hint); Stop kills the background process within a
  second (a first version kept it running while Claude thought; fixed); the chat continues after a stop; the
  Host and Origin guards reject other sites; the plain-file page shows how to start the app; layout checked at
  1440 px and 390 px.
- Also: the phone/AirDrop advice is gone from the page (Ryan isn't using his phone for this).

## 2026-11-18 (evening): Ryan, Claude Code (Claude Opus 5.5)
- Asked for: (1) the cycle-by-cycle simulation the sidebar chat couldn't build (a whole sample program, every
  clock cycle, the state of the memories and PEs, and reset); (2) full permissions for the sidebar agent, so it
  can edit the explainers, while keeping its instruction not to write RTL.
- Got: **Watch it run**, a new section after Sitting 1 of `docs/part2-sittings.html`. It steps through the
  recorded run of a working design (6×3 INT16, 2 PEs, 21 cycles from reset to done) from
  `docs/part2-rtl-src/waves.json`, embedded by `scripts/sittings_sim_data.py`. It shows a pipeline strip
  (memory half vs compute half per cycle), a plain-words account of each cycle, the program with markers, the
  controller registers, MEM0 drawn as the tiled matrix, MEM1, MEM2 filling in, both PEs' accumulators and
  outputs, and what each register becomes at the clock edge. Its "Ask about this cycle" button sends the chat
  the chip's state in the cycle on screen. The sidebar agent now runs with `bypassPermissions`. Its rules
  (`scripts/tutor/system-prompt.md`) still forbid creating or editing the four graded `.sv` files or giving
  paste-able RTL. When a turn changes a page, the chat offers Reload and reopens afterwards.
  `scripts/tutor/check_page.py` lets it (and us) check a page's scripts after an edit.
- How it was checked: the embed script cross-checks the recording against the program (owners of every
  half, MEM0/MEM1 contents, MEM2 = gold); all 21 cycles' explanations were read against the decoded signals
  (MAC sums, the WRITE landing one cycle late, the padding instruction); layout at 1440 px and 390 px. Through
  the page: the agent ran `make lint`, edited the page and ran the checker; Reload brought the chat back.
  The test edit was undone.
- Not done by AI: the RTL. The simulator shows a working design's signals, not its code. It does show the
  timing Sitting 9 asks you to predict, and says so.
